# 調査: どこまで `/reload` で済み、どこからワールド再入場・再起動が必要か

> 調査日: 2026-08-22 / 対象: Minecraft BE 1.26.x
> 目的: ワールドの出入り・ゲーム再起動をできるだけ避けて開発したい

## 0. 結論

**リロードには3段階ある。**

| 段階 | 手段 | ワールドから出るか | 何が反映されるか |
| --- | --- | --- | --- |
| 1 | `/reload` | **出ない** | スクリプト、`.mcfunction` |
| 2 | `/reload all` | プレイヤーが自動で退出→再入場 | 全 BP / RP（JSON 定義、Custom Component 登録） |
| 3 | ゲーム本体の再起動 | 出る | ファイルパス参照のアセット（テクスチャ・モデル・サウンド） |

**スクリプトのロジックを書き換えるだけなら段階1で済む。**
つまり、コードの書き方を工夫すれば大半の反復は `/reload` だけで回せる。

---

## 1. ホットリロード可否（公式表）

出典: `reference/minecraft-creator-docs/creator/Documents/AddonDevelopmentWorkflow.md`

| コンテンツ種別 | ホットリロード |
| --- | --- |
| **Scripts** | **Yes** |
| Block definitions | Partial |
| Entity definitions | Partial |
| Item definitions | Partial |
| Textures | No |
| Models | No |
| Sounds | No |

「Partial」は、既存定義の値の調整は効くことがあるが、
**新規追加や構造の変更は反映されない**、という意味合い。当てにしないほうがいい。

---

## 2. 段階ごとの条件

### 段階1: `/reload` で済むもの

- `scripts/**` の中身の変更（ロジック、イベントハンドラの実装、定数）
- `functions/**` の `.mcfunction`

`/reload` の仕様（`Reference/Content/CommandsReference/Examples/Commands/reload.md`）:

> Reloads all function and script files from all behavior packs.
> Permission Level: Admin / Requires Cheats: Yes

**テスト用ワールドはチートを有効にしておくこと。**（チート無効だと `/reload` が使えない）

### 段階2: ワールド再入場（`/reload all`）が必要なもの

- **Custom Component の JSON 変更、および新規コンポーネントの登録**
  公式に明記されている（`Documents/scripting/custom-components.md`）:
  > When making changes to JSON and/or the registration of new custom components,
  > it will be necessary to exit out of a world and re-enter to see your changes reflected.

  理由: 登録は `system.beforeEvents.startup` で行うが、これは early execution、
  つまり**ワールドロード時にしか走らない**。`/reload` では通らない。

- `manifest.json` の変更（依存モジュール、UUID、バージョン、min_engine_version）
- ブロック / アイテム / エンティティ定義の**新規追加**や構造変更
- レシピ、ルートテーブル、スポーンルール等の JSON

`/reload all` は 1.21.30 で追加。プレイヤーを自動で退出→再入場させ、
BP / RP を全て読み直す。手でワールドを出入りするより速い。

> 1.26.0 で「グローバル有効化した開発用リソースパックが `/reload all` で
> 再読み込みされない」不具合が修正され、1.26.10 で「開発フォルダ外のパックが
> `/reload all` で読み込まれない」不具合も修正済み。現行版では素直に動くはず。

### 段階3: ゲーム本体の再起動が必要なもの

**ファイルパスで参照されるアセット全般。**

- テクスチャ (`textures/`)
- モデル (`models/`)
- サウンド (`sounds/`)

Bedrock Wiki より:
> New files referenced by file path, such as sounds, DO need a complete client restart to load.

Java版の F3+T に相当するものは Bedrock には無い。
Mojang も「リソースパックのリロードが面倒なのは認識している」と述べているが、
現時点で解決の予定は公表されていない（`bedrock-wiki/docs/meta/deferred-qna.md`）。

---

## 3. 段階1で回すためのコードの書き方

**目標は「JSON と アセットを触らない反復」を長く続けること。**

### 3-1. tick 固定の初期化に依存しない

```ts
// 悪い: 100 tick 目にしか走らない。/reload しても既に過ぎているので二度と動かない
if (system.currentTick === 100) { init(); }

// 良い: リロードのたびに走る
world.afterEvents.worldLoad.subscribe(() => init());
system.runInterval(() => { /* ... */ }, 100);
```

公式チュートリアルもこの落とし穴に言及している（`Documents/scripting/introduction.md`）。

### 3-2. パラメータを JSON ではなくスクリプト側に置く

Custom Component のパラメータを JSON に書くと、調整のたびにワールド再入場になる。
**調整したい値は、開発中はスクリプト内の定数にしておく**と `/reload` だけで回せる。
値が固まってから JSON に移す。

### 3-3. コンポーネントの「登録」と「中身」を分ける

登録（`registerCustomComponent`）はワールドロード時にしか走らないが、
**登録したコールバックが呼ぶ関数の中身は `/reload` で差し替わる**。
コールバックは薄いディスパッチだけにして、ロジックは別関数に置く。

```ts
system.beforeEvents.startup.subscribe(init => {
  // 登録は最初の一回だけ。ここは変えない
  init.blockComponentRegistry.registerCustomComponent("mypack:x", {
    onStepOn: (e, p) => onStepOn(e, p),   // ← 中身は下の関数。/reload で差し替わる
  });
});

function onStepOn(e, p) { /* ここを書き換える */ }
```

### 3-4. デバッグ用のカスタムコマンドを用意する

