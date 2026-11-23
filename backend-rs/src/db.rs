use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::json;

use crate::models::{
    AuditLog, BrandKit, Deck, Organisation, SubscriptionQuota, UsageTelemetry,
};

pub const MULTI_TENANT_DDL: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS organisations (
        id TEXT PRIMARY KEY,
        name TEXT,
        tier TEXT,
        max_brands INTEGER,
        daily_deck_limit INTEGER,
        settings_json TEXT,
        updated_at TEXT
    )",
    "CREATE TABLE IF NOT EXISTS brand_kits (
        id TEXT,
        org_id TEXT,
        version INTEGER,
        name TEXT,
        spec_json TEXT,
        created_at TEXT,
        PRIMARY KEY (id, org_id, version)
    )",
    "CREATE TABLE IF NOT EXISTS decks (
        slug TEXT,
        org_id TEXT,
        version INTEGER,
        title TEXT,
        brand_kit_id TEXT,
        brand_kit_version INTEGER,
        deck_json TEXT,
        updated_at TEXT,
        PRIMARY KEY (slug, org_id)
    )",
    "CREATE TABLE IF NOT EXISTS usage_telemetry (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        deck_slug TEXT,
        operation TEXT,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_cost_usd REAL,
        render_ms INTEGER,
        created_at TEXT
    )",
    "CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        org_id TEXT,
        action TEXT,
        actor TEXT,
        target TEXT,
        detail TEXT,
        created_at TEXT
    )",
    "CREATE INDEX IF NOT EXISTS idx_brand_kits_org ON brand_kits (org_id)",
    "CREATE INDEX IF NOT EXISTS idx_decks_org ON decks (org_id)",
    "CREATE INDEX IF NOT EXISTS idx_usage_telemetry_org ON usage_telemetry (org_id, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs (org_id, created_at)",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DbError {
    Sqlite(String),
    Serialization(String),
    BrandQuotaExceeded {
        tier: String,
        used_brands: u32,
        max_brands: u32,
    },
    DailyDeckQuotaExceeded {
        tier: String,
        decks_created_today: u32,
        daily_deck_limit: u32,
    },
    NotFound(String),
    InvalidInput(String),
}

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Sqlite(msg) => write!(f, "SQLite error: {msg}"),
            Self::Serialization(msg) => write!(f, "Serialization error: {msg}"),
            Self::BrandQuotaExceeded {
                tier,
                used_brands,
                max_brands,
            } => write!(
                f,
                "Brand Kit quota reached ({used_brands}/{max_brands}) on plan \"{tier}\". Upgrade subscription tier to add more Brand Kits."
            ),
            Self::DailyDeckQuotaExceeded {
                tier,
                decks_created_today,
                daily_deck_limit,
            } => write!(
                f,
                "Daily presentation limit reached ({decks_created_today}/{daily_deck_limit} decks today) on plan \"{tier}\"."
            ),
            Self::NotFound(msg) => write!(f, "{msg}"),
            Self::InvalidInput(msg) => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value.to_string())
    }
}

