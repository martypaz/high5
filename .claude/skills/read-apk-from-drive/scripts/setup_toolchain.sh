#!/usr/bin/env bash
# Idempotent toolchain setup for static APK analysis. Installs nothing outside $TOOLS (default ~/.cache/apk-tools).
# Needs: java 17+ (full JDK), node/npm, python3 with venv. Prints the env vars to export.
set -euo pipefail
TOOLS="${TOOLS:-$HOME/.cache/apk-tools}"; mkdir -p "$TOOLS"
JAR="$TOOLS/jadx-headless-mcp-0.7.1-all.jar"
JAR_URL="https://github.com/1013503897/jadx-headless-mcp/releases/download/v0.7.1/jadx-headless-mcp-0.7.1-all.jar"
JAR_SHA="6e5eacf500b64292bfb73c49797c1958f6ee44646e43e868039ae7feb573ff75"   # pinned by REA (morluto/rea src/android/JadxRelease.ts)

command -v java >/dev/null || { echo "MISSING: java (need a full JDK 17+)"; exit 1; }
command -v javac >/dev/null || { echo "MISSING: javac (need a full JDK, not just a JRE)"; exit 1; }
command -v node >/dev/null || { echo "MISSING: node"; exit 1; }

if [ ! -f "$JAR" ] || ! echo "$JAR_SHA  $JAR" | sha256sum -c - >/dev/null 2>&1; then
  curl -fL -sS -o "$JAR" "$JAR_URL"
  echo "$JAR_SHA  $JAR" | sha256sum -c -   # refuses to continue on mismatch (set -e)
fi
if [ ! -x "$TOOLS/venv/bin/python" ]; then python3 -m venv "$TOOLS/venv"; "$TOOLS/venv/bin/pip" install -q androguard; fi
if [ ! -x "$TOOLS/npm/node_modules/.bin/rea" ]; then npm install --silent --prefix "$TOOLS/npm" rea-agents@latest; fi

cat <<ENV
export REA_JADX_MCP_JAR="$JAR"
export APK_PY="$TOOLS/venv/bin/python"
export REA="$TOOLS/npm/node_modules/.bin/rea"
ENV
