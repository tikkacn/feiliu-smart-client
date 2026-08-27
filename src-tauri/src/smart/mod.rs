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

/// Updates the local network hint and returns the previous state when a
/// change was made. The previous value lets callers roll back the hint if
/// regenerating the runtime configuration fails.
pub fn update_network(operator: NetworkOperator, confidence: f32) -> Option<SmartNetworkState> {
    let mut state = network_store().write();
    let confidence = confidence.clamp(0.0, 1.0);
    if state.operator == operator && (state.confidence - confidence).abs() < 0.01 {
        return None;
    }

    let previous = state.clone();
    *state = SmartNetworkState {
        operator,
        confidence,
        updated_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |duration| duration.as_secs()),
    };
    Some(previous)
}

pub fn restore_network(previous: SmartNetworkState) {
    *network_store().write() = previous;
}

pub fn current_network() -> SmartNetworkState {
    network_store().read().clone()
}
