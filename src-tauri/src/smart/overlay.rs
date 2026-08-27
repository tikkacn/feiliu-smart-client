use serde_yaml_ng::{Mapping, Value};

use super::{
    current_network,
    model::{NetworkOperator, SmartRouteConfig},
};

const TELECOM_GROUP_NAME: &str = "电信优化";
const UNICOM_GROUP_NAME: &str = "联通优化";
const MOBILE_GROUP_NAME: &str = "移动优化";
const ALL_GROUP_NAME: &str = "全部节点";
const HEALTH_CHECK_URL: &str = "https://www.gstatic.com/generate_204";

const MANAGED_GROUP_NAMES: [&str; 4] = [TELECOM_GROUP_NAME, UNICOM_GROUP_NAME, MOBILE_GROUP_NAME, ALL_GROUP_NAME];

/// Adds local operator-aware route selectors to the generated runtime mapping.
///
/// The line settings use one of the seven non-empty operator combinations. A
/// runtime group is built from every category containing that operator, so a
/// combined line is intentionally reused by multiple groups. Nodes without a
/// category remain available through `全部节点` and individual selection, but
/// are not silently placed into an optimization group.
pub fn apply_smart_routes(config: &mut Mapping, settings: &SmartRouteConfig) -> usize {
    let existing_nodes = existing_proxy_names(config);
    let provider_names = existing_provider_names(config);
    if existing_nodes.is_empty() && provider_names.is_empty() {
        return 0;
    }

    let groups = config
        .entry("proxy-groups".into())
        .or_insert_with(|| Value::Sequence(Vec::new()))
        .as_sequence_mut();
    let Some(groups) = groups else {
        return 0;
    };

    groups.retain(|value| mapping_string(value, "name").is_none_or(|name| !MANAGED_GROUP_NAMES.contains(&name)));

    let mut added = 0;
    for (name, operator) in [
        (TELECOM_GROUP_NAME, NetworkOperator::Telecom),
        (UNICOM_GROUP_NAME, NetworkOperator::Unicom),
        (MOBILE_GROUP_NAME, NetworkOperator::Mobile),
    ] {
        let nodes = categorized_nodes(&configured_node_names(&existing_nodes, settings), settings, operator);
        if !nodes.is_empty() {
            groups.push(Value::Mapping(build_url_test_group(name, nodes)));
            added += 1;
        }
    }

    if !existing_nodes.is_empty() || !provider_names.is_empty() {
        groups.push(Value::Mapping(build_url_test_group_with_providers(
            ALL_GROUP_NAME,
            existing_nodes,
            provider_names,
        )));
        added += 1;
    }

    let default_group = selected_default_group(settings, config);
    ensure_match_rule(config, default_group);
    super::rules::apply_blackmatrix_rules(
        config,
        default_group,
        settings.use_builtin_rules,
        &settings.custom_rules,
    );
    added
}

fn existing_proxy_names(config: &Mapping) -> Vec<String> {
    config
        .get("proxies")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|proxy| mapping_string(proxy, "name").map(str::to_owned))
        .filter(|name| !matches!(name.to_ascii_uppercase().as_str(), "DIRECT" | "REJECT"))
        .collect()
}

fn existing_provider_names(config: &Mapping) -> Vec<String> {
    config
        .get("proxy-providers")
        .and_then(Value::as_mapping)
        .into_iter()
        .flat_map(|providers| providers.keys())
        .filter_map(Value::as_str)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .collect()
}

fn configured_node_names(existing_nodes: &[String], settings: &SmartRouteConfig) -> Vec<String> {
    let mut names = existing_nodes.to_vec();
    for name in settings.node_categories.keys() {
        if !names.iter().any(|existing| existing == name)
            && !matches!(name.to_ascii_uppercase().as_str(), "DIRECT" | "REJECT")
        {
            names.push(name.clone());
        }
    }
    names
}

fn categorized_nodes(nodes: &[String], settings: &SmartRouteConfig, operator: NetworkOperator) -> Vec<String> {
    nodes
        .iter()
        .filter(|name| {
            settings
                .node_categories
                .get(*name)
                .is_some_and(|category| category.includes(operator))
        })
        .cloned()
        .collect()
}

fn build_url_test_group(name: &str, nodes: Vec<String>) -> Mapping {
    let mut group = build_url_test_group_with_providers(name, Vec::new(), Vec::new());
    group.insert("include-all".into(), true.into());
    group.insert("filter".into(), node_filter(&nodes).into());
    group
}

