# minecraft_app

## このディレクトリの目的

Minecraft Bedrock Edition (Minecraft BE) で、**遊べるワールド（ゲーム）を作る**。

対象は Minecraft BE。Java Edition の MOD ではなく、BE のアドオン
(ビヘイビアーパック / リソースパック、および Script API) を主な手段とする。

> **ここにはワールド固有の話を書かない。**
> **何を作っているか・どこまで進んだかは `worlds/<名>/docs/` にある。**

## 進め方（最重要ルール）

**ドキュメント駆動開発。**

> ### ドキュメントに書いていない内容を実装してはいけない。
> **必ず、ドキュメントに書いてから実装する。**

これはコードだけの話ではない。**建築にも同じ規則を適用する。**
先にマップの仕様を書いてから建てる。建ててから仕様を決めない。

### 上から順に決まっていく

```
worlds/<名>/docs/        何を作るか（企画・ルール・マップ・中身）
      ↓
worlds/<名>/docs/spec/   どう作るか（パック・ツールの仕様）
      ↓
worlds/<名>/packs/       実装・建築
```

**上が決まっていないのに下を作らない。**

### 迷ったら

| 状況 | 書く場所 |
| --- | --- |
| 「これは作れるのか？」を調べた | `docs/research/`（**ワールド共通**） |
| 「何を作るか」が決まった | `worlds/<名>/docs/` |
| 「どう作るか」が決まった | `worlds/<名>/docs/spec/` |
| 「なぜそう決めたか」を残したい | `worlds/<名>/docs/decisions/` |
| 実験用の道具の仕様 | `docs/spec/`（**ワールド共通**） |

**ワールド固有か、どのワールドでも効く知識かで分ける。**
調査（API の挙動・制約）はワールドを消しても残す価値があるので `docs/` に置く。

### Claude はこれを守ること

- **実装の前に、対応する記述が `docs/` にあるか確認する。**
  無ければ実装しない。先にドキュメントを書き、内容を合意してから実装する。
- 実装中に「ついでにこれも」と思いついた機能を勝手に足さない。
  必要だと思ったら、**まずドキュメントへの追記を提案する**。
- 仕様と実装がずれたら、**コードではなくドキュメントを先に直す**。
- **勝手に消さない。** 動いている仕組み・コマンド・機能を、
  **こちらの判断で取り除かない。**
  **邪魔に見えても、それが要るから置いてある。**
  - **消したくなったら、まず相手に言う。** 「これを消せば直るが、消してよいか」
  - **代わりの手を探す**ほうが先。**片方を殺して解決した気にならない。**
  - 例: **音が二重に鳴るのを直したかっただけ**なのに、
    **画面を揺らす仕組みごと消した**（2026-09-07）。
    **正しくは「片方の音を無音に差し替えて分ける」だった。**
- **直したら `npm run check` → デプロイまでやる。** 言われなくてもゲームで見られる形にする。
- **BDS を勝手に再起動しない。** 他のプレイヤーが接続していることがある。
- **第三者のアセットを自分で取得・取り込まない。**
- 調べて分かった事実（API の挙動、制約、落とし穴）も `docs/research/` に残す。
  次に同じことを調べ直さないため。

例外は、ビルド設定・ひな形・調査用の使い捨てコードなど、
アドオンの機能そのものではないもの。

## 技術方針

主な実装手段は **Script API**（ビヘイビアーパック内の TypeScript / JavaScript）。

現状の前提（詳細は [docs/research/01-script-api-current-state.md](docs/research/01-script-api-current-state.md)）:

- 対象バージョン: Minecraft Bedrock **1.26.40** 以上（`min_engine_version`）。開発機の実機は **1.26.51**（2026-09-21 時点。beta モジュールの版はこれに縛られる）
- **Script API v2 が stable**。`@minecraft/server` **2.9.0** を基準にする
- **言語は TypeScript。JavaScript を直接書かない。** `any` 禁止、`strict: true` を緩めない
- ビルド/配置は `just-scripts`（公式 `ts-starter` ベース）
- **beta モジュール・実験機能は使ってよい**（2026-08-22 決定）。
  ただし**使う beta API は `docs/` に記録する**（壊れたときに追跡できるようにする）
- **リソースパックを更新したら、マニフェストの版を必ず上げる**

### 実行基盤

**BDS（Bedrock Dedicated Server）を採用済み**
（詳細は [docs/research/03-bds-and-friend-join.md](docs/research/03-bds-and-friend-join.md)）。

