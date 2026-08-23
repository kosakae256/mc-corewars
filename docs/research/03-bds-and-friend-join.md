# 調査: BDS と、フレンド欄からの参加（bedrock-portal）

> 調査日: 2026-08-22 / 対象: Minecraft BE 1.26.40 / BDS
> 前提: 「ワールドがフレンド欄に出て、そこから参加できる」形にしたい

## 0. 決定事項

| 項目 | 決定 |
| --- | --- |
| 実行基盤 | **BDS（Bedrock Dedicated Server）を選択肢として採用する** |
| 参加方法 | **`bedrock-portal` で Xbox Live セッションを立て、フレンド欄から参加させる** |
| 使用アカウント | **okada さん本人のアカウントを使う**（下記リスクは了承済み） |

これにより `@minecraft/server-net`（外部 HTTP 通信）と `@minecraft/server-admin`
が使えるようになり、作れるものの幅が広がる。ただし両方とも experimental。

---

## 1. なぜ BDS が要るのか

通常のクライアント配布アドオンでは**外部との通信ができない**。
`@minecraft/server-net` / `@minecraft/server-admin` は **BDS 限定**で、
Realms でも使えない（公式に明記あり）。

> This article only applies to Bedrock Dedicated Server. You cannot use these
> experimental script APIs on gameplay servers provided as part of Minecraft Realms.
> — `Documents/BedrockServer/scripting.md`

外部サービス連携を含む構想を採るなら、BDS 一択になる。

---

## 2. BDS の基本

出典: `reference/minecraft-creator-docs/creator/Documents/BedrockServer/`

### 導入

- https://www.minecraft.net/download/server/bedrock から zip を取得し、空フォルダに展開
- Windows: `bedrock_server` を実行 / Linux(Ubuntu のみ公式対応): `LD_LIBRARY_PATH=. ./bedrock_server`
- 初回起動で `worlds/` `behavior_packs/` `resource_packs/` `config/` が生成される

### パックの置き場所

| 場所 | スコープ |
| --- | --- |
| `worlds/<level-name>/behavior_packs/` | そのワールドのみ |
| `<BDSルート>/behavior_packs/` | サーバー上の全ワールド |

### 既存ワールドの持ち込み

1. `%appdata%\Minecraft Bedrock\users\<user id>\games\com.mojang\minecraftWorlds\` 配下の
   ワールドフォルダをコピー（フォルダ名は `eplC8tYRD04=` のような不可読な文字列。
   中の `levelname.txt` で判別する）
2. BDS の `worlds/` に置き、分かりやすい名前にリネーム
3. `server.properties` の `level-name` をそのフォルダ名と**完全一致**させる（大文字小文字も）

### スクリプトモジュールの許可（重要）

**BDS では、使えるモジュールが `config/` で明示的に制限される。**
`@minecraft/server-net` は既定の許可リストに**入っていない**。

`config/default/permissions.json` の初期値:

```json
{
  "allowed_modules": [
    "@minecraft/server-gametest",
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-admin",
    "@minecraft/server-editor"
  ]
}
```

`server-net` を使うには、**スクリプトモジュールの UUID 名のフォルダ**を
`config/` 直下に作り、そこに `permissions.json` を置いて許可を足す。

```
config/
├── default/
│   └── permissions.json          ← 最小限に保つことが公式推奨
└── <manifest の script モジュール UUID>/
    ├── permissions.json          ← ここで @minecraft/server-net を許可
    ├── variables.json            ← 管理者が変更できる設定値
    └── secrets.json              ← 認証トークン等。参照できる文脈が限定される