fn build_url_test_group_with_providers(name: &str, nodes: Vec<String>, providers: Vec<String>) -> Mapping {
    let mut group = Mapping::new();
    group.insert("name".into(), name.into());
    group.insert("type".into(), "url-test".into());
    group.insert("proxies".into(), nodes.into());
    if !providers.is_empty() {
        group.insert("use".into(), providers.into());
    }
    group.insert("url".into(), HEALTH_CHECK_URL.into());
    group.insert("interval".into(), 300.into());
    group.insert("tolerance".into(), 50.into());
    group
}

fn node_filter(nodes: &[String]) -> String {
    let escaped = nodes.iter().map(|name| regex_escape(name)).collect::<Vec<_>>();
    format!("^({})$", escaped.join("|"))
}

fn regex_escape(value: &str) -> String {
    value
        .chars()
        .flat_map(|character| {
            if matches!(character, '\\' | '.' | '^' | '$' | '|' | '(' | ')' | '[' | ']' | '{' | '}' | '*' | '+' | '?' ) {
                vec!['\\', character]
            } else {
                vec![character]
            }
        })
        .collect()
}

fn selected_default_group(settings: &SmartRouteConfig, config: &Mapping) -> &'static str {
    let detected = current_network().operator;
    let detected_group = match detected {
        NetworkOperator::Telecom => TELECOM_GROUP_NAME,
        NetworkOperator::Unicom => UNICOM_GROUP_NAME,
        NetworkOperator::Mobile => MOBILE_GROUP_NAME,
        NetworkOperator::Unknown => ALL_GROUP_NAME,
    };

    if detected == NetworkOperator::Unknown {
        return ALL_GROUP_NAME;
    }

    let has_matching_node = configured_node_names(&existing_proxy_names(config), settings)
        .iter()
        .any(|name| {
        settings
            .node_categories
            .get(name)
            .is_some_and(|category| category.includes(detected))
        });
    if has_matching_node {
        detected_group
    } else {
        ALL_GROUP_NAME
    }
}

fn ensure_match_rule(config: &mut Mapping, default_group: &str) {
    let rules = config
        .entry("rules".into())
        .or_insert_with(|| Value::Sequence(Vec::new()));
    let Some(rules) = rules.as_sequence_mut() else {
        return;
    };

    if let Some(rule) = rules.iter_mut().rev().find(|value| {
        value
            .as_str()
            .is_some_and(|rule| rule.split_once(',').is_some_and(|(kind, _)| kind == "MATCH"))
    }) {
        *rule = Value::String(format!("MATCH,{default_group}"));
    } else {
        rules.push(Value::String(format!("MATCH,{default_group}")));
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
    use std::collections::BTreeMap;

    use super::apply_smart_routes;
    use crate::smart::model::{LineCategory, SmartRouteConfig};
    use serde_yaml_ng::Value;

    #[test]
    fn unclassified_nodes_fall_back_to_all_nodes() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "proxies:\n  - name: HK-01\n    type: vmess\n  - name: DIRECT\n    type: direct\nrules:\n  - MATCH,Proxy\nproxy-groups:\n  - name: 电信优化\n    type: url-test\n    proxies: [old]\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");

        assert_eq!(apply_smart_routes(&mut config, &SmartRouteConfig::default()), 1);
        let groups = config["proxy-groups"].as_sequence().expect("groups");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["name"], "全部节点");
        assert_eq!(config["rules"][0], "MATCH,全部节点");
    }

    #[test]
    fn combined_categories_are_reused_by_each_matching_operator_group() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "proxies:\n  - name: telecom\n    type: vmess\n  - name: both\n    type: vmess\n  - name: all\n    type: vmess\nproxy-groups: []\nrules:\n  - MATCH,Proxy\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");
        let settings = SmartRouteConfig {
            node_categories: BTreeMap::from([
                ("telecom".into(), LineCategory::Telecom),
                ("both".into(), LineCategory::TelecomUnicom),
                ("all".into(), LineCategory::ThreeNetwork),
            ]),
            ..SmartRouteConfig::default()
        };

        assert_eq!(apply_smart_routes(&mut config, &settings), 4);
        let groups = config["proxy-groups"].as_sequence().expect("groups");
        let group = |name: &str| {
            groups
                .iter()
                .find(|group| group["name"].as_str() == Some(name))
                .expect("group")
        };
        assert_eq!(group("电信优化")["include-all"], true);
        assert_eq!(group("电信优化")["filter"], "^(telecom|both|all)$");
        assert_eq!(group("联通优化")["filter"], "^(both|all)$");
        assert_eq!(group("移动优化")["filter"], "^(all)$");
        assert!(groups.iter().all(|group| group["name"].as_str() != Some("三网优化")));
    }
}
