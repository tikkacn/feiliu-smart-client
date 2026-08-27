use crate::{
    cmd::{CmdResult, coded_error},
    feat,
    smart::{self, model::FlystreamPolicy},
};
use clash_verge_logging::{Type, logging};

#[tauri::command]
pub async fn set_flystream_policy(
    policy: FlystreamPolicy,
) -> CmdResult<crate::core::validate::ValidationOutcome> {
    let previous = smart::replace_policy(Some(policy));
    match feat::enhance_profiles().await {
        Ok(outcome) if outcome.is_valid() => Ok(outcome),
        Ok(outcome) => {
            smart::replace_policy(previous);
            Ok(outcome)
        }
        Err(error) => {
            smart::replace_policy(previous);
            logging!(error, Type::Config, "飞流策略应用失败: {error:#}");
            Err(coded_error("FLYSTREAM_POLICY_APPLY_FAILED", error))
        }
    }
}

#[tauri::command]
pub async fn clear_flystream_policy() -> CmdResult<crate::core::validate::ValidationOutcome> {
    let previous = smart::replace_policy(None);
    match feat::enhance_profiles().await {
        Ok(outcome) if outcome.is_valid() => Ok(outcome),
        Ok(outcome) => {
            smart::replace_policy(previous);
            Ok(outcome)
        }
        Err(error) => {
            smart::replace_policy(previous);
            logging!(error, Type::Config, "清除飞流策略失败: {error:#}");
            Err(coded_error("FLYSTREAM_POLICY_CLEAR_FAILED", error))
        }
    }
}

#[tauri::command]
pub fn get_flystream_policy() -> Option<FlystreamPolicy> {
    smart::current_policy()
}
