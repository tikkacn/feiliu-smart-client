use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

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

/// The mutually exclusive line classification shown in the line-optimization
/// settings. These are the seven non-empty subsets of the three mainland
/// operators. Runtime groups are derived from membership rather than from
/// this enum's display name.
#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum LineCategory {
    Telecom,
    Unicom,
    Mobile,
    TelecomUnicom,
    TelecomMobile,
    UnicomMobile,
    ThreeNetwork,
}

impl LineCategory {
    pub const ALL: [Self; 7] = [
        Self::Telecom,
        Self::Unicom,
        Self::Mobile,
        Self::TelecomUnicom,
        Self::TelecomMobile,
        Self::UnicomMobile,
        Self::ThreeNetwork,
    ];

    pub const fn includes(self, operator: NetworkOperator) -> bool {
        match operator {
            NetworkOperator::Telecom => matches!(
                self,
                Self::Telecom | Self::TelecomUnicom | Self::TelecomMobile | Self::ThreeNetwork
            ),
            NetworkOperator::Unicom => matches!(
                self,
                Self::Unicom | Self::TelecomUnicom | Self::UnicomMobile | Self::ThreeNetwork
            ),
            NetworkOperator::Mobile => matches!(
                self,
                Self::Mobile | Self::TelecomMobile | Self::UnicomMobile | Self::ThreeNetwork
            ),
            NetworkOperator::Unknown => false,
        }
    }
}

const fn default_builtin_rules() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CustomRuleBehavior {
    #[default]
    Classical,
    Domain,
    Ipcidr,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CustomRuleFormat {
    #[default]
    Yaml,
    Text,
    Mrs,
}

/// A user-managed rule source that is added to the generated Mihomo config.
///
/// URL sources are refreshed by Mihomo on their configured interval. File
/// sources intentionally keep the selected path so users can edit the file
/// with their preferred editor and let Mihomo reload it.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum CustomRuleSource {
    Url { url: String },
    File { path: String },
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomRuleSet {
    pub id: String,
    pub name: String,
    pub source: CustomRuleSource,
    #[serde(default)]
    pub behavior: CustomRuleBehavior,
    #[serde(default)]
    pub format: CustomRuleFormat,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub target: Option<String>,
}

const fn default_enabled() -> bool {
    true
}

/// Smart-routing settings. Published node classifications are downloaded from
/// the Feiliu management site after subscription nodes are available.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SmartRouteConfig {
    #[serde(default)]
    pub node_categories: BTreeMap<String, LineCategory>,
    /// Categories published by the Feiliu line-classification service.
    #[serde(default)]
    pub remote_node_categories: BTreeMap<String, LineCategory>,
    #[serde(default)]
    pub remote_manifest_version: Option<u64>,
    #[serde(default)]
    pub remote_manifest_updated_at: Option<String>,
    #[serde(default = "default_builtin_rules")]
    pub use_builtin_rules: bool,
    #[serde(default)]
    pub custom_rules: Vec<CustomRuleSet>,
}

impl Default for SmartRouteConfig {
    fn default() -> Self {
        Self {
            node_categories: BTreeMap::new(),
            remote_node_categories: BTreeMap::new(),
            remote_manifest_version: None,
            remote_manifest_updated_at: None,
            use_builtin_rules: true,
            custom_rules: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteClassificationEntry {
    pub match_key: String,
    pub category: LineCategory,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RemoteClassificationManifest {
    pub schema_version: u32,
    pub version: u64,
    pub updated_at: String,
    pub nodes: Vec<RemoteClassificationEntry>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SmartClassificationSyncResult {
    pub version: u64,
    pub updated_at: String,
    pub categories: usize,
    pub fetched_at: u64,
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