```

`variables.json` / `secrets.json` は `@minecraft/server-admin` の
`variables.get()` / `secrets.get()` で読む。secrets は `@minecraft/server-net` の
`HttpHeader` など特定の文脈でのみ解決される。

### デバッグ

`server.properties` で明示的に有効化が必要:

| プロパティ | 意味 |
| --- | --- |
| `allow-outbound-script-debugging` | `/script debugger connect` を許可（既定 false） |
| `allow-inbound-script-debugging` | `/script debugger listen` を許可（既定 false） |
| `force-inbound-debug-port` | inbound のポートを固定 |

BDS 側で `/script debugger listen 19144` → VS Code の `launch.json` を
`"mode": "connect"` にして接続する（クライアント接続時と向きが逆）。

---

## 2.5. 実機検証の結果（2026-08-22）

**BDS 1.26.44.3 に `hello` アドオンを載せ、同一 PC のクライアントから接続して動作確認済み。**

| 項目 | 結果 |
| --- | --- |
| BDS バージョン | **1.26.44.3**（クライアント 1.26.4403.0 と一致） |
| インストール先 | `C:\MinecraftServer\1.26.44.3` |
| アドオンの読み込み | OK — `Pack Stack - [00] hello BP (id: a3ae68fa-…) @ development_behavior_packs/hello` |
| Script API v2 の実行 | **OK** — `worldLoad` → `system.runInterval` が動作し、チャットに `tick:` が出た |
| `127.0.0.1:19132` からの接続 | OK |
| **ループバック免除** | **不要だった**（下記） |

### ループバック免除は不要になっている

公式ドキュメント（`Documents/BedrockServer/getting-started.md`）は
同一マシンからの接続に `CheckNetIsolation.exe LoopbackExempt` が必要と書いているが、
**1.26.44 のクライアントでは登録なしで接続できた**（`CheckNetIsolation LoopbackExempt -s` で
Minecraft 関連の登録が無いことを確認済み）。

GDK 移行でクライアントが UWP の AppContainer 制約から外れたためと考えられる。
**公式ドキュメントのこの記述は古い。**

なお `CheckNetIsolation LoopbackExempt -a` は管理者権限が必要で、
非管理者だとエラー 1337 になる。必要になった場合は管理者 PowerShell から:

```powershell
CheckNetIsolation.exe LoopbackExempt -a -p=S-1-15-2-1958404141-86561845-1752920682-3514627264-368642714-62675701-733520436
```

### 開発用に変更した server.properties

`server.properties.orig` に初期状態を退避してある。

| キー | 値 | 理由 |
| --- | --- | --- |
| `level-name` | `devworld` | |
| `gamemode` | `creative` | |
| `difficulty` | `peaceful` | |
| `allow-cheats` | **`true`** | **`/reload` に必須** |
| `allow-list` | `false` | 検証中のみ。公開時は `true` に戻すこと |
| `allow-outbound-script-debugging` | `true` | `/script debugger connect` 用 |
| `allow-inbound-script-debugging` | `true` | `/script debugger listen` 用 |
| `content-log-file-enabled` | `true` | |
| `server-name` | `mcapp-dev` | |

### ワールドへのパック適用

BDS には `development_behavior_packs/` / `development_resource_packs/` も生成される。
そこにパックを置いたうえで、**ワールド側に適用定義を書く必要がある**。

`worlds/<level-name>/world_behavior_packs.json`:

```json
[
  { "pack_id": "<BP header の uuid>", "version": [1, 0, 0] }
]
```

`world_resource_packs.json` も同形式。これが無いとパックは読み込まれない。

### 既定の許可モジュール（実測）

公式ドキュメントの記載は5個だが、**1.26.44.3 の実物は6個**で
`@minecraft/debug-utilities` が追加されている。

```json
{
  "allowed_modules": [
    "@minecraft/server-gametest",
    "@minecraft/server",
    "@minecraft/server-ui",
    "@minecraft/server-admin",
    "@minecraft/server-editor",
    "@minecraft/debug-utilities"
  ]
}
```

**`@minecraft/server-net` が入っていない**点は公式の記載どおり。使うには
`config/<スクリプトモジュールUUID>/permissions.json` で明示的に許可する。

### サーバーの起動・停止

```powershell
cd C:\MinecraftServer\1.26.44.3
.\bedrock_server.exe          # コンソールで対話。stop で停止
```

---

## 3. フレンド欄からの参加

### 3-1. 公式の方法では実現できない

BDS への公式な接続方法は、クライアントの**「サーバー」タブに IP を手動追加**する方式
（`127.0.0.1:19132` 等）。これは「フレンド欄に出る」のとは別物。

### 3-2. FriendConnect は終了している

かつて使われていた [jrcarl624/FriendConnect](https://github.com/jrcarl624/FriendConnect) は、
**実質メンテナンス終了**。

- 機能的な最終コミットは 2025-01
- 2025-11-11 の最終コミットは「メンテされている代替への誘導を README に足す」だけ
- issue に 2024 年から「not working on: new version」「Doesent work with latest version」が未解決で残る

README 本人談:

> **NOTICE**
> [Use this actively maintained project that was inspired by this project](https://github.com/LucienHH/bedrock-portal)

### 3-3. 後継: bedrock-portal（これを使う）

[LucienHH/bedrock-portal](https://github.com/LucienHH/bedrock-portal) — npm: `bedrock-portal`

> Handles and creates a Minecraft Bedrock game session which will redirect
> players to the specified server

**バージョン追従が速い。**

| リリース | 日付 | 内容 |
| --- | --- | --- |
| 2.5.0 | 2026-08-06 | **Support v1.26.40** |
| 2.4.0 | 2026-06-17 | Support v1.26.30 |
| 2.3.0 | 2026-05-13 | Support v1.26.20 |

ゲーム本体の 1.26.40 stable が 2026-08-03、対応が 2026-08-06。**3日で追従**している。

#### 仕組み

Xbox Live 上に「参加可能なゲームセッション」を作り、
参加してきたプレイヤーを指定した BDS へリダイレクトする。
クライアントから見ると**フレンドがワールドを開いているように見える**。

認証は `prismarine-auth` の Authflow 経由。

#### 最小構成

```js
const { BedrockPortal, Joinability } = require('bedrock-portal')