impl From<serde_json::Error> for DbError {
    fn from(value: serde_json::Error) -> Self {
        Self::Serialization(value.to_string())
    }
}

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, DbError> {
        if let Some(parent) = path.as_ref().parent() {
            if !parent.as_os_str().is_empty() {
                let _ = std::fs::create_dir_all(parent);
            }
        }
        let conn = Connection::open(path)?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn open_in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_schema()?;
        Ok(db)
    }

    pub fn init_schema(&self) -> Result<(), DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let _ = conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
        for ddl in MULTI_TENANT_DDL {
            conn.execute_batch(ddl)?;
        }
        Ok(())
    }

    /// Initializes a workspace with **zero hardcoded brands** (`used_brands = 0`)
    /// so users create their own Brand CVI from scratch.
    pub fn ensure_organisation(&self, org_id: &str) -> Result<Organisation, DbError> {
        if let Some(existing) = self.get_organisation(org_id)? {
            return Ok(existing);
        }
        let org = Organisation::new_zero_brand_workspace(org_id);
        self.upsert_organisation(&org)?;
        Ok(org)
    }

    pub fn upsert_organisation(&self, org: &Organisation) -> Result<Organisation, DbError> {
        let settings_json = serde_json::to_string(&json!({
            "role": org.role,
            "activeBrandKitId": org.active_brand_kit_id,
            "subscription": {
                "tier": org.tier,
            }
        }))?;

        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        conn.execute(
            "INSERT INTO organisations (id, name, tier, max_brands, daily_deck_limit, settings_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (id) DO UPDATE SET
               name = excluded.name,
               tier = excluded.tier,
               max_brands = excluded.max_brands,
               daily_deck_limit = excluded.daily_deck_limit,
               settings_json = excluded.settings_json,
               updated_at = excluded.updated_at",
            params![
                org.id,
                org.name,
                org.tier,
                org.max_brands,
                org.daily_deck_limit,
                settings_json,
                org.updated_at
            ],
        )?;
        drop(conn);
        Ok(org.clone())
    }

    pub fn get_organisation(&self, org_id: &str) -> Result<Option<Organisation>, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, name, tier, max_brands, daily_deck_limit, settings_json, updated_at
             FROM organisations
             WHERE id = ?1",
        )?;
        let row = stmt
            .query_row(params![org_id], |r| {
                let settings_str: String = r.get::<_, Option<String>>(5)?.unwrap_or_default();
                let settings: serde_json::Value =
                    serde_json::from_str(&settings_str).unwrap_or_else(|_| json!({}));
                let active_brand_kit_id = settings
                    .get("activeBrandKitId")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());
                let role = settings
                    .get("role")
                    .and_then(|v| v.as_str())
                    .unwrap_or("brand_admin")
                    .to_string();

                Ok(Organisation {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    tier: r.get(2)?,
                    max_brands: r.get::<_, u32>(3)?,
                    daily_deck_limit: r.get::<_, u32>(4)?,
                    active_brand_kit_id,
                    role,
                    updated_at: r.get(6)?,
                })
            })
            .optional()?;
        Ok(row)
    }

    pub fn count_distinct_brands(&self, org_id: &str) -> Result<u32, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let count: u32 = conn.query_row(
            "SELECT COUNT(DISTINCT id) FROM brand_kits WHERE org_id = ?1",
            params![org_id],
            |r| r.get(0),
        )?;
        Ok(count)
    }

    pub fn count_decks(&self, org_id: &str) -> Result<u32, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM decks WHERE org_id = ?1",
            params![org_id],
            |r| r.get(0),
        )?;
        Ok(count)
    }

    pub fn get_quota_status(&self, org_id: &str) -> Result<SubscriptionQuota, DbError> {
        let org = self.ensure_organisation(org_id)?;
        let used_brands = self.count_distinct_brands(org_id)?;
        let decks_created_today = self.count_decks(org_id)?;
        Ok(SubscriptionQuota::with_limits(
            org.tier,
            org.max_brands,
            used_brands,
            org.daily_deck_limit,
            decks_created_today,
        ))
    }

    /// Enforces `2 / 4 / 16` Brand Kit limit per organisation tier.
    pub fn assert_can_create_brand(&self, org_id: &str) -> Result<SubscriptionQuota, DbError> {
        let quota = self.get_quota_status(org_id)?;
        if quota.used_brands >= quota.max_brands {
            return Err(DbError::BrandQuotaExceeded {
                tier: quota.tier,
                used_brands: quota.used_brands,
                max_brands: quota.max_brands,
            });
        }
        Ok(quota)
    }

    /// Enforces `4 / 20 / 100` daily deck creation limit per organisation tier.
    pub fn assert_can_create_deck_today(&self, org_id: &str) -> Result<SubscriptionQuota, DbError> {
        let quota = self.get_quota_status(org_id)?;
        if quota.decks_created_today >= quota.daily_deck_limit {
            return Err(DbError::DailyDeckQuotaExceeded {
                tier: quota.tier,
                decks_created_today: quota.decks_created_today,
                daily_deck_limit: quota.daily_deck_limit,
            });
        }
        Ok(quota)
    }

    pub fn update_subscription(
        &self,
        org_id: &str,
        tier: &str,
        custom_max_brands: Option<u32>,
        custom_daily_deck_limit: Option<u32>,
    ) -> Result<(Organisation, SubscriptionQuota), DbError> {
        let mut org = self.ensure_organisation(org_id)?;
        let normalized_tier = SubscriptionQuota::normalize_tier_name(tier);
        let (default_brands, default_decks) = SubscriptionQuota::tier_limits(normalized_tier);

        org.tier = normalized_tier.to_string();
        org.max_brands = custom_max_brands.unwrap_or(default_brands).clamp(1, 64);
        org.daily_deck_limit = custom_daily_deck_limit.unwrap_or(default_decks).clamp(1, 1000);
        self.upsert_organisation(&org)?;

        let quota = self.get_quota_status(org_id)?;
        Ok((org, quota))
    }

    pub fn brand_exists(&self, org_id: &str, kit_id: &str) -> Result<bool, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let count: u32 = conn.query_row(
            "SELECT COUNT(*) FROM brand_kits WHERE org_id = ?1 AND id = ?2",
            params![org_id, kit_id],
            |r| r.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn save_brand_kit(&self, kit: &BrandKit) -> Result<BrandKit, DbError> {
        let mut org = self.ensure_organisation(&kit.org_id)?;
        let exists = self.brand_exists(&kit.org_id, &kit.id)?;
        if !exists {
            self.assert_can_create_brand(&kit.org_id)?;
        }

        let spec_json = serde_json::to_string(kit)?;
        {
            let conn = self
                .conn
                .lock()
                .map_err(|e| DbError::Sqlite(e.to_string()))?;
            conn.execute(
                "INSERT INTO brand_kits (id, org_id, version, name, spec_json, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT (id, org_id, version) DO UPDATE SET
                   name = excluded.name,
                   spec_json = excluded.spec_json,
                   created_at = excluded.created_at",
                params![
                    kit.id,
                    kit.org_id,
                    kit.version,
                    kit.name,
                    spec_json,
                    kit.created_at
                ],
            )?;
        }

        if org.active_brand_kit_id.is_none() {
            org.active_brand_kit_id = Some(kit.id.clone());
            self.upsert_organisation(&org)?;
        }

        Ok(kit.clone())
    }

    pub fn list_brand_kits(&self, org_id: &str) -> Result<Vec<BrandKit>, DbError> {
        let _ = self.ensure_organisation(org_id)?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT spec_json
             FROM brand_kits
             WHERE org_id = ?1
             ORDER BY created_at ASC, version DESC",
        )?;
        let rows = stmt.query_map(params![org_id], |r| r.get::<_, String>(0))?;

        let mut kits = Vec::new();
        let mut seen_ids = std::collections::HashSet::new();
        for row in rows {
            let raw = row?;
            if let Ok(kit) = serde_json::from_str::<BrandKit>(&raw) {
                if seen_ids.insert(kit.id.clone()) {
                    kits.push(kit);
                }
            }
        }
        Ok(kits)
    }

    pub fn save_deck(&self, deck: &Deck, enforce_daily_limit: bool) -> Result<Deck, DbError> {
        let _ = self.ensure_organisation(&deck.org_id)?;
        if enforce_daily_limit {
            self.assert_can_create_deck_today(&deck.org_id)?;
        }

        let deck_json = serde_json::to_string(deck)?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        conn.execute(
            "INSERT INTO decks (slug, org_id, version, title, brand_kit_id, brand_kit_version, deck_json, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT (slug, org_id) DO UPDATE SET
               version = excluded.version,
               title = excluded.title,
               brand_kit_id = excluded.brand_kit_id,
               brand_kit_version = excluded.brand_kit_version,
               deck_json = excluded.deck_json,
               updated_at = excluded.updated_at",
            params![
                deck.slug,
                deck.org_id,
                deck.version,
                deck.title,
                deck.brand_kit_id,
                deck.brand_kit_version,
                deck_json,
                deck.updated_at
            ],
        )?;
        Ok(deck.clone())
    }

    pub fn list_decks(&self, org_id: &str) -> Result<Vec<Deck>, DbError> {
        let _ = self.ensure_organisation(org_id)?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT deck_json FROM decks WHERE org_id = ?1 ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map(params![org_id], |r| r.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            let raw = row?;
            if let Ok(deck) = serde_json::from_str::<Deck>(&raw) {
                out.push(deck);
            }
        }
        Ok(out)
    }

    pub fn get_deck(&self, org_id: &str, slug: &str) -> Result<Option<Deck>, DbError> {
        let _ = self.ensure_organisation(org_id)?;
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let raw: Option<String> = conn
            .query_row(
                "SELECT deck_json FROM decks WHERE org_id = ?1 AND slug = ?2",
                params![org_id, slug],
                |r| r.get(0),
            )
            .optional()?;
        match raw {
            Some(json_str) => Ok(Some(serde_json::from_str::<Deck>(&json_str)?)),
            None => Ok(None),
        }
    }

    pub fn resolve_brand_kit(
        &self,
        org_id: &str,
        preferred_id: Option<&str>,
    ) -> Result<BrandKit, DbError> {
        let org = self.ensure_organisation(org_id)?;
        let kits = self.list_brand_kits(org_id)?;
        if let Some(pref) = preferred_id.filter(|s| !s.trim().is_empty()) {
            if let Some(found) = kits.iter().find(|k| k.id == pref) {
                return Ok(found.clone());
            }
        }
        if let Some(active_id) = org.active_brand_kit_id.as_deref() {
            if let Some(found) = kits.iter().find(|k| k.id == active_id) {
                return Ok(found.clone());
            }
        }
        if let Some(first) = kits.into_iter().next() {
            return Ok(first);
        }
        Ok(crate::compiler::default_brand_kit_for_org(org_id))
    }

    /// Clears all Brand Kits for the organisation (`used_brands = 0`, `active_brand_kit_id = None`)
    /// so the workspace resets to a zero-CVI onboarding state.
    pub fn clear_brand_kits(&self, org_id: &str) -> Result<SubscriptionQuota, DbError> {
        let mut org = self.ensure_organisation(org_id)?;
        {
            let conn = self
                .conn
                .lock()
                .map_err(|e| DbError::Sqlite(e.to_string()))?;
            conn.execute("DELETE FROM brand_kits WHERE org_id = ?1", params![org_id])?;
        }
        org.active_brand_kit_id = None;
        self.upsert_organisation(&org)?;
        let _ = self.append_audit_log(&AuditLog {
            id: format!("audit-clear-brands-{org_id}"),
            org_id: org_id.to_string(),
            action: "brand.cleared_all".to_string(),
            actor: "rust-engine".to_string(),
            target: org_id.to_string(),
            detail: "Cleared all Brand Kits for workspace (0-CVI reset)".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });
        self.get_quota_status(org_id)
    }

    /// Selects an existing Brand Kit as the active CVI for the organisation.
    pub fn set_active_brand_kit(&self, org_id: &str, brand_kit_id: &str) -> Result<BrandKit, DbError> {
        let mut org = self.ensure_organisation(org_id)?;
        let kits = self.list_brand_kits(org_id)?;
        let found = kits
            .into_iter()
            .find(|k| k.id == brand_kit_id)
            .ok_or_else(|| {
                DbError::NotFound(format!(
                    "Brand Kit '{brand_kit_id}' not found in '{org_id}'"
                ))
            })?;
        org.active_brand_kit_id = Some(found.id.clone());
        self.upsert_organisation(&org)?;
        Ok(found)
    }

    /// Updates an existing Brand Kit in place (creating a new version `v + 1`) and re-evaluates WCAG 2.1 AA contrast.
    pub fn update_brand_kit(
        &self,
        org_id: &str,
        kit_id: &str,
        name: Option<&str>,
        colors: Option<crate::models::BrandColors>,
        major_font: Option<&str>,
        minor_font: Option<&str>,
    ) -> Result<BrandKit, DbError> {
        let kits = self.list_brand_kits(org_id)?;
        let mut current = kits
            .into_iter()
            .find(|k| k.id == kit_id)
            .ok_or_else(|| {
                DbError::NotFound(format!("Brand Kit '{kit_id}' not found in '{org_id}'"))
            })?;

        if let Some(n) = name.filter(|s| !s.trim().is_empty()) {
            current.name = n.trim().to_string();
        }
        if let Some(c) = colors {
            let (passed, checks) = crate::brand::evaluate_brand_contrast(&c);
            current.colors = c;
            current.wcag_aa_passed = passed;
            current.contrast_checks = checks;
        }
        if let Some(maj) = major_font.filter(|s| !s.trim().is_empty()) {
            current.major_font = maj.trim().to_string();
        }
        if let Some(min) = minor_font.filter(|s| !s.trim().is_empty()) {
            current.minor_font = min.trim().to_string();
        }
        current.version = current.version.saturating_add(1);

        let saved = self.save_brand_kit(&current)?;
        let _ = self.append_audit_log(&AuditLog {
            id: format!("audit-brand-update-{}-v{}", saved.id, saved.version),
            org_id: org_id.to_string(),
            action: "brand.updated".to_string(),
            actor: "rust-engine".to_string(),
            target: saved.id.clone(),
            detail: format!("Updated Brand Kit '{}' to v{}", saved.name, saved.version),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });
        Ok(saved)
    }

    /// Deletes a specific Brand Kit from the organisation and updates `active_brand_kit_id`.
    pub fn delete_brand_kit(
        &self,
        org_id: &str,
        kit_id: &str,
    ) -> Result<SubscriptionQuota, DbError> {
        let mut org = self.ensure_organisation(org_id)?;
        {
            let conn = self
                .conn
                .lock()
                .map_err(|e| DbError::Sqlite(e.to_string()))?;
            conn.execute(
                "DELETE FROM brand_kits WHERE org_id = ?1 AND id = ?2",
                params![org_id, kit_id],
            )?;
        }
        let remaining = self.list_brand_kits(org_id)?;
        if org.active_brand_kit_id.as_deref() == Some(kit_id) {
            org.active_brand_kit_id = remaining.first().map(|k| k.id.clone());
            self.upsert_organisation(&org)?;
        }
        self.get_quota_status(org_id)
    }

    /// Updates organisation workspace name and RBAC role.
    pub fn update_org_settings(
        &self,
        org_id: &str,
        name: Option<&str>,
        role: Option<&str>,
    ) -> Result<Organisation, DbError> {
        let mut org = self.ensure_organisation(org_id)?;
        if let Some(n) = name.filter(|s| !s.trim().is_empty()) {
            org.name = n.trim().to_string();
        }
        if let Some(r) = role.filter(|s| ["brand_admin", "editor", "viewer"].contains(&s.trim())) {
            org.role = r.trim().to_string();
        }
        let saved = self.upsert_organisation(&org)?;
        let _ = self.append_audit_log(&AuditLog {
            id: format!("audit-org-settings-{}", org_id),
            org_id: org_id.to_string(),
            action: "org.settings_updated".to_string(),
            actor: "rust-engine".to_string(),
            target: org_id.to_string(),
            detail: format!("Updated workspace settings (name='{}', role='{}')", saved.name, saved.role),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });
        Ok(saved)
    }

    /// Updates a single slide's `type`, `eyebrow`, `title`, `lede`, and `speaker_notes` in SQLite.
    pub fn update_deck_slide(
        &self,
        org_id: &str,
        slug: &str,
        slide_index: usize,
        slide_type: Option<&str>,
        eyebrow: Option<&str>,
        title: Option<&str>,
        lede: Option<&str>,
        speaker_notes: Option<&str>,
    ) -> Result<Deck, DbError> {
        let mut deck = self
            .get_deck(org_id, slug)?
            .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;

        let slide_count = deck.slides.len();
        let slide = deck.slides.get_mut(slide_index).ok_or_else(|| {
            DbError::InvalidInput(format!(
                "Invalid slide index {slide_index} (deck has {slide_count} slides)"
            ))
        })?;

        if let Some(t) = slide_type {
            slide.slide_type = t.to_string();
        }
        if let Some(e) = eyebrow {
            slide.eyebrow = e.to_string();
        }
        if let Some(ti) = title {
            slide.title = ti.to_string();
        }
        if let Some(l) = lede {
            slide.lede = l.to_string();
        }
        if let Some(n) = speaker_notes {
            slide.speaker_notes = n.to_string();
        }

        deck.version = deck.version.saturating_add(1);
        let saved = self.save_deck(&deck, false)?;
        let _ = self.append_audit_log(&AuditLog {
            id: format!("audit-slide-{}-{}-v{}", saved.slug, slide_index, saved.version),
            org_id: org_id.to_string(),
            action: "deck.slide_updated".to_string(),
            actor: "rust-engine".to_string(),
            target: format!("{}:slide:{}", saved.slug, slide_index),
            detail: format!("Updated slide {} on deck '{}' (v{})", slide_index + 1, saved.slug, saved.version),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });
        Ok(saved)
    }

    /// Refines an existing deck in place based on a natural-language `prompt` and persists the new version in SQLite.
    pub fn refine_deck_in_place(
        &self,
        org_id: &str,
        slug: &str,
        prompt: &str,
    ) -> Result<Deck, DbError> {
        if prompt.trim().is_empty() {
            return Err(DbError::InvalidInput(
                "Refinement prompt is required.".to_string(),
            ));
        }

        let deck = self
            .get_deck(org_id, slug)?
            .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;
        let brand = self.resolve_brand_kit(org_id, Some(&deck.brand_kit_id))?;
        let refined = crate::compiler::refine_deck_with_prompt(&deck, prompt, &brand);
        let saved = self.save_deck(&refined, false)?;

        let _ = self.append_audit_log(&AuditLog {
            id: format!("audit-edit-{}-v{}", saved.slug, saved.version),
            org_id: org_id.to_string(),
            action: "deck.refined".to_string(),
            actor: "rust-engine".to_string(),
            target: saved.slug.clone(),
            detail: format!("Refined deck '{}' (v{}): {}", saved.slug, saved.version, prompt.trim()),
            created_at: "2026-01-01T00:00:00Z".to_string(),
        });

        Ok(saved)
    }

    /// Lists all multi-tenant workspaces in SQLite (ensuring the default workspaces exist).
    pub fn list_organisations(&self) -> Result<Vec<Organisation>, DbError> {
        for preset_id in ["default-org", "nordic-labs", "atelier-studio"] {
            let _ = self.ensure_organisation(preset_id)?;
        }
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, name, tier, max_brands, daily_deck_limit, settings_json, updated_at
             FROM organisations
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |r| {
            let settings_str: String = r.get::<_, Option<String>>(5)?.unwrap_or_default();
            let settings: serde_json::Value =
                serde_json::from_str(&settings_str).unwrap_or_else(|_| json!({}));
            let active_brand_kit_id = settings
                .get("activeBrandKitId")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let role = settings
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("brand_admin")
                .to_string();

            Ok(Organisation {
                id: r.get(0)?,
                name: r.get(1)?,
                tier: r.get(2)?,
                max_brands: r.get::<_, u32>(3)?,
                daily_deck_limit: r.get::<_, u32>(4)?,
                active_brand_kit_id,
                role,
                updated_at: r.get(6)?,
            })
        })?;
        let mut list = Vec::new();
        for row in rows {
            list.push(row?);
        }
        Ok(list)
    }

    /// Inserts a new slide into an existing deck (Issue #25).
    pub fn add_deck_slide(
        &self,
        org_id: &str,
        slug: &str,
        after_index: Option<usize>,
        slide_type: Option<&str>,
        title: Option<&str>,
        lede: Option<&str>,
    ) -> Result<(Deck, usize), DbError> {
        let mut deck = self
            .get_deck(org_id, slug)?
            .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;
        let insert_idx = match after_index {
            Some(idx) if idx < deck.slides.len() => idx + 1,
            _ => deck.slides.len().saturating_sub(1),
        };
        let new_slide = crate::models::SlideSpec {
            index: insert_idx,
            slide_type: slide_type.unwrap_or("content").to_string(),
            eyebrow: format!("0{} · KEY POINT", insert_idx + 1),
            title: title.unwrap_or("New Brand-Aligned Slide").to_string(),
            lede: lede
                .unwrap_or("Supporting factual context and decision takeaway.")
                .to_string(),
            speaker_notes: "Added via Slide Inspector.".to_string(),
        };
        deck.slides.insert(insert_idx, new_slide);
        for (i, s) in deck.slides.iter_mut().enumerate() {
            s.index = i;
        }
        deck.version = deck.version.saturating_add(1);
        let saved = self.save_deck(&deck, false)?;
        Ok((saved, insert_idx))
    }

    /// Deletes a slide at `slide_index` from an existing deck (Issue #25).
    pub fn delete_deck_slide(
        &self,
        org_id: &str,
        slug: &str,
        slide_index: usize,
    ) -> Result<Deck, DbError> {
        let mut deck = self
            .get_deck(org_id, slug)?
            .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;
        if deck.slides.len() <= 1 {
            return Err(DbError::InvalidInput(
                "A presentation must contain at least 1 slide.".to_string(),
            ));
        }
        if slide_index >= deck.slides.len() {
            return Err(DbError::InvalidInput(format!(
                "Invalid slide index {slide_index}"
            )));
        }
        deck.slides.remove(slide_index);
        for (i, s) in deck.slides.iter_mut().enumerate() {
            s.index = i;
        }
        deck.version = deck.version.saturating_add(1);
        self.save_deck(&deck, false)
    }

    /// Moves a slide up or down at `slide_index` in an existing deck (Issue #25).
    pub fn move_deck_slide(
        &self,
        org_id: &str,
        slug: &str,
        slide_index: usize,
        direction: &str,
    ) -> Result<(Deck, usize), DbError> {
        let mut deck = self
            .get_deck(org_id, slug)?
            .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;
        if slide_index >= deck.slides.len() {
            return Err(DbError::InvalidInput(format!(
                "Invalid slide index {slide_index}"
            )));
        }
        let target_idx = if direction == "down" {
            if slide_index + 1 < deck.slides.len() {
                slide_index + 1
            } else {
                slide_index
            }
        } else {
            slide_index.saturating_sub(1)
        };
        deck.slides.swap(slide_index, target_idx);
        for (i, s) in deck.slides.iter_mut().enumerate() {
            s.index = i;
        }
        deck.version = deck.version.saturating_add(1);
        let saved = self.save_deck(&deck, false)?;
        Ok((saved, target_idx))
    }

    pub fn record_telemetry(&self, entry: &UsageTelemetry) -> Result<(), DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        conn.execute(
            "INSERT INTO usage_telemetry (id, org_id, deck_slug, operation, prompt_tokens, completion_tokens, total_cost_usd, render_ms, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT (id) DO UPDATE SET
               prompt_tokens = excluded.prompt_tokens,
               completion_tokens = excluded.completion_tokens,
               total_cost_usd = excluded.total_cost_usd,
               render_ms = excluded.render_ms",
            params![
                entry.id,
                entry.org_id,
                entry.deck_slug,
                entry.operation,
                entry.prompt_tokens,
                entry.completion_tokens,
                entry.total_cost_usd,
                entry.render_ms,
                entry.created_at
            ],
        )?;
        Ok(())
    }

    pub fn list_telemetry(&self, org_id: &str) -> Result<Vec<UsageTelemetry>, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, org_id, deck_slug, operation, prompt_tokens, completion_tokens, total_cost_usd, render_ms, created_at
             FROM usage_telemetry
             WHERE org_id = ?1
             ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![org_id], |r| {
            let total_cost_usd: f64 = r.get(6)?;
            Ok(UsageTelemetry {
                id: r.get(0)?,
                org_id: r.get(1)?,
                deck_slug: r.get(2)?,
                operation: r.get(3)?,
                prompt_tokens: r.get(4)?,
                completion_tokens: r.get(5)?,
                llm_cost_usd: total_cost_usd,
                worker_cost_usd: 0.0,
                total_cost_usd,
                render_ms: r.get(7)?,
                created_at: r.get(8)?,
            })
        })?;

        let mut list = Vec::new();
        for row in rows {
            list.push(row?);
        }
        Ok(list)
    }

    /// Exports organisation usage & cost telemetry as an RFC 4180 CSV document.
    pub fn export_cost_telemetry_csv(&self, org_id: &str) -> Result<String, DbError> {
        let entries = self.list_telemetry(org_id)?;
        let mut lines = Vec::with_capacity(entries.len() + 1);
        lines.push(
            "timestamp,deckSlug,operation,promptTokens,completionTokens,llmCostUsd,workerCostUsd,totalCostUsd,renderDurationMs"
                .to_string(),
        );
        for item in entries {
            lines.push(format!(
                "{},{},{},{},{},{:.6},{:.6},{:.6},{}",
                escape_csv(&item.created_at),
                escape_csv(&item.deck_slug),
                escape_csv(&item.operation),
                item.prompt_tokens,
                item.completion_tokens,
                item.llm_cost_usd,
                item.worker_cost_usd,
                item.total_cost_usd,
                item.render_ms
            ));
        }
        Ok(lines.join("\n"))
    }

    pub fn append_audit_log(&self, entry: &AuditLog) -> Result<(), DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        conn.execute(
            "INSERT INTO audit_logs (id, org_id, action, actor, target, detail, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (id) DO UPDATE SET
               action = excluded.action,
               actor = excluded.actor,
               target = excluded.target,
               detail = excluded.detail",
            params![
                entry.id,
                entry.org_id,
                entry.action,
                entry.actor,
                entry.target,
                entry.detail,
                entry.created_at
            ],
        )?;
        Ok(())
    }

    pub fn list_audit_logs(&self, org_id: &str, limit: usize) -> Result<Vec<AuditLog>, DbError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| DbError::Sqlite(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT id, org_id, action, actor, target, detail, created_at
             FROM audit_logs
             WHERE org_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(params![org_id, limit as i64], |r| {
            Ok(AuditLog {
                id: r.get(0)?,
                org_id: r.get(1)?,
                action: r.get(2)?,
                actor: r.get(3)?,
                target: r.get(4)?,
                detail: r.get(5)?,
                created_at: r.get(6)?,
            })
        })?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }
}

fn escape_csv(value: &str) -> String {
    if value.contains(',') || value.contains('"') || value.contains('\n') || value.contains('\r') {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
