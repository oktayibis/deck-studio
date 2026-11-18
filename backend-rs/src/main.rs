pub mod brand;
pub mod compiler;
pub mod db;
pub mod models;

use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use axum::extract::{Multipart, Path, Query, State};
use axum::http::{header, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::{json, Value};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use crate::brand::{
    build_synthetic_pptx_zip, extract_brand_kit_from_pptx_bytes, slugify,
};
use crate::compiler::{
    compile_deck_to_html, export_deck_to_zip_bytes, synthesize_deck_from_brief,
};
use crate::db::{Database, DbError};
use crate::models::{AuditLog, BrandColors, Deck, SlideSpec, UsageTelemetry};

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OrgQuery {
    pub org_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionUpdateRequest {
    pub org_id: Option<String>,
    pub tier: Option<String>,
    pub custom_max_brands: Option<u32>,
    pub custom_daily_deck_limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDeckRequest {
    pub org_id: Option<String>,
    pub slug: Option<String>,
    pub title: String,
    pub brand_kit_id: Option<String>,
    pub slides: Option<Vec<SlideSpec>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct BuildDeckRequest {
    #[serde(alias = "org_id")]
    pub org_id: Option<String>,
    pub slug: Option<String>,
    pub title: Option<String>,
    pub topic: Option<String>,
    pub brief: Option<Value>,
    pub audience: Option<String>,
    #[serde(alias = "brand_kit_id")]
    pub brand_kit_id: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtractBrandJsonRequest {
    pub org_id: Option<String>,
    pub name: Option<String>,
    pub primary: Option<String>,
    pub accent: Option<String>,
    pub surface_dark: Option<String>,
    pub surface_light: Option<String>,
    pub major_font: Option<String>,
    pub minor_font: Option<String>,
}

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/bootstrap", get(bootstrap_handler))
        .route(
            "/api/subscription",
            get(get_subscription_handler).post(update_subscription_handler),
        )
        .route("/api/subscription/cost-export.csv", get(cost_export_csv_handler))
        .route("/api/brands", get(list_brands_handler))
        .route("/api/brands/extract", post(extract_brand_handler))
        .route("/api/decks", get(list_decks_handler).post(create_deck_handler))
        .route("/api/decks/build", post(build_deck_handler))
        .route("/api/decks/:slug/view", get(view_deck_handler))
        .route("/api/decks/:slug/export/zip", get(export_deck_zip_handler))
        .route("/api/mcp", post(mcp_jsonrpc_handler))
        .fallback_service(ServeDir::new("src/public"))
        .layer(CorsLayer::permissive())
        .with_state(state)
}

async fn health_handler() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "service": "deck-studio-backend-rs",
        "engine": "axum-rusqlite-quickxml"
    }))
}

async fn bootstrap_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OrgQuery>,
) -> Result<Json<Value>, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let org = state.db.ensure_organisation(org_id)?;
    let quota = state.db.get_quota_status(org_id)?;
    let brand_kits = state.db.list_brand_kits(org_id)?;
    let active_brand_kit = org
        .active_brand_kit_id
        .as_ref()
        .and_then(|active_id| brand_kits.iter().find(|k| &k.id == active_id).cloned())
        .or_else(|| brand_kits.first().cloned());
    let decks = state.db.list_decks(org_id)?;
    let audit_log = state.db.list_audit_logs(org_id, 50)?;

    Ok(Json(json!({
        "org": org,
        "quota": quota,
        "brandKits": brand_kits,
        "activeBrandKit": active_brand_kit,
        "decks": decks,
        "auditLog": audit_log
    })))
}

async fn get_subscription_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OrgQuery>,
) -> Result<Json<Value>, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let org = state.db.ensure_organisation(org_id)?;
    let quota = state.db.get_quota_status(org_id)?;
    Ok(Json(json!({
        "org": org,
        "quota": quota
    })))
}

async fn update_subscription_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<SubscriptionUpdateRequest>,
) -> Result<Json<Value>, ApiError> {
    let org_id = payload.org_id.as_deref().unwrap_or("default-org");
    let tier = payload.tier.as_deref().unwrap_or("pro");
    let (org, quota) = state.db.update_subscription(
        org_id,
        tier,
        payload.custom_max_brands,
        payload.custom_daily_deck_limit,
    )?;
    Ok(Json(json!({
        "org": org,
        "quota": quota
    })))
}

