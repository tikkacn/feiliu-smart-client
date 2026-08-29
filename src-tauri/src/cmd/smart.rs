use crate::{
    cmd::{CmdResult, coded_error},
    config::Config,
    feat,
    smart::{
        self,
        model::{NetworkOperator, SmartClassificationSyncResult},
    },
};
use clash_verge_logging::{Type, logging};

#[tauri::command]
pub async fn set_smart_network(
    operator: String,
    confidence: f32,
) -> CmdResult<crate::core::validate::ValidationOutcome> {
    let Some(operator) = NetworkOperator::parse(&operator) else {
        return Err(coded_error("SMART_ROUTE_INVALID_OPERATOR", "无法识别当前网络运营商"));
    };

    // A fresh install or a race between the first proxy refresh and this
    // dialog can leave the catalog empty. Fetch it before generating the
    // runtime config so the selected operator has real optimized members.
    let has_remote_classifications = Config::verge()
        .await
        .latest_arc()
        .smart_route
        .as_ref()
        .is_some_and(|settings| !settings.remote_node_categories.is_empty());
    if !has_remote_classifications && let Err(error) = smart::refresh_remote_classifications().await {
        logging!(
            warn,
            Type::Config,
            "自动选线前更新节点分类失败，将继续使用已有配置: {error:#}"
        );
    }

    let previous_network = smart::update_network(operator, confidence);
    let preference_changed = match smart::persist_preferred_operator(operator).await {
        Ok(changed) => changed,
        Err(error) => {
            if let Some(previous_network) = previous_network.clone() {
                smart::restore_network(previous_network);
            }
            logging!(error, Type::Config, "保存自动选线运营商失败: {error:#}");
            return Err(coded_error("SMART_ROUTE_PREFERENCE_SAVE_FAILED", error));
        }
    };

    if previous_network.is_none() && !preference_changed {
        return Ok(crate::core::validate::ValidationOutcome::Valid);
    }

    match feat::enhance_profiles().await {
        Ok(outcome) if outcome.is_valid() => {
            crate::core::handle::Handle::refresh_clash();
            Ok(outcome)
        }
        Ok(outcome) => {
            if let Some(previous_network) = previous_network.clone() {
                smart::restore_network(previous_network);
            }
            Ok(outcome)
        }
        Err(error) => {
            if let Some(previous_network) = previous_network.clone() {
                smart::restore_network(previous_network);
            }
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
    smart::refresh_remote_classifications_and_apply()
        .await
        .map_err(|error| coded_error("SMART_ROUTE_REMOTE_SYNC_FAILED", error))
}
