use std::process::Command;

/// Proxy settings resolved from the Windows system configuration.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub(crate) struct ProxySettings {
    pub http: Option<String>,
    pub https: Option<String>,
    pub no_proxy: Option<String>,
}

#[cfg(windows)]
pub(crate) fn system_proxy_settings() -> Option<ProxySettings> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Internet Settings")
        .ok()?;
    let enabled: u32 = key.get_value("ProxyEnable").ok()?;
    if enabled == 0 {
        return None;
    }

    // PAC/auto-config scripts cannot be evaluated synchronously; without a
    // static ProxyServer value we leave the connection to Git's own defaults.
    let server: String = key.get_value("ProxyServer").unwrap_or_default();
    let (http, https) = parse_proxy_server(&server);
    if http.is_none() && https.is_none() {
        return None;
    }

    let bypass: String = key.get_value("ProxyOverride").unwrap_or_default();
    if bypass.split(';').any(|entry| entry.trim() == "*") {
        // The system bypasses the proxy for every host.
        return None;
    }

    Some(ProxySettings {
        http,
        https,
        no_proxy: parse_proxy_override(&bypass),
    })
}

#[cfg(not(windows))]
pub(crate) fn system_proxy_settings() -> Option<ProxySettings> {
    None
}

/// Adds the system proxy to a network-facing Git command only when the user
/// has not supplied an explicit proxy environment of their own.
pub(crate) fn apply_to(command: &mut Command) {
    let Some(settings) = system_proxy_settings() else {
        return;
    };

    if let Some(http) = settings.http.as_deref() {
        set_env_pair(command, "HTTP_PROXY", "http_proxy", http);
    }
    if let Some(https) = settings.https.as_deref() {
        set_env_pair(command, "HTTPS_PROXY", "https_proxy", https);
    }
    if let Some(no_proxy) = settings.no_proxy.as_deref() {
        set_env_pair(command, "NO_PROXY", "no_proxy", no_proxy);
    }
}

fn set_env_pair(command: &mut Command, upper: &str, lower: &str, value: &str) {
    let already_set = std::env::var_os(upper).is_some() || std::env::var_os(lower).is_some();
    if already_set {
        return;
    }
    command.env(upper, value).env(lower, value);
}

/// Parses both `host:port` and `http=...;https=...` forms of ProxyServer.
fn parse_proxy_server(raw: &str) -> (Option<String>, Option<String>) {
    let raw = raw.trim();
    if raw.is_empty() {
        return (None, None);
    }

    if raw.contains('=') {
        let mut http = None;
        let mut https = None;
        let mut socks = None;
        for entry in raw.split(';') {
            let Some((key, value)) = entry.split_once('=') else {
                continue;
            };
            let value = value.trim();
            if value.is_empty() {
                continue;
            }
            match key.trim().to_ascii_lowercase().as_str() {
                "http" => http = Some(normalize_proxy(value, false)),
                "https" => https = Some(normalize_proxy(value, false)),
                "socks" | "socks5" => socks = Some(normalize_proxy(value, true)),
                _ => {}
            }
        }

        if http.is_none() && https.is_none() {
            if let Some(socks) = socks {
                return (Some(socks.clone()), Some(socks));
            }
        }

        let http_value = http.clone().or_else(|| https.clone());
        let https_value = https.or(http);
        (http_value, https_value)
    } else {
        let proxy = normalize_proxy(raw, false);
        (Some(proxy.clone()), Some(proxy))
    }
}

fn normalize_proxy(value: &str, socks: bool) -> String {
    let value = value.trim();
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("socks") {
        value.to_owned()
    } else if socks {
        format!("socks5h://{value}")
    } else {
        format!("http://{value}")
    }
}

/// Converts the Windows bypass list into the NO_PROXY syntax understood by
/// libcurl. Entries that cannot be represented (for example unusual wildcard
/// IP ranges) are skipped rather than broadening the bypass unexpectedly.
fn parse_proxy_override(raw: &str) -> Option<String> {
    let mut entries: Vec<String> = Vec::new();

    for item in raw.split(';') {
        let item = item.trim();
        if item.is_empty() || item == "*" {
            continue;
        }

        if item.eq_ignore_ascii_case("<local>") {
            for host in ["localhost", "127.0.0.1", "::1"] {
                push_unique(&mut entries, host.to_owned());
            }
            continue;
        }
        if item.eq_ignore_ascii_case("127.*") {
            push_unique(&mut entries, "127.0.0.1".to_owned());
            continue;
        }

        let mapped = if let Some(suffix) = item.strip_prefix("*.") {
            format!(".{suffix}")
        } else if item.contains('*') {
            continue;
        } else {
            item.to_owned()
        };
        push_unique(&mut entries, mapped);
    }

    if entries.is_empty() {
        None
    } else {
        Some(entries.join(","))
    }
}

fn push_unique(entries: &mut Vec<String>, value: String) {
    if !entries
        .iter()
        .any(|existing| existing.eq_ignore_ascii_case(&value))
    {
        entries.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_proxy() {
        assert_eq!(
            parse_proxy_server("127.0.0.1:7897"),
            (
                Some("http://127.0.0.1:7897".to_owned()),
                Some("http://127.0.0.1:7897".to_owned())
            )
        );
    }

    #[test]
    fn parses_protocol_specific_proxy() {
        assert_eq!(
            parse_proxy_server("http=127.0.0.1:7890;https=127.0.0.1:7891"),
            (
                Some("http://127.0.0.1:7890".to_owned()),
                Some("http://127.0.0.1:7891".to_owned())
            )
        );
    }

    #[test]
    fn falls_back_to_the_available_protocol() {
        assert_eq!(
            parse_proxy_server("https=127.0.0.1:7891"),
            (
                Some("http://127.0.0.1:7891".to_owned()),
                Some("http://127.0.0.1:7891".to_owned())
            )
        );
    }

    #[test]
    fn supports_socks_proxy() {
        assert_eq!(
            parse_proxy_server("socks=127.0.0.1:1080"),
            (
                Some("socks5h://127.0.0.1:1080".to_owned()),
                Some("socks5h://127.0.0.1:1080".to_owned())
            )
        );
    }

    #[test]
    fn converts_bypass_entries_to_no_proxy() {
        assert_eq!(
            parse_proxy_override("localhost;*.example.com;<local>;10.*"),
            Some("localhost,.example.com,127.0.0.1,::1".to_owned())
        );
    }

    #[test]
    fn ignores_an_unrepresentable_bypass_entry() {
        assert_eq!(parse_proxy_override("192.168.*"), None);
    }
}