async fn cost_export_csv_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OrgQuery>,
) -> Result<Response, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let csv = state.db.export_cost_telemetry_csv(org_id)?;
    let response = (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
            (
                header::CONTENT_DISPOSITION,
                "attachment; filename=\"deck-studio-cost-telemetry.csv\"",
            ),
        ],
        csv,
    )
        .into_response();
    Ok(response)
}

async fn list_brands_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OrgQuery>,
) -> Result<Json<Value>, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let org = state.db.ensure_organisation(org_id)?;
    let brand_kits = state.db.list_brand_kits(org_id)?;
    let active_brand_kit = org
        .active_brand_kit_id
        .as_ref()
        .and_then(|active_id| brand_kits.iter().find(|k| &k.id == active_id).cloned())
        .or_else(|| brand_kits.first().cloned());
    let quota = state.db.get_quota_status(org_id)?;

    Ok(Json(json!({
        "brandKits": brand_kits,
        "activeBrandKit": active_brand_kit,
        "quota": quota
    })))
}

async fn extract_brand_handler(
    State(state): State<Arc<AppState>>,
    multipart: Option<Multipart>,
) -> Result<Json<Value>, ApiError> {
    let mut org_id = String::from("default-org");
    let mut brand_name: Option<String> = None;
    let mut filename = String::from("custom-brand.pptx");
    let mut pptx_bytes: Option<Vec<u8>> = None;
    let mut colors = BrandColors::default();
    let mut major_font = String::from("Instrument Serif");
    let mut minor_font = String::from("Plus Jakarta Sans");

    if let Some(mut mp) = multipart {
        while let Ok(Some(field)) = mp.next_field().await {
            let field_name = field.name().unwrap_or("").to_string();
            if field_name == "file" {
                if let Some(fname) = field.file_name() {
                    filename = fname.to_string();
                }
                if let Ok(bytes) = field.bytes().await {
                    pptx_bytes = Some(bytes.to_vec());
                }
            } else if let Ok(text) = field.text().await {
                match field_name.as_str() {
                    "orgId" | "org_id" => org_id = text,
                    "name" => brand_name = Some(text),
                    "primary" => colors.dk2 = text,
                    "accent" => colors.accent1 = text,
                    "surfaceDark" => colors.dk1 = text,
                    "surfaceLight" => colors.lt1 = text,
                    "majorFont" | "titleFont" => major_font = text,
                    "minorFont" | "bodyFont" => minor_font = text,
                    _ => {}
                }
            }
        }
    }

    let raw_bytes = match pptx_bytes {
        Some(b) => b,
        None => {
            let synth_name = brand_name.as_deref().unwrap_or("Custom Brand CVI");
            build_synthetic_pptx_zip(
                synth_name,
                &colors,
                &major_font,
                &minor_font,
                13.333,
                7.5,
            )?
        }
    };

    let extracted = extract_brand_kit_from_pptx_bytes(
        &raw_bytes,
        &org_id,
        &filename,
        brand_name.as_deref(),
    )?;
    let saved = state.db.save_brand_kit(&extracted)?;
    let brand_kits = state.db.list_brand_kits(&org_id)?;
    let quota = state.db.get_quota_status(&org_id)?;

    Ok(Json(json!({
        "brandKit": saved,
        "brandKits": brand_kits,
        "quota": quota
    })))
}

async fn list_decks_handler(
    State(state): State<Arc<AppState>>,
    Query(query): Query<OrgQuery>,
) -> Result<Json<Value>, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let decks = state.db.list_decks(org_id)?;
    let quota = state.db.get_quota_status(org_id)?;
    Ok(Json(json!({
        "decks": decks,
        "quota": quota
    })))
}

