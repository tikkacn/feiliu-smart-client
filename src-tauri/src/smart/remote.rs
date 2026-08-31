use std::collections::BTreeMap;

use anyhow::{Context as _, Result, bail};

use crate::utils::network::{NetworkManager, ProxyType};

use super::model::{LineCategory, RemoteClassificationManifest};

pub const CLASSIFICATION_MANIFEST_URL: &str = "https://jiedian.328671.xyz/manifest.php";
const MANIFEST_SCHEMA_VERSION: u32 = 1;
const MANIFEST_TIMEOUT_SECONDS: u64 = 4;

pub async fn fetch_manifest() -> Result<RemoteClassificationManifest> {
    let network = NetworkManager::new();
    let user_agent = Some("Feiliu-Smart-Client/line-classification".into());

    // The Windows platform certificate verifier can block during application
    // startup even though the same URL opens immediately in the browser. Use
    // the bundled WebPKI roots for this application-owned endpoint. If the
    // direct path is unavailable after Mihomo starts, retry through its local
    // proxy so TUN, DNS and unusual local routing setups are also covered.
    let response = match network
        .get_with_static_webpki_roots(
            CLASSIFICATION_MANIFEST_URL,
            ProxyType::None,
            Some(MANIFEST_TIMEOUT_SECONDS),
            user_agent.clone(),
            false,
        )
        .await
    {
        Ok(response) => response,
        Err(direct_error) => network
            .get_with_static_webpki_roots(
                CLASSIFICATION_MANIFEST_URL,
                ProxyType::Localhost,
                Some(MANIFEST_TIMEOUT_SECONDS),
                user_agent,
                false,
            )
            .await
            .with_context(|| {
                format!("direct classification request failed ({direct_error:#}); local proxy fallback failed")
            })?,
    };

    let status = response.status();
    if !status.is_success() {
        bail!("line classification service returned HTTP {status}");
    }

    let manifest = serde_json::from_str::<RemoteClassificationManifest>(response.text())
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
