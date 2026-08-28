use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::{Context as _, Result, bail};

use super::model::{LineCategory, RemoteClassificationManifest};

pub const CLASSIFICATION_MANIFEST_URL: &str = "https://jiedian.328671.xyz/manifest.php";
const MANIFEST_SCHEMA_VERSION: u32 = 1;

pub async fn fetch_manifest() -> Result<RemoteClassificationManifest> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("Feiliu-Smart-Client/line-classification")
        .build()
        .context("failed to create classification client")?;

    let response = client
        .get(CLASSIFICATION_MANIFEST_URL)
        .header(reqwest::header::ACCEPT, "application/json")
        .send()
        .await
        .context("failed to request line classification service")?;

    let status = response.status();
    if !status.is_success() {
        bail!("line classification service returned HTTP {status}");
    }

    let manifest = response
        .json::<RemoteClassificationManifest>()
        .await
        .context("invalid line classification response")?;
    validate_manifest(&manifest)?;
    Ok(manifest)
}

pub fn validate_manifest(manifest: &RemoteClassificationManifest) -> Result<()> {
    if manifest.schema_version != MANIFEST_SCHEMA_VERSION {
        bail!(
            "unsupported line classification schema version: {}",
            manifest.schema_version
        );
    }
    if manifest.version == 0 {
        bail!("line classification version must be greater than zero");
    }
    if manifest.updated_at.trim().is_empty() {
        bail!("line classification updatedAt is empty");
    }

    let mut seen = BTreeMap::new();
    for entry in &manifest.nodes {
        let key = normalize_node_key(&entry.match_key);
        if key.is_empty() {
            bail!("line classification contains an empty matchKey");
        }
        if seen.insert(key, entry.category).is_some() {
            bail!("line classification contains duplicate matchKey");
        }
    }
    Ok(())
}

pub fn classification_map(manifest: &RemoteClassificationManifest) -> BTreeMap<String, LineCategory> {
    manifest
        .nodes
        .iter()
        .map(|entry| (normalize_node_key(&entry.match_key), entry.category))
        .collect()
}

pub fn normalize_node_key(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{classification_map, normalize_node_key, validate_manifest};
    use crate::smart::model::{LineCategory, RemoteClassificationEntry, RemoteClassificationManifest};

    fn manifest() -> RemoteClassificationManifest {
        RemoteClassificationManifest {
            schema_version: 1,
            version: 3,
            updated_at: "2026-08-28T00:00:00Z".into(),
            nodes: vec![RemoteClassificationEntry {
                match_key: "  HK-01   ".into(),
                category: LineCategory::TelecomUnicom,
            }],
        }
    }

    #[test]
    fn normalizes_match_keys() {
        assert_eq!(normalize_node_key("  HK-01   "), "hk-01");
        assert_eq!(classification_map(&manifest())["hk-01"], LineCategory::TelecomUnicom);
    }

    #[test]
    fn rejects_duplicate_match_keys_after_normalization() {
        let mut value = manifest();
        value.nodes.push(RemoteClassificationEntry {
            match_key: "hk-01".into(),
            category: LineCategory::Mobile,
        });
        assert!(validate_manifest(&value).is_err());
    }
}