async fn create_deck_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<CreateDeckRequest>,
) -> Result<Json<Value>, ApiError> {
    let org_id = payload.org_id.as_deref().unwrap_or("default-org");
    let slug = payload
        .slug
        .unwrap_or_else(|| slugify(&payload.title));
    let brand_kit_id = payload
        .brand_kit_id
        .unwrap_or_else(|| "custom-brand".to_string());
    let slides = payload.slides.unwrap_or_else(|| {
        vec![SlideSpec {
            index: 0,
            slide_type: "cover".to_string(),
            eyebrow: "OVERVIEW".to_string(),
            title: payload.title.clone(),
            lede: "Generated by Deck Studio Rust Backend".to_string(),
            speaker_notes: String::new(),
        }]
    });

    let deck = Deck {
        slug,
        org_id: org_id.to_string(),
        version: 1,
        title: payload.title,
        brand_kit_id,
        brand_kit_version: 1,
        slides,
        updated_at: "2026-01-01T00:00:00Z".to_string(),
    };

    let saved = state.db.save_deck(&deck, true)?;
    let quota = state.db.get_quota_status(org_id)?;
    Ok(Json(json!({
        "deck": saved,
        "quota": quota
    })))
}

async fn build_deck_handler(
    State(state): State<Arc<AppState>>,
    Json(payload): Json<BuildDeckRequest>,
) -> Result<Json<Value>, ApiError> {
    let org_id = payload.org_id.as_deref().unwrap_or("default-org");

    // 1. Enforce daily deck creation quota (4 / 20 / 100)
    state.db.assert_can_create_deck_today(org_id)?;

    // 2. Resolve BrandKit for the organisation
    let brand = state
        .db
        .resolve_brand_kit(org_id, payload.brand_kit_id.as_deref())?;

    // 3. Extract brief topic and audience
    let brief_topic = payload.brief.as_ref().and_then(|b| match b {
        Value::String(s) => Some(s.clone()),
        Value::Object(map) => map
            .get("topic")
            .or_else(|| map.get("title"))
            .or_else(|| map.get("rawText"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    });
    let brief_audience = payload.brief.as_ref().and_then(|b| {
        b.as_object()
            .and_then(|m| m.get("audience"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    });

    let topic = payload
        .topic
        .or(payload.title)
        .or(brief_topic)
        .unwrap_or_else(|| "Enterprise Architecture & CVI Rollout".to_string());
    let audience = payload
        .audience
        .or(brief_audience)
        .unwrap_or_else(|| "Executive & Engineering Stakeholders".to_string());
    let slug = payload.slug.unwrap_or_else(|| slugify(&topic));

    // 4. Synthesize deterministic 8-slide deck
    let deck = synthesize_deck_from_brief(&slug, &topic, &audience, &brand);

    // 5. Save deck to SQLite & record telemetry + audit log
    let saved = state.db.save_deck(&deck, true)?;
    let telemetry = UsageTelemetry {
        id: format!("tel-{}", saved.slug),
        org_id: org_id.to_string(),
        deck_slug: saved.slug.clone(),
        operation: "build_deck".to_string(),
        prompt_tokens: 1280,
        completion_tokens: 960,
        llm_cost_usd: 0.0124,
        worker_cost_usd: 0.0016,
        total_cost_usd: 0.0140,
        render_ms: 42,
        created_at: "2026-01-01T00:00:00Z".to_string(),
    };
    state.db.record_telemetry(&telemetry)?;
    let _ = state.db.append_audit_log(&AuditLog {
        id: format!("audit-build-{}", saved.slug),
        org_id: org_id.to_string(),
        action: "deck.synthesized".to_string(),
        actor: "rust-engine".to_string(),
        target: saved.slug.clone(),
        detail: format!("Synthesized {} slides under {}", saved.slides.len(), brand.name),
        created_at: "2026-01-01T00:00:00Z".to_string(),
    });

    let quota = state.db.get_quota_status(org_id)?;
    Ok(Json(json!({
        "deck": saved,
        "quota": quota
    })))
}

async fn view_deck_handler(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(query): Query<OrgQuery>,
) -> Result<Response, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let deck = state
        .db
        .get_deck(org_id, &slug)?
        .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;
    let brand = state
        .db
        .resolve_brand_kit(org_id, Some(&deck.brand_kit_id))?;
    let html = compile_deck_to_html(&deck, &brand);

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "text/html; charset=utf-8"),
            (header::CACHE_CONTROL, "no-store"),
        ],
        html,
    )
        .into_response())
}