const portal = new BedrockPortal({
  ip: '<BDS のアドレス>',
  port: 19132,
  joinability: Joinability.FriendsOfFriends,
  world: {
    hostName: '<フレンド欄に出るホスト名>',
    name: '<ワールド名>',
    version: '1.26.40',
    memberCount: 1,
    maxMemberCount: 10,
  },
})

await portal.start()
```

`world` の各値は**フレンド欄のカードの見た目にしか影響しない**（実際の接続先は `ip`/`port`）。

#### Joinability

| 値 | 挙動 |
| --- | --- |
| `InviteOnly` | 招待した人だけ |
| `FriendsOnly` | 認証アカウントのフレンドのみ |
| `FriendsOfFriends` | フレンド + フレンドのフレンド（**既定**） |

#### モジュール（`portal.use(...)`）

| モジュール | 用途 |
| --- | --- |
| `AutoFriendAdd` | フレンド申請を自動承認し、条件を満たさない相手を自動削除。`inviteOnAdd` で追加時に招待 |
| `AutoFriendAccept` | フレンド申請の自動承認 |
| `InviteOnMessage` | 特定のメッセージ（既定 `invite`）を受けたら招待 |
| `ServerFormList` | 単一リダイレクトでなく、サーバー選択メニューを出す |
| `RedirectFromRealm` | Realm に来た人を招待する |
| `UpdateMemberCount` | 表示人数を定期更新 |

#### イベント

`sessionCreated` / `sessionUpdated` / `playerJoin` / `playerLeave` /
`friendAdded` / `friendRemoved` / `messageReceived` / `rtaEvent`

**リスナーは `portal.start()` より前に登録すること**（例に明記あり）。

---

### 3-4. 実機検証の結果（2026-08-22）

**外部ネットワーク（モバイル回線）のスマホから、フレンド欄経由で接続成功。**

```
スマホ（モバイル回線）
  └─ フレンド欄「LLM実験場」
      └─ Xbox Live セッション（bedrock-portal / ホスト: zerda256py）
          └─ transfer → 194.193.106.203:19132
              └─ Buffalo ポート変換 → 192.168.1.37
                  └─ TP-Link ポート転送 → 192.168.0.100
                      └─ BDS 1.26.44.3
