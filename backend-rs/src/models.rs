use serde::{Deserialize, Serialize};

/// Default SaaS tier limits:
/// - Starter: 2 Brand Kits / 4 Decks per day
/// - Pro: 4 Brand Kits / 20 Decks per day
/// - Enterprise: 16 Brand Kits / 100 Decks per day
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionQuota {
    pub tier: String,
    pub max_brands: u32,
    pub used_brands: u32,
    pub remaining_brands: u32,
    pub daily_deck_limit: u32,
    pub decks_created_today: u32,
    pub remaining_decks_today: u32,
}

impl SubscriptionQuota {
    /// Returns `(max_brands, daily_deck_limit)` for the given tier identifier.
    pub fn tier_limits(tier: &str) -> (u32, u32) {
        match tier.trim().to_ascii_lowercase().as_str() {
            "starter" => (2, 4),
            "enterprise" => (16, 100),
            _ => (4, 20), // "pro" is the default workspace tier
        }
    }

    pub fn normalize_tier_name(tier: &str) -> &'static str {
        match tier.trim().to_ascii_lowercase().as_str() {
            "starter" => "starter",
            "enterprise" => "enterprise",
            _ => "pro",
        }
    }

    pub fn for_tier(tier: &str, used_brands: u32, decks_created_today: u32) -> Self {
        let normalized = Self::normalize_tier_name(tier);
        let (max_brands, daily_deck_limit) = Self::tier_limits(normalized);
        Self::with_limits(
            normalized.to_string(),
            max_brands,
            used_brands,
            daily_deck_limit,
            decks_created_today,
        )
    }

    pub fn with_limits(
        tier: String,
        max_brands: u32,
        used_brands: u32,
        daily_deck_limit: u32,
        decks_created_today: u32,
    ) -> Self {
        Self {
            tier,
            max_brands,
            used_brands,
            remaining_brands: max_brands.saturating_sub(used_brands),
            daily_deck_limit,
            decks_created_today,
            remaining_decks_today: daily_deck_limit.saturating_sub(decks_created_today),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Organisation {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub max_brands: u32,
    pub daily_deck_limit: u32,
    pub active_brand_kit_id: Option<String>,
    pub role: String,
    pub updated_at: String,
}

impl Organisation {
    pub fn new_zero_brand_workspace(org_id: &str) -> Self {
        let (max_brands, daily_deck_limit) = SubscriptionQuota::tier_limits("pro");
        Self {
            id: org_id.to_string(),
            name: "My Studio Workspace".to_string(),
            tier: "pro".to_string(),
            max_brands,
            daily_deck_limit,
            active_brand_kit_id: None,
            role: "brand_admin".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BrandColors {
    pub primary: String,
    pub secondary: String,
    pub accent: String,
    pub surface_light: String,
    pub surface_alt: String,
    pub surface_dark: String,
    pub text_on_light: String,
    pub text_muted_on_light: String,
    pub text_on_dark: String,
    pub text_muted_on_dark: String,
    pub dk1: String,
    pub lt1: String,
    pub dk2: String,
    pub lt2: String,
    pub accent1: String,
    pub accent2: String,
    pub accent3: String,
    pub accent4: String,
    pub accent5: String,
    pub accent6: String,
}

impl Default for BrandColors {
    fn default() -> Self {
        Self {
            primary: "#1E293B".to_string(),
            secondary: "#2563EB".to_string(),
            accent: "#D94E28".to_string(),
            surface_light: "#FAF8F5".to_string(),
            surface_alt: "#F1ECE1".to_string(),
            surface_dark: "#0F172A".to_string(),
            text_on_light: "#0F172A".to_string(),
            text_muted_on_light: "#1E293B".to_string(),
            text_on_dark: "#FAF8F5".to_string(),
            text_muted_on_dark: "#F1ECE1".to_string(),
            dk1: "#0F172A".to_string(),
            lt1: "#FAF8F5".to_string(),
            dk2: "#1E293B".to_string(),
            lt2: "#F1ECE1".to_string(),
            accent1: "#D94E28".to_string(),
            accent2: "#2563EB".to_string(),
            accent3: "#0D9488".to_string(),
            accent4: "#D97706".to_string(),
            accent5: "#7C3AED".to_string(),
            accent6: "#DC2626".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ContrastCheck {
    pub id: String,
    pub label: String,
    pub fg: String,
    pub bg: String,
    pub ratio: f64,
    pub min_ratio: f64,
    pub passed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrandKit {
    pub id: String,
    pub org_id: String,
    pub version: u32,
    pub name: String,
    pub company_name: String,
    pub source_file: String,
    pub colors: BrandColors,
    pub major_font: String,
    pub minor_font: String,
    pub slide_width_in: f64,
    pub slide_height_in: f64,
    pub wcag_aa_passed: bool,
    pub contrast_checks: Vec<ContrastCheck>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SlideSpec {
    pub index: usize,
    #[serde(rename = "type", alias = "slideType", alias = "slide_type")]
    pub slide_type: String,
    #[serde(default)]
    pub eyebrow: String,
    pub title: String,
    #[serde(default)]
    pub lede: String,
    #[serde(default)]
    pub speaker_notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub slug: String,
    pub org_id: String,
    pub version: u32,
    pub title: String,
    pub brand_kit_id: String,
    pub brand_kit_version: u32,
    pub slides: Vec<SlideSpec>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct UsageTelemetry {
    pub id: String,
    pub org_id: String,
    pub deck_slug: String,
    pub operation: String,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub llm_cost_usd: f64,
    pub worker_cost_usd: f64,
    pub total_cost_usd: f64,
    pub render_ms: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditLog {
    pub id: String,
    pub org_id: String,
    pub action: String,
    pub actor: String,
    pub target: String,
    pub detail: String,
    pub created_at: String,
}
