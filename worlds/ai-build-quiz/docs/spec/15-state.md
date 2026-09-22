# 仕様 15: BP が持つ状態と鍵

> 作成日: 2026-09-21 / [docs/imp.md 10-5](../../../../docs/imp.md)「保存する鍵は 1 か所に宣言する」

## 1. 3 種類の置き場

| 置き場 | 何を | なぜ |
| --- | --- | --- |
| **scoreboard** | `phase` / `round`（bridge が読む）、`quiz_score`（人が見る） | **外から読めるのは scoreboard だけ**。見せるものも scoreboard |
| **dynamic property** | 無し（いまは） | ゲームは 1 回きりで、ワールドを跨いで残すものが無い |
| **メモリ** | いまのお題（答え・表記ゆれ・palette・展開したブロック列）、置いた個数、回答中の残り tick、正解済みの人 | `/reload` で消えてよいもの。消えたら `idle` に戻る（**覚えるより、あるべき姿へ寄せる**——imp.md 10-7） |

## 2. scoreboard

| 目標 | 表示名 | 参加者 | 値 |
| --- | --- | --- | --- |
| `quiz` | （隠す） | 偽プレイヤー `phase` | 0 お題待ち / 1 置いている / 2 回答中 / 3 発表 / 8 idle / 9 受信失敗（4 は廃止） |
| `quiz` | | 偽プレイヤー `round` | ラウンド番号（`/quiz:start` で 0） |
| `quiz` | | 偽プレイヤー `mode` `kind` `rounds` `rule` `gen` | モード（0 フリー / 1 対戦 / 2 出題）、固定カテゴリ（0 すべて / 1〜9）、対戦の問数、回答のルール（0 早い者勝ち / 1 全員回答）、生成モデル（0 v1 / 1 v2）（[17-modes.md](17-modes.md)） |
| `quiz_score` | `§e対戦スコア` | 各プレイヤー | 対戦モードの正解数。対戦を始めるたびに 0。**表示スロットには出さない** |
| `quiz_total` | `§e累計正解` | 各プレイヤー | 当てるたびに +1。消さない。list（tab）とランキング板 |
| `quiz_rules` | `§e現在のルール` | 偽プレイヤー（行の文字列） | 行番号（降順）。サイドバー。[17-modes.md 6 章](17-modes.md) |

**`phase` を書くのは `state/phase.ts` の 1 か所だけ。** 各 feature は `setPhase("answering")` のように名前で呼び、数への写像はそこにある。

## 3. メモリ（`state/round.ts`）

```ts
type Round = {
  round: number;
  answer: string;            // 表示用（発表で出す）
  accepted: readonly string[]; // 正規化済みの正解＋表記ゆれ
  kind: string;              // カテゴリ（10 秒のヒント）
  hint: string;              // ジャンル（10 秒のヒント。空なら出さない）
  hinted: boolean;           // 出したヒント
  startedTick: number;       // 置き始めた tick（正解までのタイムに使う。11-flow 5 章）
  prompt?: string;           // 出題モード: 画像モデルに渡したプロンプト（発表で出す）
  topic?: string; detail?: string; // 出題モード: 出題者の入力（発表で出す）
  size: number;              // 60
  palette: readonly string[]; // 許可リストと照合済み。[0] は air
  cells: readonly Cell[];    // 置く順（下の層から・層内ランダム）に並べた {x,y,z,block}
  placed: number;            // 置いた個数
  correct: Set<string>;      // 正解した player.id
  answerTicksLeft: number;   // 回答中の残り tick
};
```

- **モード・固定カテゴリ・対戦の問数**: `state/mode.ts`。scoreboard `quiz` の `mode` `kind` `rounds` と同時に更新（bridge が読む。ワールドに残る）。[17-modes](17-modes.md)
- **出題者**: `state/round.ts` の `Round.setterId`（出題モードだけ。無ければ undefined）
- **出題キュー**: `state/queue.ts`。**ワールドの dynamic property**（`quiz:queue` に id の並び、`quiz:queue:<id>` に 1 件の JSON `{id, topic, detail, authorId, authorName}`、`quiz:queue:open` に受付中か）。`/reload` で消えない。抜けた人の分は消す（[17-modes 3 章](17-modes.md)）
- **対戦の問数（このゲーム）**: `state/round.ts` の `versusGoal`（`/quiz:start` で `rounds` を写す。フリー・出題は undefined）。N 問目の発表が終わったら結果を出して止める（[17-modes 1 章](17-modes.md)）
- **チャットの最新 20 行**: `state/chatlog.ts`（メモリ）。`tellAll` と普通の発言が積む。出題の UI がチャットの代わりに見せる（[17-modes 3 章](17-modes.md)）
- **空中の文字（ランキング板・出題キューの板）**: `services/floating.ts` がメモリに持つ。`/reload` で消え、次の tick で作り直す
- **累計**: scoreboard `quiz_total`（消さない）。対戦スコア `quiz_score` は対戦を始めるたびに消す
- **bridge の生存**: `state/bridge.ts` が `quiz:ping` を最後に受けた tick を持つ。`bridgeConnected(now)` = 5 秒（100 tick）以内
- 受信中（chunk を集めている間）は `pending: { round, chunks: Map<number,string>, total, header }` を別に持ち、揃って `go` が来たら `Round` を作る
- `/quiz:stop` と `/reload` で全部捨てる

## 4. 層（imp.md 10-4）

```
core/     純粋: rle の展開・正規化と照合・置く順の並べ替え・N の計算   ← node でテスト
  ↑
state/    phase（scoreboard）・round（メモリ）・score（scoreboard）
  ↑
features/ quiz（受信・進行）・build（置く）・answer（chatSend）・hud（表示）・border・flight・admin（コマンド）
```

**feature どうしは import しない。** 共有するものは state に置く。輪は `loop.ts` の 1 本。