async fn export_deck_zip_handler(
    State(state): State<Arc<AppState>>,
    Path(slug): Path<String>,
    Query(query): Query<OrgQuery>,
) -> Result<Response, ApiError> {
    let org_id = query.org_id.as_deref().unwrap_or("default-org");
    let deck = state
        .db
        .get_deck(org_id, &slug)?
        .ok_or_else(|| DbError::NotFound(format!("Deck '{slug}' not found in '{org_id}'")))?;
    let brand = state
        .db
        .resolve_brand_kit(org_id, Some(&deck.brand_kit_id))?;
    let zip_bytes = export_deck_to_zip_bytes(&deck, &brand)
        .map_err(|e| ApiError(e, StatusCode::INTERNAL_SERVER_ERROR))?;
    let disposition = format!("attachment; filename=\"{}-deck.zip\"", deck.slug);

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/zip".to_string()),
            (header::CONTENT_DISPOSITION, disposition),
            (header::CACHE_CONTROL, "no-store".to_string()),
        ],
        zip_bytes,
    )
        .into_response())
}

async fn mcp_jsonrpc_handler(
    State(state): State<Arc<AppState>>,
    Json(rpc): Json<Value>,
) -> Json<Value> {
    let id = rpc.get("id").cloned().unwrap_or(Value::Null);
    let method = rpc
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("tools/list");

    match method {
        "tools/list" => Json(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "tools": [
                    { "name": "extract_brand_kit", "description": "Extract Brand CVI from .pptx/.potx/.thmx" },
                    { "name": "create_deck", "description": "Create a brand-locked slide deck" },
                    { "name": "check_quota", "description": "Inspect organisation 2/4/16 brand and 4/20/100 deck quotas" }
                ]
            }
        })),
        "tools/call" => {
            let org_id = rpc
                .pointer("/params/arguments/orgId")
                .and_then(|v| v.as_str())
                .unwrap_or("default-org");
            let quota = state.db.get_quota_status(org_id).ok();
            Json(json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "orgId": org_id,
                    "quota": quota
                }
            }))
        }
        _ => Json(json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "status": "ok" }
        })),
    }
}

#[derive(Debug)]
pub struct ApiError(pub String, pub StatusCode);

impl From<DbError> for ApiError {
    fn from(err: DbError) -> Self {
        match err {
            DbError::BrandQuotaExceeded { .. } | DbError::DailyDeckQuotaExceeded { .. } => {
                Self(err.to_string(), StatusCode::TOO_MANY_REQUESTS)
            }
            DbError::NotFound(_) => Self(err.to_string(), StatusCode::NOT_FOUND),
            _ => Self(err.to_string(), StatusCode::INTERNAL_SERVER_ERROR),
        }
    }
}

impl From<crate::brand::BrandExtractionError> for ApiError {
    fn from(err: crate::brand::BrandExtractionError) -> Self {
        Self(err.to_string(), StatusCode::BAD_REQUEST)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.1, Json(json!({ "error": self.0 }))).into_response()
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let db_path = std::env::var("SQLITE_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("../data/deck_studio.sqlite"));
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3457);

    let db = Database::open(db_path)?;
    let state = Arc::new(AppState { db });
    let app = build_router(state);

    // Strictly bind to 127.0.0.1 loopback interface
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("Deck Studio Rust backend listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::brand::{
        build_synthetic_pptx_zip, emu_to_inches, evaluate_brand_contrast,
        extract_brand_kit_from_pptx_bytes, wcag_contrast_ratio,
    };
    use crate::models::{BrandColors, SubscriptionQuota, UsageTelemetry};

    #[test]
    fn test_zero_brand_workspace_initialization() {
        let db = Database::open_in_memory().expect("in-memory sqlite should initialize");
        let org = db
            .ensure_organisation("org-fresh")
            .expect("workspace creation should succeed");

        assert_eq!(org.name, "My Studio Workspace");
        assert_eq!(org.active_brand_kit_id, None);

        let brands = db
            .list_brand_kits("org-fresh")
            .expect("listing brands should succeed");
        assert!(
            brands.is_empty(),
            "new workspace must start with 0 hardcoded brands so users create their own CVI"
        );

        let quota = db
            .get_quota_status("org-fresh")
            .expect("quota status should succeed");
        assert_eq!(quota.used_brands, 0);
        assert_eq!(quota.max_brands, 4);
        assert_eq!(quota.remaining_brands, 4);
        assert_eq!(quota.decks_created_today, 0);
        assert_eq!(quota.daily_deck_limit, 20);
    }

