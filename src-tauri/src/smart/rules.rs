use serde_yaml_ng::{Mapping, Value};

use super::model::{CustomRuleSet, CustomRuleSource};

const PROVIDER_INTERVAL_SECONDS: u64 = 86_400;
const PROVIDER_PREFIX: &str = "Feiliu-BM-";
const CUSTOM_PROVIDER_PREFIX: &str = "Feiliu-Custom-";

const OPERATOR_GROUPS: [&str; 3] = ["电信优化", "联通优化", "移动优化"];
const ALL_GROUP_NAME: &str = "全部节点";
const SERVICE_GROUP_NAMES: [&str; 10] = [
    "Apple",
    "Google",
    "Telegram",
    "YouTube",
    "Netflix",
    "OpenAI",
    "Disney+",
    "Spotify",
    "Microsoft",
    "游戏",
];

struct BuiltinRuleProvider {
    suffix: &'static str,
    url: &'static str,
    path: &'static str,
    service_group: Option<&'static str>,
}

const BUILTIN_PROVIDERS: &[BuiltinRuleProvider] = &[
    BuiltinRuleProvider {
        suffix: "Lan",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Lan/Lan.yaml",
        path: "providers/feiliu-bm-lan.yaml",
        service_group: None,
    },
    BuiltinRuleProvider {
        suffix: "China",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/China/China_Classical.yaml",
        path: "providers/feiliu-bm-china.yaml",
        service_group: None,
    },
    BuiltinRuleProvider {
        suffix: "Global",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Global/Global_Classical.yaml",
        path: "providers/feiliu-bm-global.yaml",
        service_group: None,
    },
    BuiltinRuleProvider {
        suffix: "Apple",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Apple/Apple.yaml",
        path: "providers/feiliu-bm-apple.yaml",
        service_group: Some("Apple"),
    },
    BuiltinRuleProvider {
        suffix: "Google",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Google/Google.yaml",
        path: "providers/feiliu-bm-google.yaml",
        service_group: Some("Google"),
    },
    BuiltinRuleProvider {
        suffix: "Telegram",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Telegram/Telegram.yaml",
        path: "providers/feiliu-bm-telegram.yaml",
        service_group: Some("Telegram"),
    },
    BuiltinRuleProvider {
        suffix: "YouTube",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/YouTube/YouTube.yaml",
        path: "providers/feiliu-bm-youtube.yaml",
        service_group: Some("YouTube"),
    },
    BuiltinRuleProvider {
        suffix: "Netflix",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Netflix/Netflix.yaml",
        path: "providers/feiliu-bm-netflix.yaml",
        service_group: Some("Netflix"),
    },
    BuiltinRuleProvider {
        suffix: "OpenAI",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/OpenAI/OpenAI.yaml",
        path: "providers/feiliu-bm-openai.yaml",
        service_group: Some("OpenAI"),
    },
    BuiltinRuleProvider {
        suffix: "Disney",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Disney/Disney.yaml",
        path: "providers/feiliu-bm-disney.yaml",
        service_group: Some("Disney+"),
    },
    BuiltinRuleProvider {
        suffix: "Spotify",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Spotify/Spotify.yaml",
        path: "providers/feiliu-bm-spotify.yaml",
        service_group: Some("Spotify"),
    },
    BuiltinRuleProvider {
        suffix: "Microsoft",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Microsoft/Microsoft.yaml",
        path: "providers/feiliu-bm-microsoft.yaml",
        service_group: Some("Microsoft"),
    },
    BuiltinRuleProvider {
        suffix: "Game",
        url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/release/rule/Clash/Game/Game.yaml",
        path: "providers/feiliu-bm-game.yaml",
        service_group: Some("游戏"),
    },
];

/// Installs the selected rule sources into the runtime-only configuration.
/// Mihomo refreshes HTTP providers every 24 hours and uses its cached file when
/// an update is unavailable. User-defined sources are kept separate from the
/// built-in Blackmatrix7 sources so either set can be disabled independently.
pub fn apply_blackmatrix_rules(
    config: &mut Mapping,
    default_group: &str,
    use_builtin_rules: bool,
    custom_rules: &[CustomRuleSet],
) -> usize {
    remove_managed_rule_providers(config);
    remove_managed_rules(config);
    remove_service_groups(config);

    let mut installed = 0;
    if use_builtin_rules {
        if let Some(providers) = config
            .entry("rule-providers".into())
            .or_insert_with(|| Value::Mapping(Mapping::new()))
            .as_mapping_mut()
        {
            for provider in BUILTIN_PROVIDERS {
                let provider_name = provider_name(provider.suffix);
                providers.insert(provider_name.into(), Value::Mapping(provider_config(provider)));
            }
            installed += BUILTIN_PROVIDERS.len();
        }
    }

    installed += install_custom_providers(config, custom_rules);

    let (nodes, proxy_providers) = runtime_nodes_and_providers(config);
    let available_groups = proxy_group_names(config);
    if use_builtin_rules {
        let service_groups = BUILTIN_PROVIDERS
            .iter()
            .filter_map(|provider| provider.service_group)
            .collect::<Vec<_>>();
        install_service_groups(
            config,
            &service_groups,
            &available_groups,
            &nodes,
            &proxy_providers,
            default_group,
        );
    }
    install_managed_rules(config, default_group, use_builtin_rules, custom_rules);

    installed
}

