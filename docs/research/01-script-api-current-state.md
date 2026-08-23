# 調査: Script API の現状（2026-08 時点）

> 調査日: 2026-08-21 / 対象: Minecraft Bedrock Edition 1.26.40（stable）, 1.26.50（preview）
> 出典は末尾。**Script API は更新が速いので、実装前にこのドキュメントの鮮度を必ず確認すること。**

## 0. 結論（3行）

- **Script API v2 はすでに stable。** `@minecraft/server` の最新安定版は **2.9.0**（1.26.40 同梱）。実験機能トグルなしで使える。
- 昔のアドオンから見た最大の変化は **early execution（スクリプトがワールドロード前に走るようになった）** と **Custom Components**。
- 公式のやり方は **TypeScript + `just-scripts` で `com.mojang` に配置**。手書き JS を直接置く時代ではない。

---

## 1. バージョン体系が変わった

2026年から Minecraft のバージョン番号が **年ベース** になった。2026年のリリースはすべて `1.26.x`。

| | バージョン |
| --- | --- |
| Stable | **1.26.40**（2026-08-03） |
| Preview | 1.26.50 |

Script API のモジュールバージョンはゲーム本体とは別。対応表：

| モジュール | stable | beta | 備考 |
| --- | --- | --- | --- |
| `@minecraft/server` | **2.9.0** | 2.10.0-beta / 2.11.0-beta | 中核。エンティティ・ブロック・イベント |
| `@minecraft/server-ui` | 2.x（2.0.0〜） | 2.2.0-beta | フォーム UI（ActionForm / ModalForm / MessageForm） |
| `@minecraft/common` | stable あり | | 共通型 |
| `@minecraft/server-gametest` | **stable 版が存在しない** | beta のみ | 最古のモジュールなのに未だ実験扱い |
| `@minecraft/server-net` | なし | experimental | HTTP リクエスト。**BDS（専用サーバー）限定** |
| `@minecraft/server-admin` | なし | experimental | シークレット/allowlist。**BDS 限定** |
| `@minecraft/server-editor` | | | Editor 拡張専用。manifest に `"capabilities": ["editorExtension"]` が必要 |
| `@minecraft/debug-utilities` | なし | experimental | |

**beta モジュールは予告なく壊れる。** 使うなら「Beta APIs」実験トグルが必要で、配布物には向かない。

---

## 2. v1 → v2 の変更点（昔いじってた人が引っかかる所）

### 2-1. Early execution（最重要）

v2 ではスクリプトが**ワールドがロードされる前**に実行されるようになった。
そのため、起動直後に `world` の状態（プレイヤー、エンティティ、ブロック）を触るとエラーになる。

起動フロー：

```
1. v2 スクリプトが読み込まれ、early execution で実行
2. v2 の Promise が early execution で解決
3. system.beforeEvents.startup が発火（← まだ world は触れない）
   ... ワールドのロード完了を待つ ...
4. (v1 スクリプトはここで初めて読み込まれる)
5. 最初の tick
6. tick の終わりに world.afterEvents.worldLoad が発火（← ここから world が触れる）
```

移行対応：

| v1 | v2 |
| --- | --- |
| `world.afterEvents.worldInitialize` | `world.afterEvents.worldLoad`（改名のみ） |
| `world.beforeEvents.worldInitialize` | `system.beforeEvents.startup`（**ただし early execution なので world 操作は不可**） |

early execution で呼べるのは実質これだけ：

- `world.beforeEvents.* / afterEvents.*` の `subscribe` / `unsubscribe`
- `system.beforeEvents.* / afterEvents.*` の `subscribe` / `unsubscribe`
- `system.run` / `runInterval` / `runTimeout` / `runJob` / `clearRun` / `clearJob` / `waitTicks`
- `BlockComponentRegistry.registerCustomComponent`
- `ItemComponentRegistry.registerCustomComponent`

**実装方針**: トップレベルに world を触るコードを書かない。`world.afterEvents.worldLoad` の中か、そこから呼ぶ初期化関数にまとめる。