    #[test]
    fn test_brand_quota_enforcement_2_4_16_and_daily_decks_4_20_100() {
        let db = Database::open_in_memory().expect("in-memory sqlite");

        // Verify tier catalog limits: Starter (2/4), Pro (4/20), Enterprise (16/100)
        assert_eq!(SubscriptionQuota::tier_limits("starter"), (2, 4));
        assert_eq!(SubscriptionQuota::tier_limits("pro"), (4, 20));
        assert_eq!(SubscriptionQuota::tier_limits("enterprise"), (16, 100));

        // 1. Starter tier: allows 2 brands, blocks 3rd
        db.update_subscription("org-quota", "starter", None, None)
            .expect("switch to starter");

        for idx in 1..=2 {
            let pptx = build_synthetic_pptx_zip(
                &format!("Starter Brand {idx}"),
                &BrandColors::default(),
                "Instrument Serif",
                "Plus Jakarta Sans",
                13.333,
                7.5,
            )
            .expect("valid pptx zip");
            let kit = extract_brand_kit_from_pptx_bytes(
                &pptx,
                "org-quota",
                "starter.pptx",
                Some(&format!("Starter Brand {idx}")),
            )
            .expect("valid brand extraction");
            db.save_brand_kit(&kit)
                .expect("brand within starter limit should save");
        }

        let third_pptx = build_synthetic_pptx_zip(
            "Starter Brand 3",
            &BrandColors::default(),
            "Instrument Serif",
            "Plus Jakarta Sans",
            13.333,
            7.5,
        )
        .expect("valid pptx");
        let third_kit = extract_brand_kit_from_pptx_bytes(
            &third_pptx,
            "org-quota",
            "starter3.pptx",
            Some("Starter Brand 3"),
        )
        .expect("extract 3rd kit");

        let err = db
            .save_brand_kit(&third_kit)
            .expect_err("3rd brand on Starter (max 2) must be rejected");
        assert!(matches!(
            err,
            DbError::BrandQuotaExceeded {
                used_brands: 2,
                max_brands: 2,
                ..
            }
        ));

        // 2. Upgrade to Pro (max 4 brands): 3rd and 4th succeed, 5th is blocked
        db.update_subscription("org-quota", "pro", None, None)
            .expect("upgrade to pro");
        db.save_brand_kit(&third_kit)
            .expect("3rd brand allowed on Pro");

        let fourth_kit = extract_brand_kit_from_pptx_bytes(
            &third_pptx,
            "org-quota",
            "pro4.pptx",
            Some("Pro Brand 4"),
        )
        .expect("extract 4th kit");
        db.save_brand_kit(&fourth_kit)
            .expect("4th brand allowed on Pro");

        let fifth_kit = extract_brand_kit_from_pptx_bytes(
            &third_pptx,
            "org-quota",
            "pro5.pptx",
            Some("Pro Brand 5"),
        )
        .expect("extract 5th kit");
        let pro_err = db
            .save_brand_kit(&fifth_kit)
            .expect_err("5th brand on Pro (max 4) must be rejected");
        assert!(matches!(
            pro_err,
            DbError::BrandQuotaExceeded {
                used_brands: 4,
                max_brands: 4,
                ..
            }
        ));

        // 3. Upgrade to Enterprise (max 16 brands): 5th through 16th succeed, 17th is blocked
        let (_, ent_quota) = db
            .update_subscription("org-quota", "enterprise", None, None)
            .expect("upgrade to enterprise");
        assert_eq!(ent_quota.max_brands, 16);
        assert_eq!(ent_quota.daily_deck_limit, 100);

        for idx in 5..=16 {
            let kit = extract_brand_kit_from_pptx_bytes(
                &third_pptx,
                "org-quota",
                "ent.pptx",
                Some(&format!("Enterprise Brand {idx}")),
            )
            .expect("extract enterprise brand");
            db.save_brand_kit(&kit)
                .expect("brands 5..=16 allowed on Enterprise");
        }
        let seventeenth_kit = extract_brand_kit_from_pptx_bytes(
            &third_pptx,
            "org-quota",
            "ent17.pptx",
            Some("Enterprise Brand 17"),
        )
        .expect("extract 17th kit");
        let ent_err = db
            .save_brand_kit(&seventeenth_kit)
            .expect_err("17th brand on Enterprise (max 16) must be rejected");
        assert!(matches!(
            ent_err,
            DbError::BrandQuotaExceeded {
                used_brands: 16,
                max_brands: 16,
                ..
            }
        ));
    }

