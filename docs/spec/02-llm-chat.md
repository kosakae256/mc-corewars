# 仕様: `bots` — 偽プレイヤーの召喚と、LLM との会話

> 作成日: 2026-08-22
> 構想: [../idea/01-llm-chat.md](../idea/01-llm-chat.md)
> 実装方針: [../imp.md](../imp.md)（TypeScript / 再利用 / コメント厚く の原則は本ツールにも適用する）

## 0. 概要

**サーバーにプレイヤーとして参加する「偽プレイヤー（ボット）」を、任意のタイミングで何体でも召喚する。**
そのうち **`cat` という名前のボットがいるときだけ**、`@cat` メンションに LLM が応答する。

```
       Minecraft クライアント（人間）
              │  チャット
              ▼
        ┌──────────────┐
        │ BDS          │
        └──────────────┘
              ▲  Bedrock protocol でプレイヤーとして接続
              │
   ┌──────────┴───────────────────────┐
   │ bots マネージャ (Node)             │
   │   ├─ ボット cat                    │
   │   ├─ ボット foo                    │
   │   └─ ボット …（任意の数）           │
   │                                   │
   │   LLM キュー（直列）                │
   │        └─▶ Ollama (qwen3.5:9b)    │
   └───────────────────────────────────┘
```

### なぜアドオンではないのか

`minecraft:npc` は**見た目がプレイヤーなだけの置物**で、
プレイヤー一覧に出ない・歩かない・チャットしない。要件を満たさない。

「プレイヤーと同じように参加して行動するもの」は、
**Bedrock プロトコルを喋る外部クライアント**でしか作れない。
したがって **Script API / ビヘイビアーパックの範囲外**であり、
`addons/` ではなく **`tools/bots/`** に置く。

> このため、先に作った `addons/llm_chat` は不要。中身は空のひな形なので削除する。
> 将来アドオン側でやりたいことが出たら `node tools/new-addon.mjs` で作り直せる。

## 1. 使うもの

| | |
| --- | --- |
| ライブラリ | **`bedrock-protocol`**（PrismarineJS）**3.58.2** |
| 対応 | **1.26.44 対応済み**（2026-08-15 のコミット `add 1.26.44 support`） |
| LLM | Ollama `http://127.0.0.1:11434/api/chat` / **`qwen3.5:9b`** |
| 言語 | TypeScript |

## 2. ボットの接続方式

### 2-1. offline モードで繋ぐ

`bedrock-protocol` の **`offline: true`** を使う。
Xbox 認証をせず、**`username` に指定した任意の名前**で接続する。

```ts
createClient({
  host: "127.0.0.1",
  port: 19132,
  username: "cat",
  offline: true,
});
```

これにより:

- **アカウントを用意せず、何体でも召喚できる**
- **名前を自由に決められる**（ランダム生成も可）

### 2-2. サーバー側の設定変更が必要

`offline: true` のクライアントを受け入れるには、
BDS の **`online-mode=false`** が要る。

> **これは認証を外す変更。** 公式ドキュメントは
> 「インターネットに公開するなら `online-mode` を有効にすることを強く推奨」としている。
>
> 一方で同じ項目にこうも書かれている:
> > Clients connecting to remote (non-LAN) servers will **always** require
> > Xbox Live authentication regardless of this setting.
>
> この記述どおりなら、**外部からの接続は引き続き認証され、
> ローカル（127.0.0.1）から繋ぐボットだけが認証を免除される**。
> ただし確証がないため、**変更後に外部からの接続が壊れていないか実測する**。
>
> - [ ] `online-mode=false` にした状態で、スマホ（モバイル回線）から入れるか確認

ボットは**同一マシンから `127.0.0.1` に繋ぐ**。外部に晒す必要はない。

### 2-3. `max-players`

**`20` に変更済み**（既定は 10）。人間とボットで共有する。

## 3. マネージャの構成

```
tools/bots/
├── package.json
├── bots.config.json        接続先・LLM・人格の設定
├── src/
│   ├── main.ts             起動。設定を読み、マネージャを立てる
│   ├── BotManager.ts       ボットの集合を管理（召喚・撤去・一覧）
│   ├── Bot.ts              ボット1体。接続・チャット送受信
│   ├── CommandRouter.ts    チャットから拾ったコマンドを解釈して実行
│   ├── LlmQueue.ts         LLM 呼び出しの直列キュー
│   ├── ollama.ts           Ollama への HTTP
│   ├── logic.ts            純粋関数（メンション判定・応答整形・名前検証）
│   ├── types.ts            型と型ガード
│   └── format.ts           文言・色
└── dist/                   ビルド成果物（git 管理外）
```