### 2-2. Promise の解決タイミング

v1 は tick の最後に1回だけ解決。v2 は after events / system tasks のフラッシュ中に**繰り返し**解決される。

```ts
await system.waitTicks(1);
await system.waitTicks(0); // v2 で可能になった（v1 では不可）
```

### 2-3. その他の API 変更

- `Dimension.runCommandAsync` **削除**（実際には非同期じゃなかったため）。非同期処理は `system.runJob` を使う。
- `Entity.applyKnockback` のシグネチャ変更（水平方向が `VectorXZ` に）。
- `getComponent` / `hasComponent` / `getComponents` は Entity が invalid なら **throw する**（旧: undefined を返す）。
- `isValid` が **メソッドから読み取り専用プロパティに**変更。
- `EffectType.getName` / `Effect.typeId` が `minecraft:` プレフィックス付きを返すように。
- `minecraft:air` アイテムが削除（ブロックとしては有効）。
- import は **named import**。`import * as mc from "@minecraft/server"` ではなく `import { world, system } from "@minecraft/server"`。

---

## 3. Custom Components — 今どきのやり方

JSON で定義したブロック/アイテムに、スクリプトの挙動を紐付ける仕組み。
「全ブロック破壊イベントを購読して if で分岐」ではなく、**該当ブロックにだけコンポーネントを付ける**。

```ts
system.beforeEvents.startup.subscribe(init => {
  init.blockComponentRegistry.registerCustomComponent('my_pack:bouncy', {
    onStepOn: (e, params) => { /* ... */ }
  });
});
```

**Custom Components V2**（実験中 / 要「Beta APIs」+「Custom Components V2」）では：

- `minecraft:custom_components` でのネストが非推奨に。他のコンポーネントと同列にフラットに書ける。
- コンポーネントに**パラメータを渡せる**ようになった（第2引数 `CustomComponentParameters`）。

```json
{
  "components": {
    "minecraft:collision_box": { "enabled": true },
    "my_pack:bouncy": { "strength": 4 }
  }
}
```

---

## 4. 開発環境（公式推奨）

### 4-1. 配置先フォルダ（UWP → GDK 移行）

**1.21.120 で Windows 版が UWP から GDK ビルドに移行し、`com.mojang` の場所が変わった。**
ネット上の記事の大半は旧パスのままなので、ここが最初のハマりどころになる。

| | パス |
| --- | --- |
| **現行 (GDK)** | `%appdata%\Minecraft Bedrock\Users\Shared\games\com.mojang` |
| 現行 / Preview | `%appdata%\Minecraft Bedrock Preview\Users\Shared\games\com.mojang` |
| 旧 (UWP) | `%localappdata%\Packages\Microsoft.MinecraftUWP_8wekyb3d8bbwe\LocalState\games\com.mojang` |

- 配下は従来どおり `development_behavior_packs` / `development_resource_packs` /
  `development_skin_packs` / `behavior_packs` / `resource_packs` / `minecraftWorlds`
