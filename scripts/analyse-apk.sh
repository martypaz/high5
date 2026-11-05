#!/usr/bin/env bash
# Reproduce the static analysis with REA (https://github.com/morluto/rea).
# Usage: scripts/analyse-apk.sh /abs/path/base.apk /abs/path/jadx-headless-mcp-0.7.1-all.jar
set -euo pipefail
APK="$1"; export REA_JADX_MCP_JAR="$2"
OUT="${3:-analysis-out}"; mkdir -p "$OUT"
npx -y rea-agents@latest inspect-android-package "$APK" --format json --full-output > "$OUT/package.json"
npx -y rea-agents@latest search-android-classes "$APK" "com.channel5" --format json --full-output > "$OUT/classes.json"