[../imp.md](../imp.md) の原則に従う。とくに:

- **`logic.ts` は Minecraft にもネットワークにも依存しない純粋関数だけ**
- **状態を持つものはクラス**（`BotManager` / `Bot` / `LlmQueue`）
- `any` 禁止。外部入力（チャット文字列・Ollama のレスポンス）は型ガードを通す

## 4. ボット（`Bot`）

### 4-1. 役割

1体のボットの接続と、チャットの送受信を担う。

| メソッド | 動作 |
| --- | --- |
| `connect()` | サーバーに接続する。`spawn` イベントまで待つ |
| `say(text)` | チャットに発言する |
| `disconnect()` | 切断する |

### 4-2. チャットの受信

`client.on("text", ...)` で受ける。

**自分（および他のボット）の発言は無視する。**
無視しないとボット同士・自分自身に反応して**無限ループになる**。
判定は `source_name` がマネージャの管理下にある名前かどうかで行う。

**`source_name` には色コードが混ざる**（`zerda256py§r`）。
`normalizeSender()` で剥がしてから比較する（落とし穴 D）。

### 4-3. チャットの送信

```ts
client.queue("text", {
  needs_translation: false,
  category: "authored",          // 欠かすと切断される
  type: "chat",
  source_name: this.name,
  message: text,
  xuid: "",
  platform_chat_id: "",
  has_filtered_message: false,   // 欠かすと切断される
  filtered_message: "",
});
```

`write` ではなく **`queue`** を使う（公式ドキュメントの推奨）。