```

#### 判明したこと（重要）

**bedrock-portal は「中継」ではなく「転送」。**
ソース（`dist/index.js`）を見ると、クライアントに `transfer` パケットを送っている:

```js
client.write('transfer', {
  server_address: this.options.ip,
  port: this.options.port,
});
```

つまり:

1. クライアントは Xbox の WebRTC 経由で portal のセッションに入る（**ここは NAT を越えられる**）
2. portal が「この住所に繋ぎ直せ」と指示する
3. **クライアントは自力でその住所へ接続する**

→ **BDS 本体が外部から到達可能でなければならない。**
`ip` に `127.0.0.1` や LAN IP を入れると、同一ネットワーク外からは繋がらない。

**`transport=nethernet` は NAT 問題を解決しない。**
BDS の同梱ドキュメントによると、これは
「`server-port` で HTTP シグナリングを受けてから UDP をネゴシエートする」方式で、
結局 `server-port` への到達性が必要。Xbox のリレーを経由するわけではない。

**ホストは本人アカウントでよい。**
当初「自分は自分のフレンドではないので本人アカウントでは自分の欄に出ない」と想定したが、
**実際には `zerda256py` 本人で認証しても、本人のフレンド欄に表示された。**

#### ネットワーク構成（この環境）

NAT が2段だったため、**ポート転送も2箇所**必要だった。

```
PC 192.168.0.100
  └─ hop1 192.168.0.1     TP-Link   （NAT 1段目）
      └─ hop2 192.168.1.1  Buffalo   （NAT 2段目・WAN がグローバル）
          └─ hop3 194.193.106.254    ここから先は公開
```

`tracert -d 8.8.8.8` の最初の数ホップを見れば、NAT が何段あるかすぐ分かる。
**プライベートアドレスのホップの数 = NAT の段数。**

| 機器 | 設定 | 値 |
| --- | --- | --- |
| Buffalo (`192.168.1.1`) | ポート変換 | UDP `19132` → `192.168.1.37:19132` |
| TP-Link (`192.168.0.1`) | ポート転送 | UDP `19132` → `192.168.0.100:19132` |
| TP-Link | アドレス予約 | MAC `9C-6B-00-E3-40-F6` → `192.168.0.100` |

**プロトコルは UDP。** Bedrock は RakNet（UDP）を使う。TCP では通らない。

#### 到達性の確認方法

ルーター設定後、実際に外から届くかは外部サービスで検査できる。

```bash
curl -s "https://api.mcsrvstat.us/bedrock/3/<グローバルIP>:19132"
```

`online: true` と `version` / `motd` が返れば成功。


## 4. リスクと制約（了承済み）

- **非公式な手法**。Mojang / Microsoft とは無関係。作者の README にも明記:
  > This package is not meant to be used with your main account. It is meant to be
  > used with alt accounts. If you use this package with your main account,
  > you may be banned from the XSAPI.

  → **本プロジェクトでは、この警告を承知のうえで本人アカウントを使う**（2026-08-22 決定）。

- **ゲーム更新のたびに追従が必要**。現状は数日で追従しているが、これは作者の
  継続的なメンテナンスに依存している。FriendConnect はまさにこれが止まって終了した。
  **bedrock-portal が止まったら、この参加方式は使えなくなる**という前提で設計する。

- `@minecraft/server-net` / `@minecraft/server-admin` は **experimental**。
  「Beta APIs」実験トグルが必要で、予告なく壊れうる。

- BDS はクライアントとの**プロトコルバージョンが一致していないと接続できない**。
  マイナーバージョンだけでなくパッチバージョンでも変わりうる
  （1.21.0 と 1.21.30 も非互換）。BDS とクライアントを揃えて上げる運用が要る。

---

## 5. 未確定 / 次にやること

- [x] ~~BDS を実際に導入し、`hello` アドオンを載せて接続確認する~~ → **完了 (2026-08-22)。2.5 参照**
- [x] ~~`bedrock-portal` を動かし、フレンド欄に出ること・参加できることを確認する~~ → **完了 (2026-08-22)。3-4 参照**
- [ ] `@minecraft/server-net` を `config/<UUID>/permissions.json` で許可し、
      外部 HTTP が通ることを確認する
- [x] ~~同一マシン構成にするか、BDS を別マシン／別環境に置くかを決める~~ → **同一マシン。ポート開放で外部公開**
- [ ] 何を作るかは未確定。BDS + 外部通信という選択肢が開いた状態
