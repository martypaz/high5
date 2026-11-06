#!/usr/bin/env python3
"""Build a first-pass ANALYSIS.md from a base APK (+ optional outputs of dex_strings.py / res_strings.py).
  report.py <base.apk> --out ANALYSIS.md [--findings DIR]
Static facts only. Every claim is something read from the artifact; inferences are for YOU to add and label.
"""
import argparse, collections, json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from _common import open_dex_files, SDK_PACKAGES
from androguard.core.apk import APK
from androguard.core.dex import DEX

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('apk'); ap.add_argument('--out', required=True); ap.add_argument('--findings')
    a = ap.parse_args(); apk = APK(a.apk); L = []
    add = L.append
    add(f'# {apk.get_app_name() or apk.get_package()} - static analysis (first pass)\n')
    add('Generated from the shipped APK only; nothing was executed. Statements here are observations; add inferences separately and label them.\n')
    add('## Identity\n')
    add(f'| | |\n|---|---|\n| Package | `{apk.get_package()}` |\n| Version | {apk.get_androidversion_name()} (code {apk.get_androidversion_code()}) |\n| min / target SDK | {apk.get_min_sdk_version()} / {apk.get_target_sdk_version()} |')
    add('\n## Permissions\n'); add(', '.join(f'`{p.split(".")[-1]}`' for p in sorted(apk.get_permissions())) or '(none)')
    add('\n## Entry points\n')
    add('Activities: ' + ', '.join(f'`{x.split(".")[-1]}`' for x in apk.get_activities()[:25]))
    # deep links from the manifest
    links = set()
    try:
        xml = apk.get_android_manifest_xml(); ns = '{http://schemas.android.com/apk/res/android}'
        for d in xml.iter('data'):
            sch, host = d.get(ns + 'scheme'), d.get(ns + 'host')
            path = d.get(ns + 'pathPrefix') or d.get(ns + 'path') or d.get(ns + 'pathPattern') or ''
            if sch: links.add(f'{sch}://{host or ""}{path}')
    except Exception: pass
    add('\n## Deep links (manifest)\n'); add('\n'.join(f'- `{l}`' for l in sorted(links)) or '(none)')
    pk = collections.Counter(); sdks = collections.Counter(); total = 0
    for _, blob in open_dex_files(a.apk):
        for c in DEX(blob).get_classes():
            n = c.get_name()[1:-1].replace('/', '.'); total += 1
            pk['.'.join(n.split('.')[:3])] += 1
            for p, label in SDK_PACKAGES.items():
                if n.startswith(p): sdks[label] += 1; break
    add(f'\n## Code map ({total:,} classes)\n\nLargest package prefixes (the app\'s own namespace usually has real, unobfuscated names):\n')
    add('| classes | package |\n|---|---|'); [add(f'| {c} | `{p}` |') for p, c in pk.most_common(15)]
    add('\n## Third-party SDKs detected\n'); add(', '.join(f'{k} ({v})' for k, v in sdks.most_common()) or '(none recognised)')
    if a.findings:
        f = pathlib.Path(a.findings)
        s = f / 'summary.json'
        if s.exists():
            j = json.loads(s.read_text()); add('\n## Back-end clues from strings\n')
            add(f"Candidate hosts not obviously SDKs: {', '.join('`'+h+'`' for h in j['candidate_own_hosts']) or '(none)'}\n")
            add(f"{j['relative_paths']} relative path-like strings, {j['keywords']} streaming/auth keywords. {j['secret_like_strings_withheld']} credential-looking strings were withheld on purpose.")
        for name, title in (('paths.txt', 'Relative path-like strings (first 60)'), ('keywords.txt', 'Streaming / auth keywords (first 40)'), ('resources.txt', 'Config-like resource entries (first 40)')):
            p = f / name
            if p.exists() and p.read_text().strip():
                lines = p.read_text().splitlines(); add(f'\n### {title}\n'); add('```'); add('\n'.join(lines[: 60 if name == 'paths.txt' else 40])); add('```')
    add('\n## Open questions\n\n- Where does the app get its catalogue/config host at runtime (hard-coded, resource, or a remote config document)?\n- Which calls need an account and which are anonymous?\n- How is playback authorised (DRM scheme, licence URL source, geo checks)? Record, do not circumvent.')
    pathlib.Path(a.out).write_text('\n'.join(L) + '\n'); print('wrote', a.out)

if __name__ == '__main__':
    main()