    #[test]
    fn test_pptx_xml_extraction_and_emu_conversion() {
        assert_eq!(emu_to_inches(12_191_695, 13.333), 13.333);
        assert_eq!(emu_to_inches(6_858_000, 7.5), 7.5);
        assert_eq!(emu_to_inches(914_400, 1.0), 1.0);

        let mut custom_colors = BrandColors::default();
        custom_colors.dk1 = "#111827".to_string();
        custom_colors.lt1 = "#F9FAFB".to_string();
        custom_colors.dk2 = "#1F2937".to_string();
        custom_colors.lt2 = "#F3F4F6".to_string();
        custom_colors.accent1 = "#E11D48".to_string();
        custom_colors.accent2 = "#2563EB".to_string();
        custom_colors.accent3 = "#059669".to_string();
        custom_colors.accent4 = "#D97706".to_string();
        custom_colors.accent5 = "#7C3AED".to_string();
        custom_colors.accent6 = "#DC2626".to_string();

        let pptx_bytes = build_synthetic_pptx_zip(
            "Acme Corp CVI",
            &custom_colors,
            "Space Grotesk",
            "IBM Plex Sans",
            13.333,
            7.5,
        )
        .expect("should build valid Office Open XML zip");

        let kit = extract_brand_kit_from_pptx_bytes(
            &pptx_bytes,
            "org-acme",
            "acme-theme.pptx",
            None,
        )
        .expect("should parse theme1.xml and presentation.xml");

        assert_eq!(kit.name, "Acme Corp CVI");
        assert_eq!(kit.id, "brand-acme-corp-cvi");
        assert_eq!(kit.colors.dk1, "#111827");
        assert_eq!(kit.colors.lt1, "#F9FAFB");
        assert_eq!(kit.colors.dk2, "#1F2937");
        assert_eq!(kit.colors.lt2, "#F3F4F6");
        assert_eq!(kit.colors.accent1, "#E11D48");
        assert_eq!(kit.colors.accent2, "#2563EB");
        assert_eq!(kit.colors.accent3, "#059669");
        assert_eq!(kit.colors.accent4, "#D97706");
        assert_eq!(kit.colors.accent5, "#7C3AED");
        assert_eq!(kit.colors.accent6, "#DC2626");
        assert_eq!(kit.major_font, "Space Grotesk");
        assert_eq!(kit.minor_font, "IBM Plex Sans");
        assert_eq!(kit.slide_width_in, 13.333);
        assert_eq!(kit.slide_height_in, 7.5);
        assert!(kit.wcag_aa_passed);
    }

    #[test]
    fn test_wcag_contrast_math_and_csv_telemetry_export() {
        // Pure black (#000000) vs pure white (#FFFFFF) = 21.0:1
        assert_eq!(wcag_contrast_ratio("#000000", "#FFFFFF"), 21.0);
        // Identical colours = 1.0:1
        assert_eq!(wcag_contrast_ratio("#1E293B", "#1E293B"), 1.0);
        // Dark slate (#0F172A) on warm ivory (#FAF8F5) exceeds WCAG AA (4.5:1) and AAA (7.0:1)
        let body_ratio = wcag_contrast_ratio("#0F172A", "#FAF8F5");
        assert!(body_ratio >= 15.0, "expected >= 15.0, got {body_ratio}");

        let (passed, checks) = evaluate_brand_contrast(&BrandColors::default());
        assert!(passed, "default BrandColors must pass all WCAG 2.1 AA checks");
        assert_eq!(checks.len(), 7);

        let db = Database::open_in_memory().expect("in-memory sqlite");
        db.record_telemetry(&UsageTelemetry {
            id: "tel-1".to_string(),
            org_id: "default-org".to_string(),
            deck_slug: "q4-architecture".to_string(),
            operation: "create_deck".to_string(),
            prompt_tokens: 1450,
            completion_tokens: 980,
            llm_cost_usd: 0.0142,
            worker_cost_usd: 0.0018,
            total_cost_usd: 0.0160,
            render_ms: 840,
            created_at: "2026-01-01T12:00:00Z".to_string(),
        })
        .expect("record telemetry");

        let csv = db
            .export_cost_telemetry_csv("default-org")
            .expect("export csv");
        assert!(csv.starts_with(
            "timestamp,deckSlug,operation,promptTokens,completionTokens,llmCostUsd,workerCostUsd,totalCostUsd,renderDurationMs"
        ));
        assert!(csv.contains("q4-architecture,create_deck,1450,980"));
    }

