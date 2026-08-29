use crate::{
    cmd::{CmdResult, coded_error},
    feat,
    smart::{
        self,
        model::{NetworkOperator, SmartClassificationSyncResult, SmartNetworkState},
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

    let previous_network = smart::update_network(operator, confidence);
    let preference_changed = match Box::pin(smart::persist_preferred_operator(operator)).await {
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

    apply_smart_network(previous_network).await
}

async fn apply_smart_network(
    previous_network: Option<SmartNetworkState>,
) -> CmdResult<crate::core::validate::ValidationOutcome> {
    match feat::enhance_profiles().await {
        Ok(outcome) if outcome.is_valid() => {
            crate::core::handle::Handle::refresh_clash();
            Ok(outcome)
        }
        Ok(outcome) => {
            restore_network(previous_network.as_ref());
            Ok(outcome)
        }
        Err(error) => {
            restore_network(previous_network.as_ref());
            logging!(error, Type::Config, "自动选线配置应用失败: {error:#}");
            Err(coded_error("SMART_ROUTE_APPLY_FAILED", error))
        }
    }
}

fn restore_network(previous_network: Option<&SmartNetworkState>) {
    if let Some(previous_network) = previous_network {
        smart::restore_network(previous_network.clone());
    }
}

/// Fetches the published node classifications from the Feiliu management site.
/// The published classification is authoritative; legacy local classifications
/// are cleared after a successful fetch so they cannot override website data.
#[tauri::command]
pub async fn sync_smart_classifications() -> CmdResult<SmartClassificationSyncResult> {
    Box::pin(smart::refresh_remote_classifications_and_apply())
        .await
        .map_err(|error| coded_error("SMART_ROUTE_REMOTE_SYNC_FAILED", error))
}
