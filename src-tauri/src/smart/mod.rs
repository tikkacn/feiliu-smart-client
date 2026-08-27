pub mod model;
pub mod overlay;

use std::sync::OnceLock;

use parking_lot::RwLock;

use self::model::FlystreamPolicy;

static ACTIVE_POLICY: OnceLock<RwLock<Option<FlystreamPolicy>>> = OnceLock::new();

fn policy_store() -> &'static RwLock<Option<FlystreamPolicy>> {
    ACTIVE_POLICY.get_or_init(|| RwLock::new(None))
}

pub fn replace_policy(policy: Option<FlystreamPolicy>) -> Option<FlystreamPolicy> {
    let mut active = policy_store().write();
    std::mem::replace(&mut *active, policy)
}

pub fn current_policy() -> Option<FlystreamPolicy> {
    policy_store().read().clone()
}
