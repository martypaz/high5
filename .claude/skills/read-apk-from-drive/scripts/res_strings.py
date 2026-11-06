#!/usr/bin/env python3
"""Read decoded app resources (strings.xml etc.) for config clues. Values of credential-looking entries are withheld.
  res_strings.py <apk> --out FILE
Writes one line per entry: name=value (or name=<withheld>). Keeps only URL/host/endpoint/config-like entries.
"""
import argparse, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _common import SECRET_NAME, looks_secret, redact_url
from androguard.core.apk import APK

KEEP = re.compile(r'https?://|\.com\b|\.co\.uk\b|\.tv\b|api|url|host|endpoint|domain|base|config|platform|region|brand|channel|drm|license', re.I)
NOISE = re.compile(r'firebase|google_(?:app|api|crash|storage)|facebook|crashlytics|gcm_|abc_|mtrl_|material_|common_google', re.I)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('apk'); ap.add_argument('--out', required=True); a = ap.parse_args()
    apk = APK(a.apk); res = apk.get_android_resources(); pkg = apk.get_package()
    xml = res.get_string_resources(pkg) if res else b''
    rows = []; withheld = 0
    for m in re.finditer(rb'<string name="([^"]+)"[^>]*>(.*?)</string>', xml or b'', re.S):
        k, v = m.group(1).decode(), m.group(2).decode('utf8', 'replace').strip()
        if NOISE.search(k) or len(v) > 300: continue
        if SECRET_NAME.search(k) or looks_secret(v):
            withheld += 1; rows.append(f'{k}=<withheld>'); continue
        if KEEP.search(k) or KEEP.search(v): rows.append(f'{k}={redact_url(v)}')
    pathlib.Path(a.out).write_text('\n'.join(sorted(set(rows))))
    print(f'{len(rows)} config-like entries written ({withheld} credential-looking values withheld) -> {a.out}')

if __name__ == '__main__':
    main()