- コンテンツエラーログも移動: `%appdata%\Minecraft Bedrock\logs\`
  （ゲーム内設定の「クリエイター」タブで有効化が必要）
- 紛らわしい点: **アプリのパッケージ名は今も `Microsoft.MinecraftUWP_8wekyb3d8bbwe`**。
  `LocalState` 配下には `bootstrapStorage` しか無く、`com.mojang` は作られない。
  パッケージ名から旧パスを推測すると外す。

ツール側の対応:

- `@minecraft/core-build-tasks` は **5.5.0** で `BedrockGDK` に対応した。
  それ未満のテンプレートを流用すると旧パスに配置され、
  「デプロイは成功しているのにゲームにパックが出てこない」状態になる。
- `.env` の `MINECRAFT_PRODUCT` は `BedrockGDK` / `PreviewGDK` / `BedrockUWP` / `Custom`。

出典: `reference/minecraft-creator-docs/creator/Documents/GDKPCProjectFolder.md`

### 前提

- Node.js（LTS）
- VS Code
  - **Minecraft Debugger** 拡張（スクリプトにブレークポイントを張れる）
  - **Blockception's Minecraft Bedrock Development** 拡張（JSON 補完）

### プロジェクトの始め方

公式サンプル [microsoft/minecraft-scripting-samples](https://github.com/microsoft/minecraft-scripting-samples/) の **`ts-starter`** フォルダをベースにする。

```powershell
npm i
npx just-scripts local-deploy --watch   # TS をビルドして com.mojang に配置し、変更を監視
npx just-scripts lint                    # lint（--fix で自動修正）
npx just-scripts mcaddon                 # 配布用 .mcaddon を生成
```

`.env` で配置先を切り替える：

```ini
PROJECT_NAME="starter"          # development_behavior_packs/<この名前>/ に配置される
MINECRAFT_PRODUCT="BedrockGDK"  # BedrockGDK | PreviewGDK | Custom
CUSTOM_DEPLOYMENT_PATH=""       # Custom のときの配置先
```

### manifest.json

`script` モジュールと、使う API の依存を**両方**書く必要がある（import しただけでは動かない）。

```json
{
  "modules": [
    { "type": "script", "language": "javascript", "entry": "scripts/main.js", "uuid": "...", "version": [1,0,0] }
  ],
  "dependencies": [
    { "module_name": "@minecraft/server", "version": "2.9.0" },
    { "module_name": "@minecraft/server-ui", "version": "2.0.0" }
  ]
}
```

> 注意: dependency には `uuid` と `module_name` の**どちらか一方**だけを書く。両方書かない。

### 反映方法

スクリプトを変えたら、ワールドを出て入り直すか、ゲーム内で `/reload`。

---

## 5. 制約 / 落とし穴

- **配置先フォルダが 1.21.120 で変わっている**（4-1 参照）。古い記事の UWP パスに置いても読まれない。
- **watchdog**: 1 tick で重い処理をするとスクリプトが強制終了される。重い処理は `system.runJob`（ジェネレータ）で分割する。
- **`server-net` / `server-admin` は BDS 限定**。通常のクライアント配布アドオンから外部通信はできない。
- **beta モジュールは配布に向かない**（実験トグル必須 + 予告なく壊れる）。何を作るかによって、stable 縛りにするか実験前提にするかを最初に決める必要がある。
- **1.26.40 で JSON 検証が厳格化**。`format_version` を 1.26.40 以上にすると、多くの entity component / AI goal が不正データで**ロード失敗**するようになった。古いアドオンをそのまま上げると壊れる可能性がある。
- Marketplace 配布を狙うなら別途要件がある（本ドキュメントでは未調査）。

---

## 6. 参照すべきドキュメント

| 用途 | URL |
| --- | --- |
| 公式ドキュメント（一次情報） | https://learn.microsoft.com/en-us/minecraft/creator/ |
| Script API リファレンス（公式） | https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/ |
| Scripting V2 の解説（必読） | https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/v2-overview |
| TypeScript セットアップ（必読） | https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/next-steps |
| バージョン更新ノート（毎回ここを見る） | https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.40 |
| 公式サンプルコード | https://github.com/microsoft/minecraft-scripting-samples/ |
| Bedrock Wiki（コミュニティ / 実践的） | https://wiki.bedrock.dev/ |
| Script API 非公式リファレンス（beta/preview も網羅） | https://jaylydev.github.io/scriptapi-docs/ |

---

## 7. 未調査 / 次に調べること

- [ ] 何を作るか決まっていない。作るものによって「stable 縛り / BDS 前提 / 実験機能あり」の判断が変わる
- [ ] `@minecraft/server-ui` でどこまでの UI が作れるか（フォーム以外の表現力）
- [ ] データの永続化手段（dynamic properties, scoreboard, structure）の比較
- [ ] 配布形態（.mcaddon 手渡し / Realms / BDS / Marketplace）
