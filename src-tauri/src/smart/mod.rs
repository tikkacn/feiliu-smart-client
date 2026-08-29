pub mod model;
pub mod overlay;
pub mod remote;
pub mod rules;

use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Result, bail};
use parking_lot::RwLock;

use crate::{
    config::{Config, IVerge},
    feat,
};

use self::model::{NetworkOperator, SmartClassificationSyncResult, SmartNetworkState};

static NETWORK_STATE: OnceLock<RwLock<SmartNetworkState>> = OnceLock::new();

fn network_store() -> &'static RwLock<SmartNetworkState> {
    NETWORK_STATE.get_or_init(|| RwLock::new(SmartNetworkState::default()))
}

/// Updates the local network hint and returns the previous state when a
/// change was made. The previous value lets callers roll back the hint if
/// regenerating the runtime configuration fails.
pub fn update_network(operator: NetworkOperator, confidence: f32) -> Option<SmartNetworkState> {
    let confidence = confidence.clamp(0.0, 1.0);
    let previous = {
        let mut state = network_store().write();
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
        previous
    };
    Some(previous)
}

pub fn restore_network(previous: SmartNetworkState) {
    *network_store().write() = previous;
}

pub fn current_network() -> SmartNetworkState {
    network_store().read().clone()
}

/// Downloads and persists the current node classification catalog.
///
/// This belongs in the backend update path as well as the frontend command:
/// subscription regeneration must see the catalog before it builds the
/// operator groups. The existing route preferences are intentionally cloned,
/// so refreshing the catalog never resets the user's selected operator or
/// rule settings.
pub async fn refresh_remote_classifications() -> Result<SmartClassificationSyncResult> {
    let manifest = remote::fetch_manifest().await?;
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

    feat::patch_verge(
        &IVerge {
            smart_route: Some(smart_route),
            ..IVerge::default()
        },
        false,
    )
    .await?;

    Ok(SmartClassificationSyncResult {
        version: manifest.version,
        updated_at: manifest.updated_at,
        categories: categories.len(),
        fetched_at,
    })
}

/// Refreshes the catalog and immediately rebuilds the active runtime config.
/// This is used by the standalone frontend sync command; subscription updates
/// call the persistence-only function above and rebuild once in their normal
/// update transaction.
pub async fn refresh_remote_classifications_and_apply() -> Result<SmartClassificationSyncResult> {
    let result = Box::pin(refresh_remote_classifications()).await?;
    let outcome = feat::enhance_profiles().await?;
    if !outcome.is_valid() {
        bail!("应用节点分类后的运行配置失败: {outcome}");
    }

    crate::core::handle::Handle::refresh_clash();
    Ok(result)
}

/// Persists the user-selected operator without changing the live detector
/// state. Returns whether the saved configuration actually changed.
pub async fn persist_preferred_operator(operator: NetworkOperator) -> Result<bool> {
    let mut smart_route = Config::verge()
        .await
        .latest_arc()
        .smart_route
        .clone()
        .unwrap_or_default();
    if smart_route.preferred_operator == operator {
        return Ok(false);
    }

    smart_route.preferred_operator = operator;
    feat::patch_verge(
        &IVerge {
            smart_route: Some(smart_route),
            ..IVerge::default()
        },
        false,
    )
    .await?;
    Ok(true)
}
