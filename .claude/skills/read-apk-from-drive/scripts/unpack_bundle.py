#!/usr/bin/env python3
"""Unpack an Android package or split bundle into its own NEW directory and describe it.

Accepts .apk, or a zip-style bundle (.zip/.xapk/.apkm/.apks) that contains .apk files.
  unpack_bundle.py <file> --out NEWDIR
Writes NEWDIR/bundle.json (files, sizes, SHA-256, which one is the base) and prints a short summary.
Safe by construction: refuses path traversal, absolute paths, and absurd sizes. Never executes anything.
"""
import argparse, hashlib, json, pathlib, shutil, sys, zipfile

MAX_TOTAL = 2 * 1024**3

def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for c in iter(lambda: f.read(1 << 20), b''): h.update(c)
    return h.hexdigest()

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('file'); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    src = pathlib.Path(a.file); out = pathlib.Path(a.out)
    if out.exists() and any(out.iterdir()):
        print('Refusing: output directory is not empty. Use a new, empty directory.'); return 2
    out.mkdir(parents=True, exist_ok=True)
    head = src.read_bytes()[:4]
    if head[:2] != b'PK':
        print('Not a zip/apk (bad magic). Is this really the downloaded file, not an HTML page?'); return 2
    apks = []
    with zipfile.ZipFile(src) as z:
        names = z.namelist()
        if 'AndroidManifest.xml' in names and 'classes.dex' in names or any(n.startswith('classes') and n.endswith('.dex') for n in names):
            shutil.copy(src, out / (src.stem + '.apk')); kind = 'single-apk'
        else:
            kind = 'bundle'; total = 0
            for i in z.infolist():
                p = pathlib.PurePosixPath(i.filename)
                if i.is_dir(): continue
                if p.is_absolute() or '..' in p.parts: print('Refusing unsafe path in archive:', i.filename); return 2
                total += i.file_size
                if total > MAX_TOTAL: print('Archive too large to unpack.'); return 2
                if p.suffix.lower() in ('.apk', '.json', '.obb') or p.name.lower() in ('manifest.json', 'info.json', 'toc.pb'):
                    (out / p.name).write_bytes(z.read(i))
    rows = []
    for f in sorted(out.iterdir()):
        if f.suffix.lower() == '.apk': rows.append({'file': f.name, 'bytes': f.stat().st_size, 'sha256': sha(f)})
    if not rows: print('No .apk files found inside.'); return 2
    base = next((r for r in rows if r['file'] == 'base.apk'), None) \
        or next((r for r in rows if not r['file'].lower().startswith(('split_', 'config.'))), None) \
        or max(rows, key=lambda r: r['bytes'])
    meta = {}
    mj = out / 'manifest.json'
    if mj.exists():
        try: meta = {k: v for k, v in json.loads(mj.read_text()).items() if k in ('packageName', 'versionName', 'versionCode', 'appName', 'name', 'package_name', 'version_name')}
        except Exception: pass
    bundle = {'kind': kind, 'source': src.name, 'base': base['file'], 'apks': rows, 'declared': meta}
    (out / 'bundle.json').write_text(json.dumps(bundle, indent=2))
    print(f"kind: {kind}\nbase: {base['file']} ({base['bytes']:,} bytes)\nsplits: {len(rows) - 1}\ndeclared: {meta or '(none)'}\nwrote: {out/'bundle.json'}")
    return 0

if __name__ == '__main__':
    sys.exit(main())
