#!/usr/bin/env python3
"""List and read the config-like files bundled inside an APK (assets/ and res/raw/), with credential values withheld.
  read_config_assets.py <apk>                       list candidate files
  read_config_assets.py <apk> --show PATH [...]     print .properties / .json / .txt / .xml files with secrets withheld
Many apps ship their back-end addresses in assets/application.properties, assets/config.json or similar - check here early.
Files whose NAME looks like a credential (api_key.txt, *.pem, *.p12, *.keystore, google-services*) are listed but never printed.
"""
import argparse, json, pathlib, re, sys, zipfile
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _common import looks_secret, SECRET_NAME, redact_url

CONFIG_EXT = ('.properties', '.json', '.xml', '.txt', '.yaml', '.yml', '.cfg', '.conf', '.ini')
SKIP_DIRS = ('assets/dexopt/', 'assets/containers/', 'META-INF/', 'res/layout', 'res/drawable', 'res/anim', 'res/color', 'res/mipmap', 'res/xml')
CREDENTIAL_NAME = re.compile(r'(api[_-]?key|secret|token|password|credential|keystore|\.pem$|\.p12$|\.jks$|\.pfx$|google-services|auth.*key|private)', re.I)
HIDE_LINE = re.compile(r'(key|secret|token|password|passwd|credential|auth|signature|client_?id)', re.I)

def withheld_line(line: str) -> str:
    if '=' in line:
        k, v = line.split('=', 1)
        return f'{k}=<withheld>' if SECRET_NAME.search(k) or HIDE_LINE.search(k) or looks_secret(v.strip()) else f'{k}={redact_url(v)}'
    if ':' in line and looks_secret(line.split(':', 1)[1].strip().strip('",')):
        return line.split(':', 1)[0] + ': <withheld>'
    return redact_url(line)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('apk'); ap.add_argument('--show', nargs='*'); a = ap.parse_args()
    z = zipfile.ZipFile(a.apk)
    if a.show is None:
        for i in sorted(z.infolist(), key=lambda i: -i.file_size):
            n = i.filename
            if not n.startswith(('assets/', 'res/raw')) or n.startswith(SKIP_DIRS) or i.file_size == 0: continue
            if not (n.lower().endswith(CONFIG_EXT) or CREDENTIAL_NAME.search(n)): continue
            flag = '  [credential-like name: listed only, never printed]' if CREDENTIAL_NAME.search(n) else ''
            print(f'{i.file_size:>9,}  {n}{flag}')
        return 0
    for n in a.show:
        if CREDENTIAL_NAME.search(n): print(f'===== {n}\n(credential-like file name: not printed)'); continue
        try: text = z.read(n).decode('utf8', 'replace')
        except KeyError: print(f'===== {n}\n(not found)'); continue
        print(f'===== {n}')
        for line in text.splitlines():
            line = line.rstrip()
            if line.strip() and not line.lstrip().startswith(('#', '//')): print(withheld_line(line))
    return 0

if __name__ == '__main__':
    sys.exit(main())
