use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlystreamPolicy {
    pub version: String,
    pub status: String,
    pub content_hash: String,
    pub generated_at: String,
    pub operator: String,
    pub rules_version: String,
    pub nodes: Vec<FlystreamNode>,
    pub pools: Vec<FlystreamPool>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlystreamNode {
    pub id: String,
    pub display_name: String,
    pub protocol: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FlystreamPool {
    pub id: String,
    pub business: String,
    pub mode: String,
    pub node_ids: Vec<String>,
    pub fallback_node_ids: Vec<String>,
    pub health_check_url: Option<String>,
}
