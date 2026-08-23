# 仕様: `wsbridge` — 通常ワールドで `@cat` に LLM が応答する

> 作成日: 2026-08-22
> 実装方針: [../imp.md](../imp.md)
> 関連: [02-llm-chat.md](./02-llm-chat.md)（BDS 版の LLM チャット）

## 0. 概要

**通常ワールド（クライアントホスト）で、`@cat` と発言すると LLM が応答する。**

BDS 版（`tools/bots`）とは**別の仕組み**。アドオンも不要。

```
Minecraft（通常ワールド）
   │  /wsserver ws://127.0.0.1:8765
   ▼
wsbridge（Node の WebSocket サーバー）
   │  PlayerMessage を購読 → @cat を検出
   ▼
Ollama http://127.0.0.1:11434/api/chat
   │
   ▼  commandRequest で /say を実行
Minecraft のチャットに応答が出る
```

## 1. なぜこの方式なのか

Script API から外部へ HTTP を投げられるのは **`@minecraft/server-net` だけ**だが、
これは **BDS 限定**で、通常ワールドでは動かない。

> The `@minecraft/server-net` module contains types for executing HTTP-based requests.
> **This module can only be used on Bedrock Dedicated Server.**
> These APIs do not function within the Minecraft game client or within Minecraft Realms.

一方 **`/wsserver` はゲーム本体のコマンド**で、Script API とは独立している。
**クライアントでも動く。** これが通常ワールドで外部連携する唯一の現実的な手段。

> Mojang の開発者いわく「WebSocket は unsupported surface」。
> 公式ドキュメントにはコマンドの説明しかなく、
> **プロトコルの詳細は非公式**（[bedrock-wiki/docs/meta/scripting-editor-qna.md](../../reference/bedrock-wiki/docs/meta/scripting-editor-qna.md)）。

### 接続の向きに注意

**Minecraft 側から外部サーバーへ繋ぎに行く。** 逆ではない。
そのため、先に `wsbridge` を起動しておいてから `/wsserver` を打つ。

## 2. プロトコル

JSON をやり取りする。`header` + `body` の形。

### 2-1. イベントの購読（bridge → Minecraft）

```json
{
  "header": {
    "version": 1,
    "requestId": "<uuid>",
    "messageType": "commandRequest",
    "messagePurpose": "subscribe"
  },
  "body": { "eventName": "PlayerMessage" }
}
```

`PlayerMessage` を購読すると、**プレイヤーがチャットするたびに通知が来る**。

### 2-2. イベントの受信（Minecraft → bridge）

```json
{
  "header": { "messagePurpose": "event", "eventName": "PlayerMessage" },
  "body": {
    "sender": "zerda256py",
    "message": "@cat こんにちは",
    "type": "chat"
  }
}
```

### 2-3. コマンドの実行（bridge → Minecraft）

```json
{
  "header": {
    "version": 1,
    "requestId": "<uuid>",
    "messageType": "commandRequest",
    "messagePurpose": "commandRequest"
  },
  "body": {
    "origin": { "type": "player" },
    "commandLine": "say §bこんにちは",
    "version": 1
  }
}
```

**応答は `/say` で返す。** チャットに出す手段がこれしかない。

> - [ ] **未検証**: `body` の正確なフィールド名。実装時に確かめる

## 3. 動作条件

| | |
| --- | --- |
| 権限 | `/wsserver` は **Admin / チート必須** |
| 起動順 | **wsbridge を先に起動** → その後 `/wsserver` |
| 切断 | `/wsserver` に空文字を渡すと切断 |
| 対象 | **通常ワールド専用**（BDS でも動くが、そちらは既存の `tools/bots` を使う） |

## 4. 応答の条件

BDS 版（[02-llm-chat.md](./02-llm-chat.md)）と揃える。

1. 発言に **`@cat`** が含まれる
2. `@cat` の直後が英数字なら無効（`@catalog` で誤爆しない）
3. 大文字小文字は区別しない

**BDS 版と違い「cat がいるとき」の条件は無い**（そもそもボットが存在しないため）。

## 5. 実装

```
tools/wsbridge/
├── package.json
├── wsbridge.config.json
└── src/
    ├── main.ts          起動。WebSocket サーバーを立てる
    ├── Bridge.ts        1接続ぶんの処理（購読・受信・コマンド送信）
    ├── protocol.ts      メッセージの組み立てと型ガード
    ├── llm.ts           Ollama への HTTP
    ├── history.ts       会話履歴
    ├── logic.ts         純粋関数（メンション判定・応答整形）
    └── types.ts         設定の型と検証
```

**BDS 版から流用できるもの**（同じ問題を二度解かない）:

- `logic.ts` の `extractMention` / `sanitizeReply`
- `LlmQueue`（直列キュー）
- `ConversationHistory`（全員で1つ・直近20件）
- `ollama.ts`（`think: false` と英語プロンプト）

**流用時の注意**: BDS 版は `§` を除去していたが、
`/say` でも `§` は使えるので、**応答の色付けは同じ方針**にする。

## 6. 起動

```bash
node tools/mc.mjs ws start     # bridge を起動
node tools/mc.mjs ws stop
node tools/mc.mjs logs ws
```

ゲーム内:

```
/wsserver ws://127.0.0.1:8765     接続
/wsserver ""                      切断
```

## 7. やらないこと（初版）

- 複数クライアントの同時接続（1接続のみ扱う）
- `PlayerMessage` 以外のイベント購読
- コマンドの実行結果の解釈
- 認証（`127.0.0.1` にのみ bind する）

## 8. 未確定

- [ ] `commandRequest` の `body` の正確な形
- [ ] `/say` 以外にチャットへ出す手段があるか（`tellraw` など）
- [ ] 発言者の名前を応答に含められるか
- [ ] ワールドを抜けると接続が切れるか。再接続の必要性
