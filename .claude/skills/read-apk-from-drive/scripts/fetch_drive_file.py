#!/usr/bin/env python3
"""Download ONE Google Drive file by id/URL via its sharing link - no credentials, no tokens.

Works only if the file is shared "Anyone with the link". A private file returns a Google sign-in page; this script
detects that and exits with code 3 and a plain-language explanation instead of saving the HTML as if it were the file.

  fetch_drive_file.py <file-id-or-drive-url> --out DIR [--expect-size BYTES] [--name NAME]

Prints the saved path, size and SHA-256. Exit codes: 0 ok, 2 bad input, 3 not accessible (needs sharing), 4 integrity problem.
"""
import argparse, hashlib, os, re, sys, urllib.request, urllib.error, pathlib

def file_id(s):
    m = re.search(r'/d/([\w-]{20,})', s) or re.search(r'[?&]id=([\w-]{20,})', s) or re.fullmatch(r'([\w-]{20,})', s.strip())
    return m.group(1) if m else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('file'); ap.add_argument('--out', required=True)
    ap.add_argument('--expect-size', type=int); ap.add_argument('--name', default='download.bin')
    a = ap.parse_args()
    fid = file_id(a.file)
    if not fid:
        print('Could not find a Drive file id in:', a.file); return 2
    out = pathlib.Path(a.out); out.mkdir(parents=True, exist_ok=True)
    dest = out / a.name
    base = os.environ.get('DRIVE_DOWNLOAD_BASE', 'https://drive.usercontent.google.com/download')   # override only for tests
    url = f'{base}?id={fid}&export=download&confirm=t'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    h = hashlib.sha256(); n = 0; first = b''
    try:
        with urllib.request.urlopen(req, timeout=300) as r, open(dest, 'wb') as f:
            ctype = r.headers.get('Content-Type', '')
            while True:
                chunk = r.read(1 << 20)
                if not chunk: break
                if not first: first = chunk[:512]
                f.write(chunk); h.update(chunk); n += len(chunk)
    except urllib.error.HTTPError as e:
        dest.unlink(missing_ok=True); print(f'Drive refused the request (HTTP {e.code}).'); return 3
    looks_html = first.lstrip()[:15].lower().startswith((b'<!doctype html', b'<html'))
    if 'text/html' in ctype or looks_html:
        dest.unlink(missing_ok=True)
        print('NOT ACCESSIBLE: Drive returned a web page (sign-in / permission page), not the file.\n'
              'The file is private. Ask the owner to set it to "Anyone with the link" (Viewer) temporarily, or to upload pieces under 10 MB\n'
              'for the Drive connector. Do NOT try to obtain tokens or cookies to get around this.')
        return 3
    if a.expect_size and n != a.expect_size:
        print(f'SIZE MISMATCH: got {n} bytes, expected {a.expect_size}.'); return 4
    print(f'saved: {dest}\nbytes: {n}\nsha256: {h.hexdigest()}')
    return 0

if __name__ == '__main__':
    sys.exit(main())