状態のリセットや確認をコマンド化しておくと、ワールドを作り直す理由が減る。
`system.beforeEvents.startup` で `customCommandRegistry.registerCommand`。
**ただしコマンドのコールバックは restricted execution** なので world の変更は不可。

---

## 4. デプロイ自体を省く（symlink）

`npm run local-deploy` すら省きたい場合、開発ディレクトリと
`development_behavior_packs` をシンボリックリンクで繋ぐ方法が公式に言及されている
（`Documents/AddonDevelopmentWorkflow.md`）。

保存 → `/reload` だけで回せるようになる。ただしビルドが挟まる TypeScript 構成では
`dist/` をリンクする形になるので、`--watch` との併用が前提。

現状は `npx just-scripts local-deploy --watch` を回しておけば
保存時に自動デプロイされるので、実用上はこれで足りる。

---

## 5. 落とし穴: `/reload` でイベント購読が重複する？

公式のトラブルシューティング2件が、
「`/reload` のたびに購読が積み重なり、イベントが複数回発火する」と述べ、
`isInitialized` フラグでのガードを推奨している。

- `Documents/TroubleshootingAddons.md`
- `Documents/scripting/debugging-scripts.md`

**ただしこの2件はどちらも `ai-usage: ai-assisted` の記事で、記述に疑問がある。**
スクリプトのコンテキストが完全に作り直されるなら、
モジュールスコープの `let isInitialized = false` も一緒にリセットされるため、
提案されているガードは機能しないはず。
「コンテキストが再利用される」のか「記述が誤り」なのかが、この2記事からは判断できない。

- [ ] **未検証**: `/reload` 時にスクリプトのコンテキストが破棄されるのか、
      イベント購読が実際に重複するのか。最初の実装のときに実機で確認する。
- 当面の方針: **`/reload` を2回叩いても壊れない書き方**にしておく
      （イベントハンドラを冪等にする、状態を world の dynamic property 等に置く）。

---

## 5-A. BDS の場合（2026-08-22 追記）

**「リロードすると全員落ちる」は、対象によって違う。**
BDS 構成では**4つの別々のもの**がリロード対象になり、
プレイヤーが落ちるのはそのうち2つだけ。

| 対象 | 手段 | プレイヤーは落ちるか |
| --- | --- | --- |
| アドオンのスクリプト本体 | コンソールから `/reload` | **落ちない** |
| 外部の Node プロセス（ボット等） | プロセス再起動 | **落ちない**（ボットだけ切れる） |
| Relay（プロキシ） | プロセス再起動 | **全員落ちる** |
| BDS 本体 | サーバー再起動 | **全員落ちる** |

`/reload` は `node tools/mc.mjs console "reload"` で送れる。

### ボット方式はリロードしやすい

分身をボットクライアントとして作る方式（[07](07-player-skin-clone.md) の 2-A）は、
**ボットのプロセスが BDS と独立している**ので、
何度作り直してもプレイヤーには影響しない。
これは開発中の試行錯誤では大きい利点。

### Relay 方式は落ちる。ただし設計で避けられる

プレイヤーの接続が自分のプロセスを通るので、
**素直に作るとプロセス再起動＝全員切断**になる。

避けるなら**プロセスは生かしたまま、書き換えロジックだけ差し替える**:

- パケット書き換えを**差し替え可能な関数**として分離する
- リロードは `require.cache` を消して読み直す（あるいは規則を外部ファイルから読む）
- きっかけは小さな制御ソケットで受ける
  （`tools/bots/ControlServer.ts` が 127.0.0.1:45500 で同じことをやっている）

これなら**既存の接続を保ったまま**振る舞いを変えられる。

ただし**接続の張り方や `bedrock-protocol` のバージョンを変えるときは再起動が要る**。
そこは避けられない。

### ローカルとの比較（BDS が不利になるわけではない）

**「BDS だと再起動で全員落ちる」は、ローカルと比べた欠点ではない。**
ローカルでワールドに入り直すというのは、
**自分がホストなのでワールド自体が落ちる**ということ。他に人がいれば同じく全員落ちる。

| 操作 | ローカル（自分がホスト） | BDS |
| --- | --- | --- |
| スクリプト本体の差し替え | `/reload`・落ちない | `/reload`・落ちない |
| カスタムコマンドの新規登録 | 入り直し＝**ワールドが落ちる** | サーバー再起動 |
| パックの追加・変更 | 同上 | 同上 |

**むしろ BDS の方が扱いやすい。**

- ワールドが自分の在席と無関係に生き続ける
- コンソールがあるので、ゲームに入らずに `/reload` を送れる
- 再起動のタイミングを選べて、数秒で戻る

BDS で本当に増える不都合は **Relay 方式を選んだ場合だけ**（上記）。

### どちらでも変わらない原則

**試行錯誤する部分はコマンドに置かない。**
コマンドの新規登録はどちらの構成でも重い操作になる。
アイテムの右クリックやイベント購読なら `/reload` だけで反映される。
[07](07-player-skin-clone.md) の検証コードはこの方針で書いてある。

## 6. まとめ（判断フロー）

```
何を変えた？
├─ scripts/ の中身だけ           → /reload
├─ .mcfunction                   → /reload
├─ JSON定義・manifest・
│  Custom Component の登録        → /reload all（ワールド再入場）
└─ テクスチャ・モデル・サウンド    → ゲーム再起動
```

**開発中はできるだけ上2つに収まるよう設計する。**
