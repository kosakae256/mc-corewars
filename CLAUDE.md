# minecraft_app

## このディレクトリの目的

Minecraft Bedrock Edition (Minecraft BE) で、**遊べるワールド（ゲーム）を1つ作る**。

対象は Minecraft BE。Java Edition の MOD ではなく、BE のアドオン
(ビヘイビアーパック / リソースパック、および Script API) を主な手段とする。

> **2026-08-22 に方針を変更した。** それまでは「アドオンで何ができるか」を
> 試す実験場だった。その成果（調査・道具・実験用アドオン）はそのまま残してある。

## 進め方（最重要ルール）

**ドキュメント駆動開発。**

> ### ドキュメントに書いていない内容を実装してはいけない。
> **必ず、ドキュメントに書いてから実装する。**

これはコードだけの話ではない。**建築にも同じ規則を適用する。**
先に `worlds/core-wars/docs/02-map.md` に書いてから建てる。建ててから仕様を決めない。

### 上から順に決まっていく

```
worlds/<名>/docs/        何を作るか（企画・ルール・マップ・中身）
      ↓
worlds/<名>/docs/spec/   どう作るか（パック・ツールの仕様）
      ↓
worlds/<名>/packs/       実装・建築
```

**上が決まっていないのに下を作らない。**
`worlds/core-wars/docs/00-concept.md` が「未定」のままなら、まずそこを埋める。

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
- 調べて分かった事実（API の挙動、制約、落とし穴）も `docs/research/` に残す。
  次に同じことを調べ直さないため。

例外は、ビルド設定・ひな形・調査用の使い捨てコードなど、
アドオンの機能そのものではないもの。

## 技術方針

主な実装手段は **Script API**（ビヘイビアーパック内の TypeScript / JavaScript）。

現状の前提（詳細は [docs/research/01-script-api-current-state.md](docs/research/01-script-api-current-state.md)）:

- 対象バージョン: Minecraft Bedrock **1.26.40** 以上（`min_engine_version`）。開発機の実機は **1.26.44**
- **Script API v2 が stable**。`@minecraft/server` **2.9.0** を基準にする
- **言語は TypeScript。JavaScript を直接書かない。** `any` 禁止、`strict: true` を緩めない
- ビルド/配置は `just-scripts`（公式 `ts-starter` ベース）
- **beta モジュール・実験機能は使ってよい**（2026-08-22 決定）。
  必要なものが beta にしかないケースが多く、stable 縛りは現実的でないため。
  ただし**使う beta API は `docs/` に記録する**（壊れたときに追跡できるようにする）

### 実行基盤

**BDS（Bedrock Dedicated Server）を選択肢として採用済み**
（詳細は [docs/research/03-bds-and-friend-join.md](docs/research/03-bds-and-friend-join.md)）。

- 参加方法は **`bedrock-portal`** で Xbox Live セッションを立て、**フレンド欄から参加**させる
  （旧 FriendConnect はメンテ終了。作者自身が bedrock-portal へ誘導している）
- これにより `@minecraft/server-net`（外部 HTTP）/ `@minecraft/server-admin` が使える。
  ただし両方 experimental で、BDS でのみ動作する（Realms では不可）
- BDS ではモジュールが `config/<スクリプトモジュールUUID>/permissions.json` で
  明示的に許可されていないと使えない。`server-net` は既定で許可されていない

### 実装方針

**コードを書く前に [docs/imp.md](docs/imp.md) を読むこと。**
設計原則（P-1〜P-6）・ディレクトリ構成・型安全・コメント規約・
Script API v2 の実行文脈・権限制御をここに定めている。

### 注意（Claude 向け）

Script API は破壊的変更が頻繁で、v1 時代の情報がネット上に大量に残っている。
コードを書く前に、必ず上記調査ドキュメント、または以下の一次情報を確認すること。
記憶だけで v1 の API（`worldInitialize`, `runCommandAsync`, `isValid()` 等）を書かない。

