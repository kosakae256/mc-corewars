#!/usr/bin/env bash
# 設計図を絵にする（**1 コマンドで**）。
#
#   bash tools/mc-preview.sh <出力の頭>
#
# `plan.ts` を JS へ落とし、node で命令を吐き、python で描く。
# **リポジトリの根から実行する。**
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PACK="$ROOT/worlds/pve-v2/packs/pve_v2"
OUT="${1:-preview}"
TMP="$(dirname "$OUT")/planjs"
mkdir -p "$TMP"
(cd "$PACK" && npx tsc scripts/features/map/plan.ts --outDir "$TMP" --module es2020 --target es2020 --moduleResolution bundler)
cp "$TMP/plan.js" "$TMP/plan.mjs"
printf 'import { plan } from "./plan.mjs";\nimport { writeFileSync } from "node:fs";\nwriteFileSync("ops.json", JSON.stringify(plan()));\n' > "$TMP/run.mjs"
(cd "$TMP" && node run.mjs)
python "$ROOT/tools/mc-preview.py" "$TMP/ops.json" --out "$OUT" --cell 3
