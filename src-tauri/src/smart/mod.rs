pub mod model;
pub mod overlay;

use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use parking_lot::RwLock;

use self::model::{NetworkOperator, SmartNetworkState};

static NETWORK_STATE: OnceLock<RwLock<SmartNetworkState>> = OnceLock::new();

fn network_store() -> &'static RwLock<SmartNetworkState> {
    NETWORK_STATE.get_or_init(|| RwLock::new(SmartNetworkState::default()))
}

pub fn update_network(operator: NetworkOperator, confidence: f32) -> bool {
    let mut state = network_store().write();
    let confidence = confidence.clamp(0.0, 1.0);
    if state.operator == operator && (state.confidence - confidence).abs() < 0.01 {
        return false;
    }

    *state = SmartNetworkState {
        operator,
        confidence,
        updated_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_secs()),
    };
    true
}

pub fn current_network() -> SmartNetworkState {
    network_store().read().clone()
}