**項目を1つでも欠くとサーバーに切断される。** 詳細は
[実装で判明した落とし穴 A](#a-text-パケットは項目を1つでも欠くと切断される)。

## 5. コマンド（Minecraft のチャットから叩く）

**アドオンのカスタムコマンドではなく、チャット発言をボットが読んで解釈する。**
`/` はサーバーのコマンドと衝突するので、接頭辞は **`!`** を使う。

| コマンド | 動作 |
| --- | --- |
| `!summon <名前>` | その名前でボットを召喚する |
| `!summon` | **ランダムな名前**で召喚する |
| `!dismiss <名前>` | そのボットを切断する |
| `!dismiss all` | 全ボットを切断する（マネージャは残る） |
| `!bots` | 現在いるボットの一覧を返す |
| `!forget` | 会話履歴を破棄する |

### 5-1. 名前の規則

- 使える文字: **英数字・アンダースコア・ハイフン**、**1〜16文字**
- 既にいる名前は拒否する
- ランダム名は `形容詞 + 名詞 + 2桁数字`（例: `calm_fox42`）
  - 語彙は `logic.ts` の定数。重複したら再抽選（最大10回）

### 5-2. 応答

コマンドの結果は**チャットに返す**。誰が返すかは、
**コマンドを受け取ったボット**（＝最初に反応したボット）。

```
!summon
<cat> foo を召喚しました
```

### 5-3. コマンドの重複処理を防ぐ

**全ボットが同じチャットを受信する。** そのまま処理すると
ボットの数だけ同じコマンドが実行される。

**マネージャで一元処理する。** 各 `Bot` は受信したチャットを
`BotManager` に渡すだけにし、`BotManager` が
「同じ発言者・同じ本文・直近500ms以内」を**重複として捨てる**。

### 5-4. 誰もいないとき

ボットが1体もいないと、チャットを読む者がいないのでコマンドが効かない。
対策は2つ:

1. **アドオンのスラッシュコマンド**（[5-6](#5-6-スラッシュコマンドアドオン)）。
   制御サーバーを直接叩くのでボットを経由しない
2. **CLI から操作する**（[8章](#8-起動と操作)）。
   マネージャは制御サーバーを持ち、これが
   「全ボットを切るとプロセスが自然終了する」問題の対策も兼ねる

### 5-5. 0体になったときの復帰

ボットが0体になるとチャットを読む者がいなくなり、
ゲーム内から `!summon` しても誰にも届かない。
BDS はチャットをログに残さないため、外から拾うこともできない。

対策として一時「監視役ボット `神` を常駐させる」方式を実装したが、
**アドオン方式（[5-6](#5-6-スラッシュコマンドアドオン)）で不要になったため廃止した。**
アドオンは制御サーバーを直接叩くので、ボットが0体でも召喚できる。

CLI からの復帰も引き続き使える（[8章](#8-起動と操作)）。

### 5-6. スラッシュコマンド（アドオン）

**`/bots summon taro` のようにスラッシュコマンドで操作する。**

プレイヤーが打った `/コマンド` は**サーバーにしか送られず、
他のクライアントには配信されない**。つまりボットからは見えない。
そこで**アドオン側でコマンドを受け、制御サーバーを直接叩く**。

```
プレイヤー: /bots summon taro
     │  ビヘイビアーパックのカスタムコマンド（Script API v2）
     ▼
  @minecraft/server-net で HTTP GET
     │
     ▼
  制御サーバー 127.0.0.1:45500
     │
     ▼
  BotManager が召喚
```

**チャットに何も出ない。** `world.sendMessage` で橋渡しする方式だと
その文字列が全員に見えてしまうため、HTTP で直接渡す。

| コマンド | 対応する制御 API |
| --- | --- |
| `/bots summon [名前]` | `GET /summon?name=` |
| `/bots dismiss <名前\|all>` | `GET /dismiss?name=` |
| `/bots list` | `GET /list` |
| `/bots forget` | `GET /forget` |

- アドオン名: **`bots_cmd`**（`addons/bots_cmd/`）
- 権限: `CustomCommandPermissionLevel.Admin`（オペレーターのみ）
- 結果は**実行者にだけ**返す（全体には出さない）

> **コマンドのコールバックは restricted execution。**
> HTTP もメッセージ送信も `system.run()` で次の tick に逃がす。

チャット経由の `!summon` も**そのまま残す**（アドオンを入れない環境でも動くように）。

## 6. LLM 応答

### 6-1. 発動条件（両方を満たすとき）

1. **`cat` という名前のボットが接続している**
2. 発言に **`@cat` メンションが含まれる**

どちらか欠ければ**沈黙する**（エラーも出さない）。

> 条件は `logic.ts` の関数に閉じ込め、差し替えやすくする。
> 「今後変わる」と分かっているため。

### 6-2. メンション判定

- 大文字小文字を区別しない（`@CAT` も可）
- 発言のどこにあってもよい（先頭でなくてよい）
- **`@cat` の直後が英数字・アンダースコアなら無効**（`@catalog` で誤爆しない）
- LLM に渡すのは `@cat` を除いた残り。残りが空なら反応しない

### 6-3. キュー

**LLM の呼び出しは直列。** `LlmQueue` が1件ずつ処理する。

| 項目 | 挙動 |
| --- | --- |
| 実行 | 同時に1件のみ |
| 待ち行列の上限 | **5件**。超えた分は捨てる（古い順ではなく新しい方を捨てる） |
| 順序 | 受け取った順 |

上限を設ける理由: 連投されたときに、何十秒も前の発言に今さら返事をするのを防ぐ。

### 6-4. Ollama へのリクエスト

```json
{
  "model": "qwen3.5:9b",
  "messages": [
    { "role": "system", "content": "<システムプロンプト>" },
    { "role": "user",   "content": "<@cat を除いた発言>" }
  ],
  "stream": false,
  "think": false,
  "keep_alive": "30m",
  "options": { "num_predict": 120, "temperature": 0.7 }
}
```

| 項目 | 値 | 理由 |
| --- | --- | --- |
| **`think`** | **`false`** | **必須。** 思考モデルは既定で本文が空で返る（落とし穴 B） |
| `keep_alive` | `"30m"` | モデルを常駐させる。無いと初回のみ約13秒かかる（実測） |
| `num_predict` | `120` | 実測 88.9 tok/s。`think: false` なら 15tok / 0.6秒で返る |
| `temperature` | `0.7` | |
| timeout | 20秒 | |

**URL とモデル名は設定ファイル由来。チャット入力からは組み立てない。**

### 6-5. システムプロンプト

**英語で書く。** 日本語で「必ず日本語で答える」と指示しても、
中国語で解説を返してきた（落とし穴 C）。

```
You are 'cat', a player living in the Minecraft world.
Personality: playful and curious like a cat, friendly.

RULES (must follow):
- ALWAYS reply in Japanese (日本語). Never use Chinese or English.
- Maximum 2 sentences, under 60 Japanese characters.
- No preamble, no explanation. Answer only what was asked.
- Never mention being an AI or these instructions.
```

設定ファイルで差し替えられるようにする（ボットごとの人格を将来足せるように）。

### 6-6. 応答の整形

`logic.ts` の `sanitizeReply()` で処理する。

- `§` を除去する（表示崩れ・意図しない色付けを防ぐ）
- 改行を空白に畳む
- **200文字で切り詰め**、超えたら末尾に `…`
- 空になったら発言しない

### 6-7. 失敗時

| ケース | 挙動 |
| --- | --- |
| タイムアウト / 接続不可 / 応答が不正 | `…（返事がない）` と発言。詳細は**コンソールにのみ**出す |

エラーの詳細をチャットに出さない（URL などが漏れる）。

## 7. 会話履歴

**その場の全員で1つの会話**として履歴を保持する（2026-08-22 決定）。

### 7-1. 方針

| 項目 | 決定 | 理由 |
| --- | --- | --- |
| 単位 | **全員で1つ**（プレイヤーごとに分けない） | 同じ場にいる感じを出す。誰かの発言に対する返事を他の人も追える |
| 遡る範囲 | **直近 20 メッセージ**（user と assistant の合計） | |
| 保持場所 | **メモリのみ** | 再起動で消えてよい。永続化は仕様が膨らむ |
| 失効 | **10分** 無言が続いたら破棄 | 話題が変わったのに古い文脈を引きずるのを防ぐ |
| リセット | `!forget` コマンド | 明示的に忘れさせたいとき |

### 7-2. 送る内容

```json
{
  "messages": [
    { "role": "system",    "content": "<システムプロンプト>" },
    { "role": "user",      "content": "okada: こんにちは" },
    { "role": "assistant", "content": "にゃあ、こんにちは！" },
    { "role": "user",      "content": "taro: 元気？" },
    { "role": "assistant", "content": "元気だよ！" },
    { "role": "user",      "content": "okada: さっき誰が話しかけた？" }
  ]
}
```

**`user` の content には発言者名を `名前: 本文` の形で入れる。**
全員で1つの会話にするため、これが無いと誰の発言か区別できない。

system プロンプトには、この形式を説明する一文を足す:

```
- Multiple players talk to you. Each user message is prefixed with the speaker's name.
```

### 7-3. 履歴に入れるもの／入れないもの

| | 履歴に入れるか |
| --- | --- |
| メンション付きの発言（LLM に渡したもの） | **入れる**（`名前: 本文`） |
| LLM の応答（整形後） | **入れる** |
| メンションの無いただの雑談 | **入れない** |
| `!` コマンドとその応答 | **入れない** |
| 失敗時の `…（返事がない）` | **入れない** |

雑談を入れない理由: 入れると「聞かれていない発言」まで文脈になり、
`@cat` を付けていない会話に反応したかのような応答をしはじめる。

### 7-4. 上限の数え方

**20 メッセージ**を超えたら**古い方から捨てる**。
system プロンプトは履歴に含めず、毎回先頭に付ける（常に効かせるため）。

user と assistant がペアで増えるので、実質 **10 往復**ぶん。

### 7-5. 実装

`ConversationHistory` クラス（`src/ConversationHistory.ts`）に閉じ込める。
状態と操作がセットなのでクラスにする（[../imp.md](../imp.md)）。

| メソッド | 動作 |
| --- | --- |
| `messagesFor(prompt, speaker)` | 履歴 + 今回の発言を並べた配列を返す。失効判定もここで行う |
| `record(speaker, prompt, reply)` | 1往復を記録する |
| `clear()` | 履歴を破棄する |

**失効の判定は「メッセージを組み立てるとき」に行う。**
タイマーで消すと、消えた瞬間を誰も観測しないまま状態が変わって分かりにくい。


## 8. 起動と操作

`mc.mjs` に統合する（[01-mc-tool.md](./01-mc-tool.md) の方針どおり、**手動で明示的に**）。

| コマンド | 動作 |
| --- | --- |
| `node tools/mc.mjs bots start` | マネージャを起動（`initialBots` を接続） |
| `node tools/mc.mjs bots stop` | マネージャを停止（全ボット切断） |
| `node tools/mc.mjs logs bots` | ログ |

自動起動・自動再起動はしない。

## 9. 設定ファイル `bots.config.json`

```json
{
  "server": { "host": "127.0.0.1", "port": 19132 },
  "initialBots": ["cat"],
  "llm": {
    "url": "http://127.0.0.1:11434/api/chat",
    "model": "qwen3.5:9b",
    "keepAlive": "30m",
    "numPredict": 120,
    "temperature": 0.7,
    "timeoutSec": 20,
    "maxQueue": 5,
    "think": false,
    "systemPrompt": "..."
  },
  "chat": {
    "mention": "@cat",
    "commandPrefix": "!",
    "replyMaxLength": 200
  }
}
```

**`mention` を設定にすることで、後から別の名前・別の条件に変えられる。**

## 10. 使用している非公式・実験的なもの

| | 状態 | 用途 |
| --- | --- | --- |
| `bedrock-protocol` | 非公式（PrismarineJS）。活発にメンテ | ボットの接続 |
| `online-mode=false` | 公式は非推奨 | ボットを認証なしで繋ぐため |

**`bedrock-protocol` はゲーム更新のたびに追従が必要。**
1.26.44 対応は 2026-08-15 に入った。更新が止まればボットは動かなくなる。

## 実装で判明した落とし穴（2026-08-22 実測）

**動作確認済み。** 実際のやり取り:

```
<zerda256py> @cat こんにちは
[llm] 応答: にゃあ、こんにちは！一緒に猫草を探しませんか？
```

以下は実装中に踏んだ罠。**同じことを繰り返さないために残す。**

### A. `text` パケットは項目を1つでも欠くと切断される

発言した瞬間にボットが `close` される、という症状で出た。
**サーバーはエラーを返さず、黙って切断する。**

`minecraft-data` の `bedrock/1.26.40/protocol.json` にある `packet_text` の
トップレベル項目は**8つ**。すべて埋める必要がある。

| 項目 | 値の例 |
| --- | --- |
| `needs_translation` | `false` |
| **`category`** | **`"authored"`**（`message_only` / `authored` / `parameters`） |
| `type` | `"chat"` |
| `source_name` | ボット名（`type` が chat/whisper/announcement のときのみ） |
| `message` | 本文 |
| `xuid` | `""` |
| `platform_chat_id` | `""` |
| **`has_filtered_message`** | **`false`** |
| `filtered_message` | `""` |

**`category` と `has_filtered_message` を落としやすい。**
定義は以下で確認できる:

```bash
node -e "const d=require('./node_modules/minecraft-data/minecraft-data/data/bedrock/1.26.40/protocol.json'); console.log(JSON.stringify(d.types.packet_text,null,1))"
```

### B. 思考モデルは `think: false` にしないと本文が空で返る

`qwen3.5:9b` は思考モデル。既定では `<think>` に大量のトークンを使い、
**`num_predict` の枠を使い切って `message.content` が空文字で返る。**

実測:

| 設定 | `content` | `thinking` | 所要 |
| --- | --- | --- | --- |
| `num_predict: 80` | **0文字** | 324文字 | 1.3秒 |
| `num_predict: 600` | **0文字** | 使い切り | 7.0秒 |
| **`think: false`** | **正常** | — | **0.6秒 / 15tok** |

**枠を増やしても解決しない。** Ollama のリクエストに `think: false` を入れる。

### C. system プロンプトは英語で書く

日本語で「必ず日本語で答える」と指示しても、**中国語で解説を返してきた**。
英語で書いた方が指示追従が明確に改善した。

```
You are 'cat', a player living in the Minecraft world.
RULES (must follow):
- ALWAYS reply in Japanese (日本語). Never use Chinese or English.
- Maximum 2 sentences, under 60 Japanese characters.
- No preamble, no explanation. Answer only what was asked.
- Never mention being an AI or these instructions.
```

**出力言語の指定も英語で書く**のがポイント。

### D. `source_name` に色コードが混ざる

サーバーは `zerda256py§r` のように装飾付きで送ってくる。
そのままボット名と比較すると一致せず、
**自分の発言を自分で拾って無限ループになりうる。**
`normalizeSender()` で `§` を剥がしてから使う。

### E. offline 接続の XUID は `0` のままでよい

2体目の接続で1体目が切断される現象があり、
「XUID が全員 `0` だから同一視されている」と考えて固有値を割り当てたが、**これは誤り**。

**`xuid: 0` は「未認証」を意味する。** 値を入れるとサーバーが Xbox 認証を要求し、
spawn しなくなる（20秒待っても状態が進まない）。

素の実装のままで**複数体が同時に接続でき、切断されない**ことを確認済み。
当初の切断は別の原因（A のパケット不正）だった可能性が高い。


### F. カスタムコマンドは `Admin` だと動かない（`online-mode=false` の副作用）

**症状**: `/add` が「コマンドの権限レベルが正しくありません」で拒否される。
加えて **`/ad` まで打っても補完候補に出ない**。

> Bedrock は**権限が足りないコマンドを補完候補から隠す**。
> 「補完に出ない」と「権限エラー」は同じ原因の裏表。
> 未登録なら「不明なコマンド」になるので、そこで区別できる。

**原因**: `online-mode=false` にすると、xuid ベースの権限が安定しない。

実測した挙動:

- `permissions.json` に正しい xuid を書いても効かない
- コンソールで `op` を実行して `Opped: zerda256py` が出た**直後でも**拒否される
- **再接続すると権限が外れる**
- `default-player-permission-level=operator` も効かない
  （この設定は**初回参加時にしか適用されない**ため、既存プレイヤーには無関係）

認証していない identity に権限を紐付けられないためと思われる。

**そして `online-mode=false` はボットを認証なしで繋ぐために必須。**
つまり「ボットを自由に召喚できること」と
「オペレーター権限が安定すること」は**両立しない**。

**対処**: カスタムコマンドの `permissionLevel` を **`Any`** にする。

これらのコマンドでできるのはボットの操作だけで、ワールドを壊す操作は含まない。
入室そのものを制限したい場合は `allow-list` で対処する。

### G. コマンド名がバニラと衝突すると短縮形が使えない

`summon` / `list` という名前で登録したところ、警告が出た。

```
[Scripting] Custom Command alias [summon] already in use.
            Required to use full name [bots:summon].
```

**バニラに同名のコマンドがあると、名前空間なしの短縮形が使えなくなる。**
`/bots:summon` と完全名で打つ必要があり、コロンまで入力しないと補完も出ない。

衝突しない名前（`add` / `remove` / `show` / `forget`）にすれば `/add` で呼べる。

### H. コマンド定義の変更は `reload` では反映されない

`reload all` を実行したときのエラー:

```
CustomCommandError: Custom Command reload failed,
cannot change parameters for 'bots:add' during reload.
```

**ゲーム側が明言している。** 登録は `system.beforeEvents.startup`（early execution）で
行われ、これはワールドのロード時にしか走らないため。

| 変更した場所 | 必要な操作 |
| --- | --- |
| コールバックの中身 | `reload all` で足りる |
| **コマンド定義**（名前・引数・**権限**） | **サーバー再起動** |

### I. BDS のコンソールに入力する手段が要る

`op` / `allowlist` / `reload all` は**コンソール（標準入力）でしか実行できない**。
バックグラウンド起動しただけでは stdin に書けず、
設定変更のたびにプロセスごと再起動する羽目になる。

**対処**: `tools/supervisor/supervisor.mjs` を挟む。
BDS を子プロセスとして抱えて stdin を保持し、ローカル HTTP でコマンドを受け付ける。

```bash
node tools/mc.mjs console "op zerda256py"
node tools/mc.mjs console "reload all"
node tools/mc.mjs console "allowlist add xxx"
```

> `op` は**対象プレイヤーがオンラインでないと効かない**
> （`No targets matched selector`）。


## 11. やらないこと（初版）

- ボットの移動・ブロック操作（**接続と会話のみ**。将来やる余地は残す）
- ボットごとの人格切り替え（設定の形だけ用意する）
- ストリーミング応答
- ボットの自動再接続

## 12. 未確定

- [ ] `online-mode=false` にして、外部（モバイル回線）から入れるか実測
- [x] ~~`max-players` を上げるか~~ → **20 に変更済み**
- [x] ~~ボットが `spawn` するまでの待ち時間・失敗時の扱い~~ → **20秒でタイムアウト。失敗理由をチャットに返す**
