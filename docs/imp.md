# 実装方針（Minecraft BE アドオン）

別プロジェクト（CRM / 対面電書）の実装方針をベースに、**Minecraft BE アドオンのドメインへ適応**して定める。
原則・コロケーション設計・コメント規約・多層防御の考え方は踏襲し、
Web 固有の要素（Next.js / Tailwind / Supabase）は Script API の対応物に置き換えるか、破棄した。

> 本書は実装の指針。**ドキュメント駆動**（`CLAUDE.md`）の一部であり、
> ここに書かれていない設計判断は、まず本書か `docs/spec/` に追記してから実装する。

## 要するに（この3つ）

細かい話は後段に書くが、**守ってほしいのはこの3点**。

### 1. コードをきれいに書く

読む人（人間でも AI でも）が、直したい場所をすぐ見つけられて、
直しても壊れないと確信できる状態にする。
そのための具体策が [4章のコメント規約](#4-コメント規約) と
[3章の型安全](#3-typescript-と型安全)。

### 2. ディレクトリ構成をしっかり守る

**置き場所に迷ったら [2章の配置ルール](#2-ディレクトリ構成と配置ルール)の表を見る。**
「とりあえず main.ts に書く」をしない。
機能に関わるものは `scripts/features/<機能>/` に集める。

### 3. 使いまわせるものは、ちゃんと使いまわせる形にする

**2回目に書きたくなった時点で切り出す**、ではなく
**最初から切り出せる形で書く**。

| 切り出す単位 | 使うもの | 置き場所 |
|---|---|---|
| 入力→出力が決まる処理（計算・判定・整形） | **純粋関数** | `features/<機能>/logic.ts` ／ 横断なら `lib/` |
| 状態を持って何度も操作されるもの（ショップ、アリーナ、タイマー管理） | **クラス** | `features/<機能>/` |
| 定型の UI（確認ダイアログ、一覧選択） | 組み立て関数 | `features/<機能>/ui.ts` ／ 横断なら `lib/` |
| ラベル・文言・色 | 定数（オブジェクト） | `lib/format.ts` |

**判断の目安:**

- **状態を持たないなら関数。** 迷ったらまず関数で書く。
- **状態と、それを操作する手続きがセットなら クラス。**
  「初期化して、以後メソッドで操作する」ものはクラスにする。
- **Minecraft の API に触る部分と、触らない部分を必ず分ける。**
  触らない部分（計算・判定）が純粋関数として独立していれば、
  それは自動的に再利用可能になる。**これが一番効く。**

```ts
// 悪い: 計算とワールド操作が混ざっていて、他所から使えない
function giveReward(player: Player, score: number) {
  const amount = Math.min(64, Math.floor(score / 10) + 1);   // 計算
  player.getComponent("inventory")?.container?.addItem(...);  // ワールド操作
}

// 良い: 計算が独立していて、UI 表示にもコマンドにも使い回せる
// logic.ts — Minecraft API に依存しない
export function rewardAmount(score: number): number {
  return Math.min(64, Math.floor(score / 10) + 1);
}
// index.ts — ワールド操作はここだけ
function giveReward(player: Player, score: number) {
  const amount = rewardAmount(score);
  player.getComponent("inventory")?.container?.addItem(...);
}
```

---

## 目次

1. [設計原則](#1-設計原則)
2. [ディレクトリ構成と配置ルール](#2-ディレクトリ構成と配置ルール)
3. [TypeScript と型安全](#3-typescript-と型安全)
4. [コメント規約](#4-コメント規約)
5. [Script API v2 の実行文脈（最重要）](#5-script-api-v2-の実行文脈最重要)
6. [定数・文言の集中管理](#6-定数文言の集中管理)
7. [権限制御](#7-権限制御)
8. [外部入力の取り扱い](#8-外部入力の取り扱い)
9. [引き継がなかったもの](#9-引き継がなかったもの)

---

## 1. 設計原則

すべての実装判断はこの6原則に従う。

| # | 原則 | 具体策 |
|---|------|--------|
| **P-1** | **UI は徹底的に再利用する** | `@minecraft/server-ui` のフォームは組み立て関数に切り出し、呼び出し側は「何を出すか」だけ指定する。確認ダイアログ・一覧選択・数値入力などの定型は共通部品にする |
| **P-2** | **関数・ロジックは再利用前提で書く** | 判定・整形・座標計算・権限判定を**純粋関数**として `lib/` に切り出し、イベントハンドラから分離する。イベントハンドラは「引数を組み立てて純粋関数を呼ぶ」だけにする |
| **P-3** | **コメントを厚く残す** | 人／別の AI エージェントが直しやすいよう、ファイル冒頭・公開関数・非自明なロジックには必ず説明コメント（日本語可）を付ける（[4章](#4-コメント規約)） |
| **P-4** | **型安全をエンドツーエンドで担保** | **TypeScript 必須**。`any` 禁止。外部から来る値（dynamic property・Custom Component のパラメータ・コマンド引数・HTTP レスポンス）は**必ず型ガードを通してから使う**（[3章](#3-typescript-と型安全)） |
| **P-5** | **1機能1目的。ハンドラは薄く保つ** | 1つのイベント購読・1つのコマンドは1つの目的だけ。複雑な状態をハンドラ内に持ち込まず、状態は明示的なモジュールに集約する |
| **P-6** | **拡張前提で作る（今回切りにしない）** | 機能追加は `features/<新機能>` を足すだけで済む形にする。永続データは**キー追加で拡張**できる形（dynamic property の名前空間・スコアボード目標名）にし、**既存キーの意味を変えない**。ワールドは破壊的変更を避け、後方互換を保つ |

> **P-6 補足（Minecraft 固有）**
> ワールドのデータは**壊すと戻せない**。dynamic property のキー名や保存形式を変えるときは、
> 旧キーを読んで新キーへ移行するコードを必ず用意する（黙って読み替えない）。

---

## 2. ディレクトリ構成と配置ルール

features ベース・コロケーション設計。
**「ある機能に関わるものはすべて `scripts/features/<機能名>` にある」** 状態を目指す。

アドオン1つのフォルダ構成（`CLAUDE.md` の「フォルダ分けルール」に従い `addons/<名前>/`）:

```
addons/<名前>/
├── scripts/                        ① TypeScript のソース
│   ├── main.ts                     エントリ。購読と登録の「配線」だけ。ロジックは置かない
│   ├── features/                   ② 機能単位の実装（主役）
│   │   └── <機能>/
│   │       ├── index.ts            この機能の初期化（register 系）を公開する入口
│   │       ├── components.ts       Custom Component の実装
│   │       ├── commands.ts         カスタムコマンドの定義と実装
│   │       ├── ui.ts               server-ui のフォーム組み立て
│   │       ├── logic.ts            純粋関数（テスト可能・Minecraft API に依存しない部分）
│   │       └── types.ts            この機能固有の型・型ガード
│   ├── lib/                        ③ 機能横断のユーティリティ
│   │   ├── storage.ts              dynamic property の読み書き（型ガード込み）
│   │   ├── permission.ts           権限判定（7章）
│   │   ├── format.ts               文言・ラベル・色の対応表（6章）
│   │   ├── vec.ts                  座標・ベクトル計算
│   │   └── log.ts                  ログ出力の共通化
│   └── types/                      ④ アドオン全体で使う型
│
├── behavior_packs/<名前>/          BP。entities/ blocks/ items/ recipes/ …
├── resource_packs/<名前>/          RP。textures/ models/ …
└── (package.json / .env / just.config.ts / tsconfig.json)
```

### 配置ルール（迷ったらここを見る）

| 置きたいもの | 置き場所 |
|---|---|
| イベント購読・コンポーネント登録の**配線** | `scripts/main.ts`（**配線だけ**。中身は features へ） |
| 特定機能の Custom Component の実装 | `scripts/features/<機能>/components.ts` |
| 特定機能のカスタムコマンド | `scripts/features/<機能>/commands.ts` |
| フォーム（ActionForm / ModalForm / MessageForm）の組み立て | `scripts/features/<機能>/ui.ts` |
| Minecraft API に依存しない計算・判定 | `scripts/features/<機能>/logic.ts`（**最優先で切り出す**） |
| 複数機能で使う判定・整形 | `scripts/lib/` |
| dynamic property の読み書き | `scripts/lib/storage.ts`（**直接 `setDynamicProperty` を呼ばない**） |
| ラベル・メッセージ文言・色 | `scripts/lib/format.ts` |
| 複数機能で使う型 | `scripts/types/` ／ 機能固有は `features/<機能>/types.ts` |
| ブロック・アイテム・エンティティの JSON 定義 | `behavior_packs/<名前>/` |

### 横断利用の所有ルール

複数の feature から使われる部品でも、**ドメインを持つものは所有 feature に置き、他 feature が import する。**
`scripts/lib/` に置くのは「真に機能非依存」なものだけ（座標計算・文言整形・ストレージ・権限）。

### main.ts は配線だけ

```ts
// 良い例: main.ts は「何を有効にするか」だけが読み取れる
import { system, world } from "@minecraft/server";
import { registerShopComponents, registerShopCommands } from "./features/shop/index.js";
import { initArena } from "./features/arena/index.js";

system.beforeEvents.startup.subscribe((init) => {
  registerShopComponents(init);
  registerShopCommands(init);
});

world.afterEvents.worldLoad.subscribe(() => {
  initArena();
});
```

`main.ts` を読めば**このアドオンが何をするか一覧できる**状態を保つ。

---

## 3. TypeScript と型安全

### 3.1 TypeScript 必須

**アドオンのスクリプトは TypeScript で書く。** JavaScript を直接書かない。
ビルド（`just-scripts`）が `dist/scripts/main.js` にバンドルし、それをパックに載せる。

`tsconfig.json` は `strict: true`（ひな形で設定済み）。これを緩めない。

### 3.2 `any` 禁止

`any` は使わない。型が分からない値は `unknown` で受けて、**型ガードで絞り込んでから使う**。

Web 側では Zod で入力検証していたが、**アドオンには Zod を持ち込まない**
（バンドルサイズと、Minecraft のスクリプト環境で余計な依存を増やさないため）。
代わりに**手書きの型ガード関数**を各 `types.ts` に置く。

```ts
// features/shop/types.ts
export type ShopEntry = { itemId: string; price: number };

/** 外部（dynamic property の JSON 等）から来た値を ShopEntry として検証する */
export function isShopEntry(v: unknown): v is ShopEntry {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.itemId === "string" && typeof o.price === "number" && Number.isFinite(o.price);
}
```

### 3.3 型ガードを必ず通すもの（外部入力）

以下は**すべて信用しない**。型定義上の型と、実際に入っている値は一致しない可能性がある。

| 入力 | 理由 |
|---|---|
| `getDynamicProperty()` の戻り値 | 過去バージョンの自分が書いた値・別パックが書いた値が入りうる |
| Custom Component の `CustomComponentParameters.params` | JSON 側は人間が手で書くので誤りうる |
| カスタムコマンドの引数 | プレイヤーが入力する |
| `server-ui` のフォーム結果 | インデックスや型がフォーム定義とずれうる |
| `@minecraft/server-net` の HTTP レスポンス | 外部サービスの都合で変わる |

### 3.4 バニラ ID は `@minecraft/vanilla-data` の enum を使う

ブロック・アイテム・エンティティの ID を**文字列リテラルで直書きしない**。
`@minecraft/vanilla-data`（ひな形に導入済み）の enum を使う。タイポがコンパイル時に落ちる。

### 3.5 API の存在を記憶で書かない

**Script API は破壊的変更が頻繁で、v1 時代の情報がネット上に大量に残っている。**
コードを書く前に、必ず一次情報を確認する。

1. `addons/<名前>/node_modules/@minecraft/server/index.d.ts`（TSDoc 付き・最も正確）
2. `reference/minecraft-creator-docs/creator/`
3. `reference/bedrock-samples/`（JSON の実例）

記憶だけで `worldInitialize` / `runCommandAsync` / `isValid()` のような
**v1 の API を書かない**（[research/01](./research/01-script-api-current-state.md)）。

---

## 4. コメント規約

**人／別の AI エージェントが直しやすいことを最優先する（P-3）。**
コメントは「何をしているか」ではなく、**「なぜそうしているか」**を書く。

| 対象 | 書くこと |
|---|---|
| ファイル冒頭 | このファイルの責務。1〜3行 |
| 公開関数 | 何を受け取り何を返すか。**副作用があるなら明記**（ワールドを変更する、永続化する等） |
| 非自明なロジック | なぜその値・その順序なのか |
| **Minecraft 固有の制約による記述** | **必ず理由を書く**（下記） |

とくに以下は、理由を書かないと後から読んだ人が「無駄なコード」と判断して消してしまう。
**消されると壊れる**ので必ず残す。

```ts
// worldLoad の中で初期化する。トップレベルは early execution で、
// world の状態（プレイヤー・ブロック）に触るとエラーになるため。
world.afterEvents.worldLoad.subscribe(() => { ... });

// before イベントのコールバックは restricted execution なので
// ここで world を変更することはできない。変更は system.run で次tickに逃がす。
world.beforeEvents.playerBreakBlock.subscribe((e) => {
  const player = e.player;
  system.run(() => { /* ここなら変更できる */ });
});

// 1 tick で回しきると watchdog に落とされるため runJob で分割する。
system.runJob(fillGenerator(from, to));
```

日本語で書いてよい。

---

## 5. Script API v2 の実行文脈（最重要）

Web 側の「Next.js 16 の注意点」に相当する、**このプロジェクトで最も事故る箇所**。
詳細は [research/01](./research/01-script-api-current-state.md) と
[research/02](./research/02-hot-reload.md)。

### 5.1 実行権限は3種類ある

| 権限 | いつ | 制約 |
|---|---|---|
| **early execution** | スクリプト初回実行、`system.beforeEvents.startup`、Custom Component 登録 | ほとんどの API が使えない。`world` の状態に触れない |
| **restricted execution** | `before` イベント、**カスタムコマンドのコールバック**、プロパティ getter | world の状態を**変更**できない（読み取りは可） |
| **default execution** | `after` イベント、`system.run` 系のコールバック | 全 API 使用可 |

**実装ルール:**

- トップレベルに `world` を触るコードを書かない。初期化は `world.afterEvents.worldLoad` の中。
- Custom Component / カスタムコマンドの**登録**は `system.beforeEvents.startup` の中。
- `before` イベントやコマンドで world を変更したくなったら、**`system.run()` で次の tick に逃がす**。

> **2026-08-24 追記: 実際に踏んだ。**
>
> カスタムコマンドのコールバックで持ち物を空にしようとして、
> `native function [container::clearAll] cannot be used in restricted execution`
> で落ちた。
>
> **「変更」の範囲は思ったより広い。**
> 持ち物を触る・効果を付ける・動的プロパティを書く・ブロックを置く、
> **すべて変更にあたる。**
>
> コマンドは**受け付けたことだけを返し、仕事は `system.run` の中で行う。**
> 結果は `sendMessage` で後から伝える。この形にしておけば踏まない。

### 5.2 ホットリロードを効かせる書き方

**開発効率が段違いに変わる**ので、以下を守る（[research/02](./research/02-hot-reload.md)）。

- **tick 固定の初期化に依存しない。** `if (system.currentTick === 100)` は `/reload` 後に二度と動かない。
- **登録とロジックを分ける。** 登録はワールドロード時にしか走らないが、
  **登録したコールバックが呼ぶ関数の中身は `/reload` で差し替わる**。
  コールバックは薄いディスパッチだけにする。
- **調整したい値は、開発中はスクリプト内の定数に置く。**
  Custom Component のパラメータを JSON に書くと、値をいじるたびにワールド再入場になる。
  固まってから JSON へ移す。

### 5.3 watchdog

1 tick で重い処理をするとスクリプトが強制終了される。
広範囲のブロック操作・大量エンティティの走査は `system.runJob`（ジェネレータ）で分割する。

### 5.4 beta モジュール・実験機能について

**使ってよい**（2026-08-22 決定）。必要なものが beta にしかないケースが多いため。

ただし壊れたときに追跡できるよう、**使っている beta API は `docs/` に記録する**。
実験トグルが要るものは、ワールド側の設定も併せて記録する。

現在使っているもの:

| 何を | どこで | なぜ要るか |
| --- | --- | --- |
| **`@minecraft/debug-utilities`**（beta モジュール） | `worlds/core-wars/packs/game` | `DebugText` でジェネレータの頭上に文字を出す。モブを置かずに済む |
| **ワールドの実験「次期クリエイター機能」** | Core Wars のワールド | ブロックの `item_specific_speeds`（道具ごとの硬さ）に必要 |
| **ワールドの実験「ベータAPI」**（`gametest`） | 同上 | beta モジュールを読み込むために必要 |

> **実験を有効にしたワールドは元に戻せない。** Minecraft の仕様。
> 有効にする前に、本当に必要かを確かめること。
>
> `item_specific_speeds` が無効だと**黙って無視される。**
> エラーも出ないので、「硬さが変わらない」という症状だけが残る。
> 実際にそれで時間を使った（2026-08-24）。


| API / 機能 | 状態 | 用途 | 記録先 |
| --- | --- | --- | --- |
| `@minecraft/server-net` | beta のみ（stable なし） | Ollama への HTTP | [spec/02-llm-chat.md](./spec/02-llm-chat.md) |
| `EntityNpcComponent` | pre-release | NPC の名前・スキン設定 | 同上 |

---

## 6. 定数・文言の集中管理

Web 側の `lib/format.ts` の `CATEGORY_META` に相当する。
**対応表は1箇所に集約し、変更がそこだけで完結する状態にする。**

```ts
// scripts/lib/format.ts

/** チャットに出す文言。色コードもここに集約する（散らかると統一感が壊れる） */
export const MSG = {
  loaded:      "§a読み込みました",
  noPermission:"§c権限がありません",
  notEnough:   "§e所持数が足りません",
} as const;

/** ランクの表示名と色。追加はここ1箇所 */
export const RANK_META = {
  novice: { label: "見習い", color: "§7" },
  expert: { label: "熟練",   color: "§b" },
  master: { label: "達人",   color: "§6" },
} as const satisfies Record<string, { label: string; color: string }>;
```

- **`§` の色コードを本文中に散らさない。** 文言ごと定数にする。
- 将来の多言語対応（`texts/*.lang`）に移せるよう、**文言は必ず定数経由**にする。

---

## 7. 権限制御

Web 側の「二重ガード＋データ層」の考え方をそのまま持ち込む。
**UI で出さないことと、実行側で弾くことの両方をやる（多層防御）。**

### 7.1 区分

| 区分 | 判定 |
|---|---|
| 一般プレイヤー | 既定 |
| 運営 | tag で判定（例: `mcapp:staff`） |
| オペレーター | `player.commandPermissionLevel` / BDS の `permissions.json` |

### 7.2 実装ルール

1. **判定は `scripts/lib/permission.ts` に集約する。** 各所で `hasTag("...")` を直書きしない。
2. **二重ガード:**
   - UI 生成時に、権限のない項目は**そもそも出さない**（ボタンを並べない）。
   - **実行側でも必ず判定する。** UI の出し分けだけに依存しない
     （フォームの応答はクライアント由来で、UI を出していなくても呼ばれうる）。
3. **カスタムコマンドは `permissionLevel` を明示する。**
   `CustomCommandPermissionLevel` を設定したうえで、コールバック内でも判定する。

```ts
// scripts/lib/permission.ts
import type { Player } from "@minecraft/server";

const STAFF_TAG = "mcapp:staff";

/** 運営かどうか。判定を変えるときはここ1箇所 */
export function isStaff(player: Player): boolean {
  return player.hasTag(STAFF_TAG);
}
```

---

## 8. 外部入力の取り扱い

### 8.1 プレイヤー入力

カスタムコマンドの引数・フォームの入力は**プレイヤーが自由に入れられる**。

- 数値は範囲を検証する（`Number.isFinite` / 上下限）。座標は特に、極端な値でワールドを壊せる。
- 文字列をそのままエンティティ ID・ブロック ID として使わない。**許可リストで照合する。**
- チャットに出す文字列に `§` が混ざると表示が壊れるので、**エスケープするか除去する。**

### 8.2 HTTP（`@minecraft/server-net` を使う場合）

Web 側の `sanitizeExternalUrl()` に相当する方針を持つ。

- **接続先 URL をプレイヤー入力から組み立てない。** 定数か設定ファイル由来のみ。
- **認証情報はコードに書かない。** BDS の `config/<モジュールUUID>/secrets.json` に置き、
  `@minecraft/server-admin` の `secrets.get()` で読む
  （[research/03](./research/03-bds-and-friend-join.md)）。
- レスポンスは `unknown` で受け、**型ガードを通してから使う**（3.3）。
- `server-net` は **BDS 限定かつ experimental**。使う判断は `docs/` に書いてから。

---

## 9. 引き継がなかったもの

元の実装方針から、**このプロジェクトには適用しない**と判断したもの。理由を残す。

| 元の内容 | 判断 |
|---|---|
| Tailwind / `@theme` / デザイントークン | **破棄。** Minecraft の UI は `server-ui` のフォームと JSON-UI で、CSS の概念がない。色は `§` コードで、`lib/format.ts` に集約する形に置き換えた（[6章](#6-定数文言の集中管理)） |
| Next.js App Router / RSC / Server Actions | **破棄。** 対応物がない |
| Supabase / RLS / DB 型生成 | **破棄。** 永続化は dynamic property・スコアボード・structure。「データ層でも守る」思想だけ [7章](#7-権限制御) に残した |
| Zod による入力検証 | **置き換え。** バンドルサイズと依存を増やしたくないため、手書きの型ガードにした（[3.2](#32-any-禁止)）。「外部入力は必ず検証してから使う」原則そのものは維持 |
| ブラウザ拡張への耐性 | **破棄。** 該当なし |
| BAN / なりすまし / 管理画面 | **破棄。** 現時点で該当機能がない。必要になったら `docs/spec/` に書いてから作る |
| 運用向け SQL（画面から行わせない操作） | **形を変えて維持。** 「画面から行わせない操作は手順として残す」という考え方は、`tools/` のスクリプトと `docs/spec/` に引き継いだ |
| `sanitizeExternalUrl()` | **形を変えて維持。** [8章](#8-外部入力の取り扱い)。URL をプレイヤー入力から組み立てない方針に置き換えた |

---

## 付録: 現時点で未確定のもの

作るものが決まっていないため、以下は決まり次第 `docs/spec/` に書く。

- [ ] 永続化の方式（dynamic property / スコアボード / structure の使い分け）
- [ ] マルチプレイ時の状態同期の方針
- [ ] 複数アドオン間で共通ロジックを共有するかどうか（現状は「共有しない」＝1アドオン1プロジェクト）
- [ ] 多言語対応（`texts/*.lang`）をやるかどうか
