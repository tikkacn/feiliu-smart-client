use serde_yaml_ng::{Mapping, Value};

use super::{current_network, model::NetworkOperator};

const AUTO_GROUP_NAME: &str = "Feiliu Auto";
const HEALTH_CHECK_URL: &str = "https://www.gstatic.com/generate_204";

/// Adds the local automatic route selector to the generated runtime mapping.
///
/// This runs after the user's merge/script stages and only changes the runtime
/// mapping. The original subscription/profile file is never modified. Mihomo
/// continuously tests the available nodes from the user's current network;
/// the locally detected operator only affects the initial candidate ordering.
pub fn apply_smart_routes(config: &mut Mapping) -> usize {
    let existing_nodes = existing_proxy_names(config);
    if existing_nodes.is_empty() {
        return 0;
    }

    let mut ordered_nodes = existing_nodes;
    let operator = current_network().operator;
    order_nodes(&mut ordered_nodes, operator);

    {
        let groups = config
            .entry("proxy-groups".into())
            .or_insert_with(|| Value::Sequence(Vec::new()))
            .as_sequence_mut();
        let Some(groups) = groups else {
            return 0;
        };

        groups.retain(|value| mapping_string(value, "name") != Some(AUTO_GROUP_NAME));
        groups.push(Value::Mapping(build_auto_group(ordered_nodes)));
    }
    ensure_match_rule(config);
    1
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

fn order_nodes(nodes: &mut [String], operator: NetworkOperator) {
    nodes.sort_by(|left, right| {
        operator_score(right, operator)
            .cmp(&operator_score(left, operator))
            .then_with(|| left.cmp(right))
    });
}

fn operator_score(name: &str, operator: NetworkOperator) -> u8 {
    let lower = name.to_ascii_lowercase();
    let preferred = match operator {
        NetworkOperator::Telecom => ["telecom", "chinanet", "cn2", "163", "电信"],
        NetworkOperator::Unicom => ["unicom", "china169", "9929", "联通", "cu"],
        NetworkOperator::Mobile => ["mobile", "cmcc", "cmi", "移动", "cm"],
        NetworkOperator::Unknown => ["", "", "", "", ""],
    };
    if preferred.iter().any(|tag| !tag.is_empty() && lower.contains(tag)) {
        2
    } else {
        1
    }
}

fn build_auto_group(nodes: Vec<String>) -> Mapping {
    let mut group = Mapping::new();
    group.insert("name".into(), AUTO_GROUP_NAME.into());
    group.insert("type".into(), "url-test".into());
    group.insert("proxies".into(), nodes.into());
    group.insert("url".into(), HEALTH_CHECK_URL.into());
    group.insert("interval".into(), 300.into());
    group.insert("tolerance".into(), 50.into());
    group
}

fn ensure_match_rule(config: &mut Mapping) {
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
        *rule = Value::String(format!("MATCH,{AUTO_GROUP_NAME}"));
    } else {
        rules.push(Value::String(format!("MATCH,{AUTO_GROUP_NAME}")));
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
    use super::{apply_smart_routes, order_nodes};
    use crate::smart::model::NetworkOperator;
    use serde_yaml_ng::Value;

    #[test]
    fn builds_a_runtime_only_auto_group() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "proxies:\n  - name: HK-01\n    type: vmess\n  - name: DIRECT\n    type: direct\nrules:\n  - MATCH,Proxy\nproxy-groups: []\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");

        assert_eq!(apply_smart_routes(&mut config), 1);
        let groups = config
            .get("proxy-groups")
            .and_then(Value::as_sequence)
            .expect("groups");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0]["proxies"][0], "HK-01");
        assert_eq!(config["rules"][0], "MATCH,Feiliu Auto");
    }

    #[test]
    fn prefers_the_current_operator_tag_without_excluding_other_nodes() {
        let mut nodes = vec!["generic".into(), "US-unicom".into(), "HK-telecom".into()];
        order_nodes(&mut nodes, NetworkOperator::Telecom);
        assert_eq!(nodes, vec!["HK-telecom", "US-unicom", "generic"]);
    }
}