- https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/
- https://learn.microsoft.com/en-us/minecraft/creator/documents/scripting/v2-overview

## ディレクトリ構成

**2026-08-24 に変更した。ワールドに属するものは1箇所へ集める。**

| | 用途 |
| --- | --- |
| `worlds/<名>/` | **ワールド一式。ここが起点** |
| `worlds/<名>/docs/` | そのワールドの設計。企画・ルール・マップ・仕様・決定記録 |
| `worlds/<名>/packs/` | パックのソース（TypeScript）。`game` と `kit` |
| `worlds/<名>/world/` | ワールドデータ。手動 export した `.mcworld` |
| `addons/` | **実験用アドオン。** 試作の置き場。**ゲーム本体は入れない** |
| `docs/` | ワールドに依らない文書。調査・実装方針・実験用ツールの仕様 |
| `tools/` | 開発・運営用スクリプト |
| `reference/` | 外部から取得した参照資料。**編集しない**（git 管理外） |

いま作っているワールド: **[worlds/pve-v2/](worlds/pve-v2/)**（2026-08-30 開始）。
**PVE の作り直し。** 企画を書いている段階で、実装はまだ無い。
**コードは書き直す**が、**実装の形**（[docs/imp.md](docs/imp.md) 10 章）と
**絵・音を書き出す道具**（`tools/pve-*.py`）は引き継ぐ。

| ワールド | いま |
| --- | --- |
| [worlds/pve-v2/](worlds/pve-v2/) | **作っている**（企画から） |
| [worlds/pve/](worlds/pve/) | **止めた**（2026-08-30）。弓 48 本・エンチャント 26 種まで作った。**参照用に残す** |
| [worlds/core-wars/](worlds/core-wars/) | 遊べる形まで作った。**そのまま残す** |

> **なぜアドオン単位をやめたか。**
> `addons/game` と `addons/kit` に置いていたが、
> 設計文書が `docs/` に、ワールドが `world/` にあり、
> **1つの世界を作る材料がリポジトリ中に散らばっていた。**
> ワールド名のフォルダにまとめれば、丸ごと持ち運べる。

### アドオンの役割分担

**ゲームの中身と、制作の道具を混ぜない。**

| パック | 場所 | 役割 |
| --- | --- | --- |
| `game` | `worlds/core-wars/packs/game` | **ゲーム本体。** ルール・進行・勝敗 |
| `kit` | `worlds/core-wars/packs/kit` | **制作の道具。** 建築補助・運営コマンド・**構造物の同梱** |
| `exp` ほか | `addons/` | 実験用。試作の置き場

`kit` は**完成品には同梱しない**前提で作る。だから多少雑でよい。
逆に `game` は遊ぶ人が触るものなので、壊れない作りにする。

過去の実験（`hello` / `leveler` / `bots_cmd`）は記録として残してある。

## フォルダ分けルール（重要）

**アドオンは `addons/<アドオン名>/` に、1つずつ独立したフォルダとして作る。**

```
addons/
├── _template/          ひな形。ここから複製する。直接編集しない
├── hello/              動作確認用（最小構成・デプロイ確認済み）
└── <次のアドオン>/
```

- **1アドオン = 1フォルダ = 1つの独立した npm プロジェクト**。
  各フォルダが `package.json` / `node_modules` / `.env` / `manifest.json` を自前で持つ。
  アドオン間でコードや依存を共有しない。
- **アドオン名の規則**: 英小文字で始まり、英小文字・数字・アンダースコアのみ（`^[a-z][a-z0-9_]*$`）。
  この名前がそのまま以下すべてに使われるため、後から変えると手間がかかる。
  - フォルダ名 `addons/<名前>/`
  - `.env` の `PROJECT_NAME`
  - `behavior_packs/<名前>/` と `resource_packs/<名前>/`
  - ゲーム内のパック名 `<名前> BP` / `<名前> RP`
  - Custom Component の名前空間 `<名前>:xxx`