    #[test]
    fn test_compiler_synthesize_compile_html_and_export_zip() {
        use std::io::{Cursor, Read};
        use zip::ZipArchive;
        use crate::compiler::{
            build_brand_css_variables, compile_deck_to_html, default_brand_kit_for_org,
            export_deck_to_zip_bytes, synthesize_deck_from_brief,
        };

        let mut brand = default_brand_kit_for_org("org-compiler-test");
        brand.name = "Nordic Architecture CVI".to_string();
        brand.company_name = "Nordic Architecture Labs".to_string();
        brand.colors.primary = "#1E293B".to_string();
        brand.colors.accent = "#D94E28".to_string();

        // 1. Test build_brand_css_variables
        let css_vars = build_brand_css_variables(&brand);
        assert!(css_vars.contains(":root {"));
        assert!(css_vars.contains("--brand-primary: #1E293B;"));
        assert!(css_vars.contains("--brand-accent: #D94E28;"));
        assert!(css_vars.contains("--stage-width: 1600px;"));
        assert!(css_vars.contains("--stage-height: 900px;"));

        // 2. Test synthesize_deck_from_brief (produces 7..=9 slides across all required types)
        let deck = synthesize_deck_from_brief(
            "q4-cloud-migration",
            "Q4 Zero-Downtime Cloud Migration. Cut P99 latency by 42% across regional clusters.",
            "Platform Architecture Board",
            &brand,
        );
        assert_eq!(deck.slug, "q4-cloud-migration");
        assert_eq!(deck.org_id, "org-compiler-test");
        assert_eq!(deck.brand_kit_id, brand.id);
        assert!(
            (7..=9).contains(&deck.slides.len()),
            "synthesized deck should contain 7..=9 slides, got {}",
            deck.slides.len()
        );
        assert_eq!(deck.slides.first().unwrap().slide_type, "cover");
        assert_eq!(deck.slides.last().unwrap().slide_type, "end");
        assert!(deck.slides.iter().any(|s| s.slide_type == "content"));
        assert!(deck.slides.iter().any(|s| s.slide_type == "content-alt"));
        assert!(deck.slides.iter().any(|s| s.slide_type == "content-dark"));
        assert!(deck.slides.iter().any(|s| s.slide_type == "statement"));

        // 3. Test compile_deck_to_html
        let html = compile_deck_to_html(&deck, &brand);
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains(r#"class="deck-stage""#));
        assert!(html.contains("--brand-primary: #1E293B;"));
        assert!(html.contains("Q4 Zero-Downtime Cloud Migration"));
        assert!(html.contains("Platform Architecture Board"));
        assert!(html.contains("window.__BRAND_KIT__"));
        assert!(html.contains("window.__DECK_META__"));

        // 4. Test export_deck_to_zip_bytes and verify archive entries
        let zip_bytes =
            export_deck_to_zip_bytes(&deck, &brand).expect("ZIP export should succeed");
        assert!(!zip_bytes.is_empty());

        let mut archive =
            ZipArchive::new(Cursor::new(zip_bytes)).expect("valid ZIP archive bytes");
        let mut entry_names = Vec::new();
        for i in 0..archive.len() {
            let file = archive.by_index(i).expect("zip entry");
            entry_names.push(file.name().to_string());
        }
        assert!(entry_names.contains(&"index.html".to_string()));
        assert!(entry_names.contains(&"engine/deck-engine.css".to_string()));
        assert!(entry_names.contains(&"engine/deck-engine.js".to_string()));
        assert!(entry_names.contains(&"README.txt".to_string()));

        let mut readme_text = String::new();
        archive
            .by_name("README.txt")
            .expect("README.txt entry")
            .read_to_string(&mut readme_text)
            .expect("read README.txt");
        assert!(readme_text.contains("q4-cloud-migration"));
        assert!(readme_text.contains("Nordic Architecture CVI"));
    }
}
