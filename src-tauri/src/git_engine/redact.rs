/// Removes HTTP(S) userinfo from a URL so tokens or passwords never reach
/// the UI. Returns whether anything was redacted.
pub(crate) fn redact_url_userinfo(url: &str) -> (String, bool) {
    let scheme_len = if url.starts_with("https://") {
        "https://".len()
    } else if url.starts_with("http://") {
        "http://".len()
    } else {
        return (url.to_owned(), false);
    };

    let rest = &url[scheme_len..];
    let authority_end = rest
        .find(['/', '?', '#', ' ', '\t', '\r', '\n', '"', '\'', '<', '>'])
        .unwrap_or(rest.len());
    let authority = &rest[..authority_end];
    if let Some(at) = authority.rfind('@') {
        return (format!("{}{}", &url[..scheme_len], &rest[at + 1..]), true);
    }
    (url.to_owned(), false)
}

/// Best-effort redaction for Git stderr. Only userinfo inside HTTP(S)
/// authorities is removed; ordinary paths and repository names are kept.
pub(crate) fn redact_text(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut cursor = 0;

    while cursor < text.len() {
        let remaining = &text[cursor..];
        let http = remaining.find("http://");
        let https = remaining.find("https://");
        let relative = match (http, https) {
            (Some(left), Some(right)) => left.min(right),
            (Some(value), None) | (None, Some(value)) => value,
            (None, None) => break,
        };
        let start = cursor + relative;
        let scheme_len = if text[start..].starts_with("https://") {
            "https://".len()
        } else {
            "http://".len()
        };
        let scheme_end = start + scheme_len;
        output.push_str(&text[cursor..scheme_end]);

        let after_scheme = &text[scheme_end..];
        let authority_end = after_scheme
            .find(['/', '?', '#', ' ', '\t', '\r', '\n', '"', '\'', '<', '>'])
            .unwrap_or(after_scheme.len());
        let authority = &after_scheme[..authority_end];
        if let Some(at) = authority.rfind('@') {
            output.push_str(&after_scheme[at + 1..authority_end]);
        } else {
            output.push_str(authority);
        }
        cursor = scheme_end + authority_end;
    }

    output.push_str(&text[cursor..]);
    output
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_http_userinfo_from_urls_and_stderr() {
        let (url, redacted) = redact_url_userinfo("https://token:secret@example.com/team/repo.git");
        assert_eq!(url, "https://example.com/team/repo.git");
        assert!(redacted);

        let text =
            redact_text("fatal: unable to access 'https://user:pass@example.com/repo.git': denied");
        assert!(!text.contains("user:pass"));
        assert!(text.contains("https://example.com/repo.git"));
    }

    #[test]
    fn keeps_ssh_and_plain_https_untouched() {
        let (ssh, redacted) = redact_url_userinfo("git@example.com:team/repo.git");
        assert!(!redacted);
        assert_eq!(ssh, "git@example.com:team/repo.git");
        let (plain, redacted) = redact_url_userinfo("https://example.com/team/repo.git");
        assert!(!redacted);
        assert_eq!(plain, "https://example.com/team/repo.git");
    }
}
