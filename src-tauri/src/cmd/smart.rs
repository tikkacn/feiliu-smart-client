use crate::{
    cmd::{CmdResult, coded_error},
    feat,
    smart::{self, model::NetworkOperator},
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
