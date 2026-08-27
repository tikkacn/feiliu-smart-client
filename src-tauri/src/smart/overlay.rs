use std::collections::HashSet;

use serde_yaml_ng::{Mapping, Value};

use super::{current_policy, model::FlystreamPolicy};

/// Applies Flystream groups to the generated runtime mapping only.
///
/// The original profile is never changed. Nodes are resolved by their existing
/// display names, so a stale policy can only add groups with known nodes.
pub fn apply_current_policy(config: &mut Mapping) -> usize {
    let Some(policy) = current_policy() else {
        return 0;
    };
    apply_policy_overlay(config, &policy)
}

pub fn apply_policy_overlay(config: &mut Mapping, policy: &FlystreamPolicy) -> usize {
    let existing_nodes = existing_proxy_names(config);
    if existing_nodes.is_empty() {
        return 0;
    }

    if !config.contains_key("proxy-groups") {
        config.insert("proxy-groups".into(), Value::Sequence(Vec::new()));
    }
    let Some(groups) = config
        .get_mut("proxy-groups")
        .and_then(Value::as_sequence_mut)
    else {
        return 0;
    };

    let mut applied = 0;
    for pool in &policy.pools {
        let nodes = resolve_node_names(&pool.node_ids, policy, &existing_nodes);
        if nodes.is_empty() {
            continue;
        }
        let fallback = resolve_node_names(&pool.fallback_node_ids, policy, &existing_nodes);
        let group_name = format!("Flystream/{}", pool.id);
        let group = build_group(&group_name, pool, nodes, fallback);

        groups.retain(|value| mapping_string(value, "name") != Some(group_name.as_str()));
        groups.push(Value::Mapping(group));
        applied += 1;
    }

    applied
}

fn existing_proxy_names(config: &Mapping) -> HashSet<String> {
    config
        .get("proxies")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|proxy| mapping_string(proxy, "name").map(str::to_owned))
        .collect()
}

fn resolve_node_names(
    ids: &[String],
    policy: &FlystreamPolicy,
    existing_nodes: &HashSet<String>,
) -> Vec<String> {
    ids.iter()
        .filter_map(|id| policy.nodes.iter().find(|node| &node.id == id))
        .filter(|node| node.enabled && existing_nodes.contains(&node.display_name))
        .map(|node| node.display_name.clone())
        .collect()
}

fn build_group(
    group_name: &str,
    pool: &super::model::FlystreamPool,
    nodes: Vec<String>,
    fallback: Vec<String>,
) -> Mapping {
    let mut ordered_nodes = fallback;
    for node in nodes {
        if !ordered_nodes.contains(&node) {
            ordered_nodes.push(node);
        }
    }
    let mut group = Mapping::new();
    group.insert("name".into(), group_name.into());
    group.insert("type".into(), group_type(&pool.mode).into());
    group.insert("proxies".into(), ordered_nodes.into());
    if let Some(url) = &pool.health_check_url {
        group.insert("url".into(), url.clone().into());
        group.insert("interval".into(), 300.into());
    }
    group
}

fn group_type(mode: &str) -> &'static str {
    match mode {
        "url-test" => "url-test",
        "fallback" => "fallback",
        _ => "select",
    }
}

fn mapping_string<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    value
        .as_mapping()
        .and_then(|mapping| mapping.get(key))
        .and_then(Value::as_str)
}

#[cfg(test)]
mod tests {
    use super::{apply_policy_overlay, model::FlystreamPolicy};
    use serde_yaml_ng::Value;

    #[test]
    fn applies_only_nodes_already_present_in_runtime_config() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "proxies:\n  - name: HK-01\n    type: vmess\nproxy-groups: []\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");
        let policy = FlystreamPolicy {
            version: "p1".into(),
            status: "validated".into(),
            content_hash: "sha256:test".into(),
            generated_at: "2026-08-25T00:00:00Z".into(),
            operator: "unknown".into(),
            rules_version: "r1".into(),
            nodes: vec![
                super::super::model::FlystreamNode {
                    id: "hk".into(),
                    display_name: "HK-01".into(),
                    protocol: "vmess".into(),
                    enabled: true,
                },
                super::super::model::FlystreamNode {
                    id: "missing".into(),
                    display_name: "US-01".into(),
                    protocol: "trojan".into(),
                    enabled: true,
                },
            ],
            pools: vec![super::super::model::FlystreamPool {
                id: "telecom-general".into(),
                business: "general".into(),
                mode: "url-test".into(),
                node_ids: vec!["hk".into(), "missing".into()],
                fallback_node_ids: vec!["hk".into()],
                health_check_url: None,
            }],
        };

        assert_eq!(apply_policy_overlay(&mut config, &policy), 1);
        let groups = config
            .get("proxy-groups")
            .and_then(Value::as_sequence)
            .expect("groups");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["proxies"][0], "HK-01");
    }
}
