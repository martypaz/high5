#!/usr/bin/env bash
# One-shot static first pass over a base APK. Usage: analyze.sh <base.apk> <OUTDIR>   (OUTDIR is created, must be new)
# Needs: eval "$(setup_toolchain.sh)"  so that APK_PY and REA_JADX_MCP_JAR are set.
set -euo pipefail
APK="$1"; OUT="$2"; HERE="$(cd "$(dirname "$0")" && pwd)"
: "${APK_PY:?run: eval \"\$(scripts/setup_toolchain.sh)\" first}"; : "${REA_JADX_MCP_JAR:?run setup_toolchain.sh first}"
mkdir -p "$OUT"
echo "[1/3] strings + hosts + paths";  "$APK_PY" -I "$HERE/dex_strings.py" "$APK" --out "$OUT" >/dev/null
echo "[2/3] resources";                "$APK_PY" -I "$HERE/res_strings.py"  "$APK" --out "$OUT/resources.txt" >/dev/null
echo "[3/3] report";                   "$APK_PY" -I "$HERE/report.py"       "$APK" --out "$OUT/ANALYSIS.md" --findings "$OUT" >/dev/null
echo "Done. Read $OUT/ANALYSIS.md, then decompile the interesting classes:"
echo "  java -cp \"\$REA_JADX_MCP_JAR\" $HERE/Decompile.java $APK $OUT/api.txt <package.prefix>"
echo "  $APK_PY -I $HERE/find_endpoints.py $OUT/api.txt"