- **`_template/` は予約名**。アドオンではないのでビルド対象にしない。

### 新しいアドオンを作るとき

**必ずこのスクリプトを使う。手でコピーしない。**

```bash
node tools/new-addon.mjs <アドオン名> "説明"
```

やっていること:

1. `addons/_template/` を `addons/<名前>/` に複製
2. `__ADDON__` / `__DESCRIPTION__` などのプレースホルダを置換
3. **manifest.json の UUID を 4 つとも新規採番**
4. `npm install`

> **UUID を使い回してはいけない。**
> 既存アドオンと UUID が衝突すると、ゲーム側でパックが読み込まれない・
> 別のパックを上書きするといった、原因の分かりにくい不具合になる。
> 手でコピーするとここを間違えるので、必ずスクリプトを通す。

### 各アドオンでの作業

```bash
cd worlds/core-wars/packs/<名前>     # 実験用なら addons/<名前>
npm run local-deploy          # ビルドしてゲームに配置（--watch で監視）
npm run mcaddon               # 配布用 .mcaddon を生成
npm run lint
```

使い方の詳細は各アドオンの `README.md`、共通事項は [addons/hello/README.md](addons/hello/README.md)。

### 調べ物の優先順位

1. `addons/<名前>/node_modules/@minecraft/server/index.d.ts` — API の正確な定義（TSDoc 付き・v2.9.0）
2. `reference/minecraft-creator-docs/creator/Documents/` — 公式の概念説明
3. `reference/bedrock-samples/behavior_pack/` — バニラ JSON の実例
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

## 現在のフェーズ

**実装段階。ひととおり遊べる形になっている。**

済んでいること:

| | どこ |
| --- | --- |
| Script API の調査一式 | [docs/research/](docs/research/) |
| **マップ**（拠点2 + 中央1 の3島） | [02-map.md](worlds/core-wars/docs/02-map.md) |
| **ブロック保護**（マップを壊せない） | [10-block-protection.md](worlds/core-wars/docs/spec/10-block-protection.md) |
| **試合の進行**（開始・停止・再開・後片付け） | [11-match.md](worlds/core-wars/docs/spec/11-match.md) |
| **ショップ**（チェストUI・値段はゲーム内で変更可） | [12-shop.md](worlds/core-wars/docs/spec/12-shop.md) |
| **ワイヤー射出装置**（立体機動） | [13-grapple.md](worlds/core-wars/docs/spec/13-grapple.md) |
| **死亡と復活**（観戦5秒） | [14-death.md](worlds/core-wars/docs/spec/14-death.md) |
| **演出と待機所** | [15-presentation.md](worlds/core-wars/docs/spec/15-presentation.md) |
| **設定メニュー**（運営の道具をコンパス1つに集約） | [19-admin-menu.md](worlds/core-wars/docs/spec/19-admin-menu.md) |
| **観戦**（試合中だけ・真上を向いて終了） | [20-spectate.md](worlds/core-wars/docs/spec/20-spectate.md) |
| **金庫**（自陣に預ける・引き出し不可・買い物専用） | [22-vault.md](worlds/core-wars/docs/spec/22-vault.md) |
| **ドローン**（Engineer 専用・空から落とす） | [23-drone.md](worlds/core-wars/docs/spec/23-drone.md) |
| **ロール**（8 種・点で買う・球で変える） | [24-role.md](worlds/core-wars/docs/spec/24-role.md) |
| **ロビーで試す**（無所属なら 0 で全部試せる） | [25-practice.md](worlds/core-wars/docs/spec/25-practice.md) |

次にやること:

- **待機所の設定**（`/game:setlobby`）。初期値は上空を指しているだけ
- **値段の調整**（`/game:price`）。いまの値は全部仮
- [00-concept.md](worlds/core-wars/docs/00-concept.md) と [01-rules.md](worlds/core-wars/docs/01-rules.md) の未確定を埋める