- 参加は **`bedrock-portal`** で Xbox Live セッションを立て、**フレンド欄から参加**させる
- これにより `@minecraft/server-net` / `@minecraft/server-admin` が使える。
  ただし両方 experimental で、BDS でのみ動作する（Realms では不可）
- BDS ではモジュールが `config/<スクリプトモジュールUUID>/permissions.json` で
  明示的に許可されていないと使えない

### 実装方針

**コードを書く前に [docs/imp.md](docs/imp.md) を読むこと。**
設計原則（P-1〜P-6）・ディレクトリ構成・型安全・コメント規約・
Script API v2 の実行文脈・権限制御をここに定めている。

### 注意（Claude 向け）

Script API は破壊的変更が頻繁で、v1 時代の情報がネット上に大量に残っている。
コードを書く前に、必ず下記の一次情報を確認すること。
記憶だけで v1 の API（`worldInitialize`, `runCommandAsync`, `isValid()` 等）を書かない。

- https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/
- https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/v2-overview

## ディレクトリ構成

| | 用途 |
| --- | --- |
| `worlds/<名>/` | **ワールド一式。ここが起点** |
| `worlds/<名>/docs/` | そのワールドの設計。企画・ルール・マップ・仕様・決定記録 |
| `worlds/<名>/packs/` | パックのソース（TypeScript） |
| `worlds/<名>/world/` | ワールドデータ。手動 export した `.mcworld` |
| `addons/` | **実験用アドオン。** 試作の置き場。**ゲーム本体は入れない** |
| `docs/` | ワールドに依らない文書。調査・実装方針・実験用ツールの仕様 |
| `tools/` | 開発・運営用スクリプト |
| `bedrock-samples/` | **バニラのパック一式と公式ドキュメント。編集しない** |
| `reference/` | 外部から取得した参照資料。**編集しない**（git 管理外） |

### アドオンのフォルダ規則

**1アドオン = 1フォルダ = 1つの独立した npm プロジェクト。**
`package.json` / `node_modules` / `.env` / `manifest.json` を自前で持つ。

- **名前は英小文字で始まり、英小文字・数字・アンダースコアのみ**（`^[a-z][a-z0-9_]*$`）。
  この名前がフォルダ名・`PROJECT_NAME`・パック名・名前空間すべてに使われる
- **`_template/` は予約名**。アドオンではないのでビルド対象にしない

新しいアドオンは**必ずこのスクリプトで作る。手でコピーしない。**

```bash
node tools/new-addon.mjs <アドオン名> "説明"
```

> **UUID を使い回してはいけない。**
> 衝突するとパックが読み込まれない・別のパックを上書きするといった、
> 原因の分かりにくい不具合になる。**手でコピーするとここを間違える。**

### 各パックでの作業

```bash
npm run local-deploy          # ビルドしてゲームに配置（--watch で監視）
npm run mcaddon               # 配布用 .mcaddon を生成
npm run check                 # 型・lint・テスト
```

## 調べ物の優先順位

1. **[bedrock-samples/](bedrock-samples/)** — **バニラの中身そのもの。いちばん確か**
   - `behavior_pack/` — バニラのモブ・アイテム・ブロックの実物
   - `resource_pack/` — バニラの模型・絵・アニメ・描画制御
   - `documentation/` — **同梱の公式ドキュメント**（`Entities.html` / `Molang.html` ほか）
   - **モブ・アイテム・パーティクルを作るときは、まずここの実物を見る**
2. `<パック>/node_modules/@minecraft/server/index.d.ts` — API の正確な定義（TSDoc 付き）
3. `reference/minecraft-creator-docs/creator/Documents/` — 公式の概念説明
4. `reference/bedrock-wiki/docs/` — コミュニティの実践知
5. Web

詳細は [reference/README.md](reference/README.md)。

## ワールドの扱い

**建てたものは必ず保存する。** 手作業の成果は消えたら戻らない。

```bash
node tools/mc.mjs backup dev --label 拠点できた   # ワールドを丸ごと保存
node tools/mc.mjs backups                          # 一覧
node tools/mc.mjs restore <名前>                   # 戻す
```

- **バックアップはサーバー停止中にしか取れない。**
  稼働中にコピーすると書き込み途中のファイルを掴んで壊れる
- `restore` は**戻す前に今の状態も退避する**ので、戻し先が違っても元に戻せる
- 建築の部品は `.mcstructure` で `world/structures/` に置く。
  ワールドごと壊れても建て直せるようにするため