fn provider_name(suffix: &str) -> String {
    format!("{PROVIDER_PREFIX}{suffix}")
}

fn provider_config(provider: &BuiltinRuleProvider) -> Mapping {
    let mut mapping = Mapping::new();
    mapping.insert("type".into(), "http".into());
    mapping.insert("behavior".into(), "classical".into());
    mapping.insert("format".into(), "yaml".into());
    mapping.insert("url".into(), provider.url.into());
    mapping.insert("path".into(), provider.path.into());
    mapping.insert("interval".into(), PROVIDER_INTERVAL_SECONDS.into());
    mapping
}

fn custom_provider_name(id: &str) -> String {
    let safe_id = id
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-' || *character == '_')
        .collect::<String>();
    format!(
        "{CUSTOM_PROVIDER_PREFIX}{}",
        if safe_id.is_empty() { "rule" } else { &safe_id }
    )
}

fn custom_provider_config(source: &CustomRuleSource, id: &str) -> Option<Mapping> {
    let mut mapping = Mapping::new();
    mapping.insert("behavior".into(), "classical".into());
    mapping.insert("format".into(), "yaml".into());
    mapping.insert("interval".into(), PROVIDER_INTERVAL_SECONDS.into());

    match source {
        CustomRuleSource::Url { url } if is_http_url(url) => {
            mapping.insert("type".into(), "http".into());
            mapping.insert("url".into(), url.trim().into());
            mapping.insert("path".into(), format!("providers/feiliu-custom-{id}.yaml").into());
            Some(mapping)
        }
        CustomRuleSource::File { path } if !path.trim().is_empty() => {
            mapping.insert("type".into(), "file".into());
            mapping.insert("path".into(), path.trim().into());
            Some(mapping)
        }
        _ => None,
    }
}

fn is_http_url(value: &str) -> bool {
    let value = value.trim().to_ascii_lowercase();
    value.starts_with("https://") || value.starts_with("http://")
}

fn install_custom_providers(config: &mut Mapping, custom_rules: &[CustomRuleSet]) -> usize {
    let Some(providers) = config
        .entry("rule-providers".into())
        .or_insert_with(|| Value::Mapping(Mapping::new()))
        .as_mapping_mut()
    else {
        return 0;
    };

    custom_rules
        .iter()
        .filter(|rule| rule.enabled && !rule.id.trim().is_empty() && !rule.name.trim().is_empty())
        .filter_map(|rule| {
            let provider_id = custom_provider_id(&rule.id);
            custom_provider_config(&rule.source, &provider_id)
                .map(|config| (custom_provider_name(&provider_id), config))
        })
        .map(|(name, config)| {
            providers.insert(name.into(), Value::Mapping(config));
            1
        })
        .sum()
}

fn custom_provider_id(id: &str) -> String {
    id.chars()
        .filter(|character| character.is_ascii_alphanumeric() || *character == '-' || *character == '_')
        .collect()
}

fn runtime_nodes_and_providers(config: &Mapping) -> (Vec<String>, Vec<String>) {
    let nodes = config
        .get("proxies")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|proxy| proxy.get("name").and_then(Value::as_str))
        .filter(|name| !matches!(name.to_ascii_uppercase().as_str(), "DIRECT" | "REJECT"))
        .map(str::to_owned)
        .collect();
    let providers = config
        .get("proxy-providers")
        .and_then(Value::as_mapping)
        .into_iter()
        .flat_map(|providers| providers.keys())
        .filter_map(Value::as_str)
        .map(str::to_owned)
        .collect();
    (nodes, providers)
}

fn proxy_group_names(config: &Mapping) -> Vec<String> {
    config
        .get("proxy-groups")
        .and_then(Value::as_sequence)
        .into_iter()
        .flatten()
        .filter_map(|group| group.get("name").and_then(Value::as_str))
        .map(str::to_owned)
        .collect()
}

