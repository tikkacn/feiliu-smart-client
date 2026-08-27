use serde::{Deserialize, Serialize};

/// The network category used to bias the local automatic route selector.
///
/// This is intentionally a small local value object. It is not a subscription,
/// account or remote-service model, and it never contains node credentials.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum NetworkOperator {
    Telecom,
    Unicom,
    Mobile,
    #[default]
    Unknown,
}

impl NetworkOperator {
    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "telecom" => Some(Self::Telecom),
            "unicom" => Some(Self::Unicom),
            "mobile" => Some(Self::Mobile),
            "unknown" => Some(Self::Unknown),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SmartNetworkState {
    pub operator: NetworkOperator,
    pub confidence: f32,
    pub updated_at: u64,
}

impl Default for SmartNetworkState {
    fn default() -> Self {
        Self {
            operator: NetworkOperator::Unknown,
            confidence: 0.0,
            updated_at: 0,
        }
    }
}
