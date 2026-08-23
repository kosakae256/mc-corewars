# hello — 動作確認用アドオン

Minecraft BE 1.26.40+ / Script API v2 向けの TypeScript プロジェクト。
公式サンプル [microsoft/minecraft-scripting-samples](https://github.com/microsoft/minecraft-scripting-samples) の
`ts-starter` をベースに、現行バージョン向けに更新したもの。

## 構成

```
addon/
├── .env                        配置先の設定
├── scripts/main.ts             スクリプト本体（ここを書く）
├── behavior_packs/hello/       BP。manifest.json、entities/ blocks/ items/ などを置く
├── resource_packs/hello/       RP。textures/ models/ などを置く
├── just.config.ts              ビルド定義
└── dist/                       ビルド成果物（git 管理外）
```

`scripts/main.ts` は esbuild で `dist/scripts/main.js` に**1ファイルにバンドル**される。
`@minecraft/server` などは external 扱いなのでバンドルされない（ゲーム側が提供する）。

## バージョン

| | |
| --- | --- |
| 対象ゲーム | 1.26.40 以上（`min_engine_version`） |
| `@minecraft/server` | 2.9.0 |
| `@minecraft/server-ui` | 2.1.0 |

`package.json` の依存と `behavior_packs/hello/manifest.json` の `dependencies` は
**両方**更新する必要がある。型だけ上げても manifest が古いとゲーム側で動かない。

## コマンド

```bash
npm run build          # TypeScript をビルド
npm run local-deploy   # ビルドして com.mojang に配置（--watch で監視）
npm run lint           # lint（-- --fix で自動修正）
npm run mcaddon        # 配布用 .mcaddon を dist/packages/ に生成
npm run clean
```

監視モードで開発する場合:

```bash
npx just-scripts local-deploy --watch
```

## 配置先

**1.21.120 で UWP → GDK 移行があり、フォルダの場所が変わっている。**
ネット上の古い記事は旧パスを書いているので注意。

| | パス |
| --- | --- |
| **現行 (GDK)** | `%appdata%\Minecraft Bedrock\Users\Shared\games\com.mojang` |
| 現行 / Preview | `%appdata%\Minecraft Bedrock Preview\Users\Shared\games\com.mojang` |
| 旧 (UWP、1.21.120 未満) | `%localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang` |

ログの場所も変わっている: `%appdata%\Minecraft Bedrock\logs\`
（ゲーム内設定の「クリエイター」タブで有効化が必要）

`.env` の `MINECRAFT_PRODUCT` で切り替える。

| 値 | 配置先 |
| --- | --- |
| `BedrockGDK` | 製品版・現行パス（**このプロジェクトの設定**） |
| `PreviewGDK` | Minecraft Preview・現行パス |
| `BedrockUWP` | 旧 UWP パス |
| `Custom` | `CUSTOM_DEPLOYMENT_PATH` で指定 |

`BedrockGDK` の解決には `@minecraft/core-build-tasks` **5.5.0 以上**が必要
（本プロジェクトは 5.7.0）。古いテンプレートを流用すると旧パスに配置されて
「デプロイしたのにゲームに出てこない」状態になる。

実際の配置先:
`%appdata%\Minecraft Bedrock\Users\Shared\games\com.mojang\development_behavior_packs\hello\`
（`hello` の部分は `.env` の `PROJECT_NAME`）

**動作確認済み** — 2026-08-22 / Minecraft 1.26.44 / `npm run local-deploy` で BP・RP とも配置成功。

## ゲームへの反映

1. `npm run local-deploy`
2. ワールド作成時に「ビヘイビアーパック」で `hello BP` を有効化
3. スクリプトを変えたら、ワールドを出入りするか `/reload`

## デバッグ

VS Code の **Minecraft Debugger** 拡張でブレークポイントが張れる（`.vscode/launch.json` 設定済み、port 19144）。
UWP 版はループバック制限があるため、初回に一度だけ:

```bash
npm run enablemcloopback
```

## Script API v2 の注意

`scripts/main.ts` のコメントに書いてあるが、要点:

- このファイルは**ワールドロード前**に実行される（early execution）
- トップレベルで `world` の状態を触るとエラー
- world を触る初期化は `world.afterEvents.worldLoad` の中に書く
- Custom Component の登録は `system.beforeEvents.startup` の中

詳細: [../docs/research/01-script-api-current-state.md](../../docs/research/01-script-api-current-state.md)