fn install_service_groups(
    config: &mut Mapping,
    service_groups: &[&str],
    available_groups: &[String],
    nodes: &[String],
    proxy_providers: &[String],
    default_group: &str,
) {
    let Some(groups) = config
        .entry("proxy-groups".into())
        .or_insert_with(|| Value::Sequence(Vec::new()))
        .as_sequence_mut()
    else {
        return;
    };

    groups.retain(|group| {
        group
            .get("name")
            .and_then(Value::as_str)
            .is_none_or(|name| !service_groups.contains(&name))
    });

    let mut selectable_groups = Vec::new();
    for name in [default_group]
        .into_iter()
        .chain(OPERATOR_GROUPS)
        .chain([ALL_GROUP_NAME])
    {
        if available_groups.iter().any(|available| available == name)
            && !selectable_groups.iter().any(|existing| existing == name)
        {
            selectable_groups.push(name.to_owned());
        }
    }

    for service_name in service_groups {
        let mut service = Mapping::new();
        service.insert("name".into(), (*service_name).into());
        service.insert("type".into(), "select".into());

        let mut members = selectable_groups.clone();
        members.extend(nodes.iter().cloned());
        service.insert("proxies".into(), members.into());
        if !proxy_providers.is_empty() {
            service.insert("use".into(), proxy_providers.to_vec().into());
        }
        groups.push(Value::Mapping(service));
    }
}

fn install_managed_rules(
    config: &mut Mapping,
    default_group: &str,
    use_builtin_rules: bool,
    custom_rules: &[CustomRuleSet],
) {
    let available_groups = proxy_group_names(config);
    let Some(rules) = config
        .entry("rules".into())
        .or_insert_with(|| Value::Sequence(Vec::new()))
        .as_sequence_mut()
    else {
        return;
    };

    let mut managed = Vec::new();
    for rule in custom_rules.iter().filter(|rule| rule.enabled) {
        let provider_id = custom_provider_id(&rule.id);
        if provider_id.is_empty() || rule.name.trim().is_empty() {
            continue;
        }
        if custom_provider_config(&rule.source, &provider_id).is_none() {
            continue;
        }
        let target = rule
            .target
            .as_deref()
            .map(str::trim)
            .filter(|target| is_valid_rule_target(&available_groups, target))
            .unwrap_or(default_group);
        managed.push(format!("RULE-SET,{},{}", custom_provider_name(&provider_id), target));
    }
    if use_builtin_rules {
        managed.push(format!("RULE-SET,{PROVIDER_PREFIX}Lan,DIRECT"));
        for provider in BUILTIN_PROVIDERS {
            let Some(service_group) = provider.service_group else {
                continue;
            };
            managed.push(format!("RULE-SET,{},{}", provider_name(provider.suffix), service_group));
        }
        managed.push(format!("RULE-SET,{PROVIDER_PREFIX}China,DIRECT"));
        managed.push(format!("RULE-SET,{PROVIDER_PREFIX}Global,{default_group}"));
    }

    let insert_at = rules
        .iter()
        .rposition(|rule| rule.as_str().is_some_and(is_match_rule))
        .unwrap_or(rules.len());
    for (offset, rule) in managed.into_iter().enumerate() {
        rules.insert(insert_at + offset, Value::String(rule));
    }
}

fn is_valid_rule_target(available_groups: &[String], target: &str) -> bool {
    matches!(target, "DIRECT" | "REJECT") || available_groups.iter().any(|name| name == target)
}

fn remove_managed_rule_providers(config: &mut Mapping) {
    let Some(providers) = config.get_mut("rule-providers").and_then(Value::as_mapping_mut) else {
        return;
    };
    providers.retain(|name, _| {
        let Some(name) = name.as_str() else {
            return true;
        };
        !name.starts_with(PROVIDER_PREFIX) && !name.starts_with(CUSTOM_PROVIDER_PREFIX)
    });
}

fn remove_managed_rules(config: &mut Mapping) {
    let Some(rules) = config.get_mut("rules").and_then(Value::as_sequence_mut) else {
        return;
    };
    rules.retain(|rule| {
        let Some(rule) = rule.as_str() else {
            return true;
        };
        let mut fields = rule.split(',');
        if fields.next() != Some("RULE-SET") {
            return true;
        }
        fields.next().is_none_or(|provider| {
            !provider.starts_with(PROVIDER_PREFIX) && !provider.starts_with(CUSTOM_PROVIDER_PREFIX)
        })
    });
}

