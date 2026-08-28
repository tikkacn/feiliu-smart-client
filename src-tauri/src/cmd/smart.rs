use crate::{
    cmd::{CmdResult, coded_error},
    config::{Config, IVerge},
    feat,
    smart::{
        self,
        model::{NetworkOperator, SmartClassificationSyncResult},
        remote,
    },
};
use clash_verge_logging::{Type, logging};
use std::time::{SystemTime, UNIX_EPOCH};

#[tauri::command]
pub async fn set_smart_network(
    operator: String,
    confidence: f32,
) -> CmdResult<crate::core::validate::ValidationOutcome> {
    let Some(operator) = NetworkOperator::parse(&operator) else {
        return Err(coded_error("SMART_ROUTE_INVALID_OPERATOR", "无法识别当前网络运营商"));
    };
    let Some(previous_network) = smart::update_network(operator, confidence) else {
        return Ok(crate::core::validate::ValidationOutcome::Valid);
    };

    match feat::enhance_profiles().await {
        Ok(outcome) if outcome.is_valid() => {
            crate::core::handle::Handle::refresh_clash();
            Ok(outcome)
        }
        Ok(outcome) => {
            smart::restore_network(previous_network);
            Ok(outcome)
        }
        Err(error) => {
            smart::restore_network(previous_network);
            logging!(error, Type::Config, "自动选线配置应用失败: {error:#}");
            Err(coded_error("SMART_ROUTE_APPLY_FAILED", error))
        }
    }
}

/// Fetches the published node classifications from the Feiliu management site.
/// The published classification is authoritative; legacy local classifications
/// are cleared after a successful fetch so they cannot override website data.
#[tauri::command]
pub async fn sync_smart_classifications() -> CmdResult<SmartClassificationSyncResult> {
    let manifest = remote::fetch_manifest()
        .await
        .map_err(|error| coded_error("SMART_ROUTE_REMOTE_SYNC_FAILED", error))?;
    let categories = remote::classification_map(&manifest);
    let fetched_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |duration| duration.as_secs());

    let mut smart_route = Config::verge()
        .await
        .latest_arc()
        .smart_route
        .clone()
        .unwrap_or_default();
    smart_route.node_categories.clear();
    smart_route.remote_node_categories = categories.clone();
    smart_route.remote_manifest_version = Some(manifest.version);
    smart_route.remote_manifest_updated_at = Some(manifest.updated_at.clone());

    match feat::patch_verge(
        &IVerge {
            smart_route: Some(smart_route),
            ..IVerge::default()
        },
        false,
    )
    .await
    {
        Ok(()) => Ok(SmartClassificationSyncResult {
            version: manifest.version,
            updated_at: manifest.updated_at,
            categories: categories.len(),
            fetched_at,
        }),
        Err(error) => {
            logging!(error, Type::Config, "远程节点分类应用失败: {error:#}");
            Err(coded_error("SMART_ROUTE_REMOTE_APPLY_FAILED", error))
        }
    }
}
