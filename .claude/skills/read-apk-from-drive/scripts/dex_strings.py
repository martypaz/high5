#!/usr/bin/env python3
"""Scan an APK's code for back-end clues: URLs/hosts, relative endpoint paths, DRM/streaming keywords.
  dex_strings.py <apk> --out DIR
Writes DIR/hosts.txt, urls.txt, paths.txt, keywords.txt, summary.json. Credential-looking strings are counted, never written.
"""
import argparse, collections, json, pathlib, re, sys
from urllib.parse import urlparse
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _common import open_dex_files, looks_secret, redact_url, SDK_HOST_HINTS, plausible_host
from androguard.core.dex import DEX

URL = re.compile(r'https?://[^\s"\'<>\\]+', re.I)
PATH = re.compile(r'^/?[A-Za-z][\w\-]*(?:/[\w{}\-.\[\]]+)+(?:\?[\w=&{}\[\]%.\-]*)?$')
KEYWORDS = re.compile(r'widevine|playready|fairplay|clearkey|\.mpd\b|\.m3u8\b|drm|license|licence|manifest\.(?:mpd|m3u8)|bearer|oauth|graphql|openid|cognito|auth0|okta', re.I)
NOISE_PATH = re.compile(r'^(?:android|androidx|kotlin|java|javax|com|org|net|io|res|META-INF|assets|image|text|application|audio|video|multipart|font|dalvik|libcore|sun|x-|vnd|ssl|tls|sha|aes|rsa|pkix|http|window|Africa|America|Asia|Australia|Europe|Pacific|Etc|Atlantic|Indian|Antarctica|layout|drawable|mipmap|anim|color|xml|raw|menu|navigation|values)[/\-.]', re.I)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('apk'); ap.add_argument('--out', required=True); a = ap.parse_args()
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    urls, paths, kws = set(), set(), set(); secrets = 0; total = 0
    for name, blob in open_dex_files(a.apk):
        for s in DEX(blob).get_strings():
            s = str(s); total += 1
            if len(s) > 400: continue
            if looks_secret(s): secrets += 1; continue
            for m in URL.findall(s): urls.add(redact_url(m.rstrip('.,;)')))
            if PATH.match(s) and not NOISE_PATH.match(s): paths.add(s)
            if KEYWORDS.search(s) and len(s) < 120 and not s.startswith(('Lcom/', 'Landroid', 'Ljava')): kws.add(s)
    hosts = collections.Counter()
    for u in urls:
        try: hosts[urlparse(u).netloc.lower()] += 1
        except ValueError: pass
    own = {h: c for h, c in hosts.items() if plausible_host(h) and not any(x in h for x in SDK_HOST_HINTS)}
    (out / 'hosts.txt').write_text('\n'.join(f'{c:4d} {h}{"" if h in own else "   (looks like an SDK/platform)"}' for h, c in hosts.most_common()))
    (out / 'urls.txt').write_text('\n'.join(sorted(u for u in urls if urlparse(u).netloc.lower() in own)))
    (out / 'paths.txt').write_text('\n'.join(sorted(paths)))
    (out / 'keywords.txt').write_text('\n'.join(sorted(kws)))
    summary = {'strings_scanned': total, 'urls': len(urls), 'candidate_own_hosts': sorted(own), 'relative_paths': len(paths), 'keywords': len(kws), 'secret_like_strings_withheld': secrets}
    (out / 'summary.json').write_text(json.dumps(summary, indent=2)); print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