fn remove_service_groups(config: &mut Mapping) {
    let Some(groups) = config.get_mut("proxy-groups").and_then(Value::as_sequence_mut) else {
        return;
    };
    groups.retain(|group| {
        group
            .get("name")
            .and_then(Value::as_str)
            .is_none_or(|name| !SERVICE_GROUP_NAMES.contains(&name))
    });
}

fn is_match_rule(rule: &str) -> bool {
    rule.split_once(',').is_some_and(|(kind, _)| kind == "MATCH")
}

#[cfg(test)]
mod tests {
    use super::{CustomRuleSet, CustomRuleSource, apply_blackmatrix_rules};
    use serde_yaml_ng::Value;

    #[test]
    fn installs_cached_rule_providers_and_selectable_service_groups() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "proxies:\n  - name: node-a\n    type: vmess\nproxy-providers:\n  subscription:\n    type: http\n    url: https://example.com/sub.yaml\n    path: providers/sub.yaml\nproxy-groups:\n  - name: 全部节点\n    type: url-test\n    proxies: [node-a]\nrules:\n  - MATCH,全部节点\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");

        assert_eq!(apply_blackmatrix_rules(&mut config, "全部节点", true, &[]), 13);
        assert!(
            config["rule-providers"]["Feiliu-BM-Netflix"]["url"]
                .as_str()
                .is_some_and(|url| url.contains("blackmatrix7"))
        );
        assert!(
            config["proxy-groups"]
                .as_sequence()
                .unwrap()
                .iter()
                .any(|group| group["name"].as_str() == Some("Netflix"))
        );
        assert!(
            config["rules"]
                .as_sequence()
                .unwrap()
                .iter()
                .any(|rule| rule.as_str() == Some("RULE-SET,Feiliu-BM-OpenAI,OpenAI"))
        );
    }

    #[test]
    fn installs_custom_url_and_file_rule_sets_without_replacing_user_rules() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "proxy-groups:\n  - name: 全部节点\n    type: url-test\n    proxies: [node-a]\nrules:\n  - DOMAIN-SUFFIX,example.com,DIRECT\n  - MATCH,全部节点\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");
        let custom_rules = vec![
            CustomRuleSet {
                id: "remote".into(),
                name: "远程规则".into(),
                source: CustomRuleSource::Url {
                    url: "https://example.com/rules.yaml".into(),
                },
                enabled: true,
                target: None,
            },
            CustomRuleSet {
                id: "local".into(),
                name: "本地规则".into(),
                source: CustomRuleSource::File {
                    path: "C:/rules/local.yaml".into(),
                },
                enabled: true,
                target: Some("DIRECT".into()),
            },
        ];

        assert_eq!(
            apply_blackmatrix_rules(&mut config, "全部节点", false, &custom_rules),
            2
        );
        assert!(config["rule-providers"]["Feiliu-Custom-remote"]["type"] == "http");
        assert!(config["rule-providers"]["Feiliu-Custom-local"]["type"] == "file");
        assert!(
            config["rules"]
                .as_sequence()
                .unwrap()
                .iter()
                .any(|rule| { rule.as_str() == Some("DOMAIN-SUFFIX,example.com,DIRECT") })
        );
        assert!(
            config["rules"]
                .as_sequence()
                .unwrap()
                .iter()
                .any(|rule| { rule.as_str() == Some("RULE-SET,Feiliu-Custom-local,DIRECT") })
        );
    }

    #[test]
    fn disabling_builtin_rules_removes_only_feiliu_owned_runtime_entries() {
        let mut config = serde_yaml_ng::from_str::<Value>(
            "rule-providers:\n  Feiliu-BM-Global:\n    type: http\n  user:\n    type: http\nproxy-groups:\n  - name: Netflix\n    type: select\n  - name: UserGroup\n    type: select\nrules:\n  - RULE-SET,Feiliu-BM-Global,全部节点\n  - RULE-SET,user,UserGroup\n",
        )
        .expect("parse config")
        .as_mapping()
        .cloned()
        .expect("mapping");

        apply_blackmatrix_rules(&mut config, "全部节点", false, &[]);
        assert!(config["rule-providers"].get("Feiliu-BM-Global").is_none());
        assert!(config["rule-providers"].get("user").is_some());
        assert!(
            config["proxy-groups"]
                .as_sequence()
                .unwrap()
                .iter()
                .any(|group| { group["name"].as_str() == Some("UserGroup") })
        );
        assert!(
            config["rules"]
                .as_sequence()
                .unwrap()
                .iter()
                .any(|rule| { rule.as_str() == Some("RULE-SET,user,UserGroup") })
        );
    }
}
