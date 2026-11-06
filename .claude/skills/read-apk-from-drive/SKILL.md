---
name: read-apk-from-drive
description: Ask for a Google Drive share link to an Android app (APK, split-APK bundle, XAPK/APKM zip), fetch it, unpack it, and do a static first-pass analysis (identity, SDKs, deep links, back-end hosts, config documents, HTTP endpoints, data shapes). Use this whenever the user mentions an APK or "split-apks.zip" in Drive, asks what an Android app talks to, wants to reverse engineer or understand an app they extracted from their phone, or wants to add an Android streaming/catalogue app as a new channel or provider in the high5 app, even if they never say "reverse engineer" or "analyse".
---

# Read an APK from Google Drive and analyse it

Goal: turn "the APK is in my Drive" into a short, evidence-backed write-up of what the app is and how it gets its data, ready to drive an adapter (for high5, a new **channel**). Everything here is **static analysis of a file the user supplied**. Nothing from the APK is ever run.

## Ground rules (read first, they shape every step)

These exist because the user is working on a personal project against third-party services, and the cheap mistakes here are the ones that cause real trouble (leaked keys, a banned account, a take-down).

1. **Scope is what the user asked for.** Reading the file and reporting is always fine. Contacting the app's servers is a separate step that needs the user's explicit go-ahead for *that service*; when given, keep it to a few anonymous read-only GETs, no cookies, no login, low volume. The user may also approve **diagnostic probes** for a specific question (for example "is it the user-agent?", "does the server send CORS headers?"): then, and only then, you may repeat the same anonymous GET with different honest client identifiers (the tool's default, a plain `High5/<version>`, a stock browser string) and read the status and response headers. Say exactly which requests you will send, send only those, and report each result.
2. **Never record credentials.** API keys, client ids, tokens and secrets found in code or resources are not copied into notes, repos, chat or fixtures. The bundled scripts already withhold them; keep it that way when you read decompiled code. If an endpoint cannot work without such a value, say so and stop: that is the user's decision, not yours.
3. **No circumvention, no impersonation.** Do not remove DRM, spoof region, defeat VPN/emulator/root/integrity checks, or obtain tokens or cookies to get into a private Drive file. Never make a request look like it comes from the *official app*: its User-Agent, headers, device or install identifiers, keys or signed values. Identify yourself honestly (the tool's default or a plain `High5/<version>` string). Diagnosing *whether* a service treats client identifiers differently is allowed under rule 1; using the answer to pose as someone else is not. Record how protections work; do not defeat them.
4. **No accounts or writes on the user's behalf** (sign-in, favourites, resume points, purchases) without a separate explicit approval.
5. **Keep artifacts out of git.** Never commit APKs, decompiled sources or raw dumps. Test fixtures are *invented* data in the same shape as the real responses, never pasted catalogue text or artwork.
6. **A refusal is an answer.** If the sandbox or its permission layer blocks a request to a third party's server, do not look for another way to send it, and do not reword it to slip past. If the user then explicitly names the action, you may try the same request once more; a second refusal ends it. Say plainly that the user has to allow it in their permission settings. Meanwhile finish the static work, build the adapter from what the code proves, mark it **untested**, and let the user's own browser make the first real request.
7. **Say what the terms risk.** Using a company's private API without a partner agreement may breach its terms and can be blocked at any time. One plain sentence to the user, then respect their decision.

## Step 1 - Ask for the Drive share link

**Ask the user to paste the Google Drive share link** for the file. Do not go hunting in their Drive first. A share link names exactly one file (so there is no guessing between apps, and nothing else in their Drive is touched), and it is also what Step 2 uses to download it.

Say it in phone-friendly steps:

> In Drive, tap the three dots on the file → **Share** → under *General access* choose **Anyone with the link** (Viewer) → **Copy link**, then paste it here. When we are finished I will remind you to set it back to Restricted.

A link looks like `https://drive.google.com/file/d/<id>/view?usp=drivesdk` (or `...open?id=<id>`); the script extracts the id from either.

Only if the user cannot or will not paste a link, fall back to the Drive connector's `search_files`. Its query language is picky: use `title contains`, not `fileExtension`:

```
(title contains '.apk' or title contains '.xapk' or title contains '.apkm' or title contains '.apks' or title contains 'split-apks') and trashed = false
```

Show the matches and ask which one; note `id`, `title`, `fileSize`, `owner`. Files shared *with* the user by someone else are not theirs to analyse unless they say so. Do not open unrelated files the search surfaces.

## Step 2 - Get the bytes into the sandbox

The connector's `download_file_content` returns base64 into the conversation and refuses anything over 10 MB, so it is unusable for real APKs (a 20 MB bundle would flood the context). Use the sharing-link route instead:

```bash
python3 -I scripts/fetch_drive_file.py "<the share link the user pasted>" --out <NEW empty dir>      # add --expect-size N if you know the size
```

* Exit 0: saved, with size and SHA-256 (record the hash).
* Exit 3 (`NOT ACCESSIBLE`): the file is private and Google returned a sign-in page. Do not try to work around it. Tell the user the sharing steps from Step 1 again (the link was probably copied before sharing was switched on) and ask them to say when done. Alternatives: extract the zip on their phone and upload pieces under 10 MB, or put the file somewhere you can already reach.
* Exit 4: size mismatch, an incomplete download; retry once.

Link sharing makes the file reachable by anyone who has the link. **When the analysis is finished, remind the user to switch it back to Restricted**, and delete your local copy if they ask.

## Step 3 - Unpack and identify

```bash
python3 -I scripts/unpack_bundle.py <downloaded file> --out <NEW empty dir>
```

Handles a plain `.apk` or a zip-style bundle (`.zip/.xapk/.apkm/.apks`). It never overwrites, rejects unsafe paths, and writes `bundle.json` (every file's SHA-256, which is the base APK, and the package/version declared by the extractor). The **base APK** carries the code; `split_config.*` files hold only native libraries, languages and screen densities.

## Step 4 - Toolchain, then the first pass

```bash
export TOOLS=<writable dir>            # optional; default ~/.cache/apk-tools
eval "$(bash scripts/setup_toolchain.sh)"
bash scripts/analyze.sh <base.apk> <NEW findings dir>
```

`setup_toolchain.sh` needs a full JDK 17+, node and python3; it downloads the JADX bridge JAR and refuses to continue unless its SHA-256 matches the pin, then installs androguard and REA into `$TOOLS`. It never installs system software. Shell variables do not survive between tool calls, so re-run the `eval` in each call that needs them.

`analyze.sh` writes into the findings dir: `ANALYSIS.md` (identity, permissions, deep links, biggest packages, SDKs), `hosts.txt`, `urls.txt`, `paths.txt`, `keywords.txt` (DRM/auth/streaming words), `resources.txt`, `summary.json`. Credential-looking values appear only as a count or `<withheld>`.

Read `ANALYSIS.md` first. The question it should answer: **what are the app's own packages, and where does it get its back-end address?**

## Step 5 - Follow the data

Work in this order; stop as soon as the question is answered.

0. **Bundled config files first (cheap, often decisive).** Apps frequently ship their back-end addresses in `assets/application.properties`, `config.json` or similar:
   ```bash
   "$APK_PY" -I scripts/read_config_assets.py <base.apk>                       # list candidates
   "$APK_PY" -I scripts/read_config_assets.py <base.apk> --show assets/application.properties
   ```
   Credential values print as `<withheld>`, long identifiers inside addresses are hidden, and files with credential-like names (`api_key.txt`, `*.pem`, keystores) are listed but never opened. If a name like that exists, note that the service probably expects a key and say so in the write-up.
1. **Own namespace.** In the "largest packages" table, the app's real code usually has readable names (`com.<company>.<app>…`) while libraries and obfuscated code are `a.b.c`. List classes with `java -cp "$REA_JADX_MCP_JAR" scripts/Decompile.java <apk> - --list <prefix>`.
2. **Where does the host come from?** Check `resources.txt` for entries like `config_base_url` / `api_url`, and `hosts.txt` for the app's own domains. Many apps download a *config document* at start-up that carries every other host and URL template (`dataServiceSettings`, `endpoints`, `baseUrl`...). That document is often public and CORS-open; finding its address statically is usually all you need, and fetching it needs the go-ahead from rule 1.
3. **Endpoints.** Decompile the API interfaces and extract them:
   ```bash
   java -cp "$REA_JADX_MCP_JAR" scripts/Decompile.java <apk> out/api.txt <package.of.api.interfaces>
   "$APK_PY" -I scripts/find_endpoints.py out/api.txt
   ```
   If the interfaces are not in a readable package (R8 renames them to `a.b`), find them from something you do know. JADX writes the source file name into every decompiled class (`compiled from: SearchApi.kt`), and string literals survive obfuscation:
   ```bash
   java -Xmx3g -cp "$REA_JADX_MCP_JAR" scripts/Decompile.java <apk> out/hits.txt --threads 4 --contains 'Api.kt */' --contains '/some/path/seen/in/strings'
   ```
   `Api.kt */` lists every API interface at once; it decompiles the whole app (a few minutes), so run it in the background.
   Retrofit annotations in release builds are obfuscated to single letters. `find_endpoints.py` shows them as `?f`, `?o`... and does **not** guess. Within one build the mapping is consistent, so corroborate: an id route with GET, PUT and DELETE on the same path pins three letters at once. In one build the alphabet was `b=DELETE f=GET n=PATCH o=POST p=PUT`; treat that as a hint, not a rule. REA's own decompiler cannot show abstract interface methods, which is why `Decompile.java` (JADX library, whole classes) is used here.
4. **Data shapes.** Decompile the model classes (`@SerializedName`/`@Json` names are the JSON keys; Kotlin data-class `toString` strings also list field names). Note types and units (seconds vs milliseconds, epoch vs ISO).
5. **Templates.** If a config document holds URL templates like `/shows/{showId}.json?platform={platformId}`, record the placeholder syntax and how unused placeholders are handled (the decompiled `TemplateBuilder`-style class tells you).
6. **Playback, auth, DRM.** Record the scheme names, where licence URLs come from, and what the error strings say about region/VPN/device checks. Do not go further (rule 3).

## Step 6 - Probe, only if allowed

With the user's go-ahead for *this* service: fetch the public config document once, then the smallest set of read-only requests that reveals the response shapes (one search, one detail, one list). Print field names and types, not whole bodies, and do not store catalogue text. Check for `Access-Control-Allow-Origin` (it decides whether a browser app can call the API directly). If anything requires a key, token or a region you are not in, stop and report.

## Step 7 - Write it up and hand off

* Write `docs/analysis/<app>-<version>.md` in the repo: identity, hosts, endpoints (verified vs inferred, labelled), data shapes, config keys by *name*, protections observed, open questions. Observations and inferences must be visibly separate.
* For a **new high5 channel**, follow `references/channel-adapter.md`: it defines the adapter contract, the safety checks every channel gets, the invented-fixture tests, and how the UI picks it up. All channels share one interface and one stylesheet; a channel only supplies data.
* Tell the user what is done, what is not, what each missing piece would need (and that each needs its own go-ahead), and to **switch the Drive file back to Restricted**.

## Checklist before you say "done"

- [ ] No credential, key, client id or token appears in any file you wrote or in the chat.
- [ ] No APK, decompiled source or raw response is committed; fixtures are invented.
- [ ] Every network call to the app's servers was approved and is listed for the user (method, host, count).
- [ ] Verified facts and inferences are labelled; unknowns are listed.
- [ ] The user has been reminded to unshare the Drive file.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `fetch_drive_file.py` exit 3 | File is private. Ask the user to share by link (Step 2). |
| `analyze.sh: APK_PY: run ... first` | Environment from `setup_toolchain.sh` is not set in this shell; re-run the `eval`. |
| `MISSING: javac` | Only a JRE is installed; a full JDK is required (JADX compiles a small bridge). |
| JADX jar checksum fails | Download corrupted or tampered; delete it and retry once, never skip the check. |
| Hosts list shows only SDKs | The back end address is in `resources.txt` or in a remote config document, not in code strings. |
| Interface/class names look like `Ff.a` | Obfuscated. Use `Decompile.java --contains` with a known string or `'Api.kt */'` (Step 5.3). |
| Config says `<withheld>` for a value you need | That is a credential. Stop and tell the user; it is their decision, never yours. |
| A copied request gets `404`/`403` from the service | The address or parameters differ from the app's. The User-Agent rarely matters (test once if the user asks). Re-read how the app builds the request (client provider, interceptors, parameter formatting). A 404 carries no CORS headers, so a browser shows it as a network/CORS failure: do not conclude "blocked" without a server-side check. |
| `find_endpoints.py` prints nothing | The API classes are obfuscated or in another package; list classes with `--list` and look for `retrofit2.http` imports. |
