# 仕様: 統合管理ツール `tools/mc.mjs`

> 作成日: 2026-08-22
> 目的: BDS と bedrock-portal の起動・停止・配置を、ひとつの入口から**手動で明示的に**行う

## 0. 方針

- **自動起動しない。** すべて人間が明示的にコマンドを打って動かす。
  常駐監視・自動再起動・スケジュール実行は**やらない**。
- サーバー本体（`bedrock_server.exe` は 219MB）は**リポジトリの外**に置く。
  ツールは設定ファイル経由で場所を参照するだけ。
- 状態（PID）はファイルで持つ。ツールを終了してもサーバーは動き続ける。

## 1. 構成

```
tools/
├── mc.mjs              統合 CLI（これを叩く）
├── mc.config.json      サーバー定義。パス・ポートなど
├── supervisor/         BDS を抱えて stdin を保持する監督プロセス
├── portal/             bedrock-portal 用の独立した npm プロジェクト
├── bots/               偽プレイヤー + LLM（仕様は 02-llm-chat.md）
└── .state/             PID・ログ（git 管理外）
```

### mc.config.json

```json
{
  "servers": {
    "dev": { "dir": "C:\MinecraftServer\1.26.44.3", "port": 19132 }
  }
}
```

`dir` は BDS を展開したフォルダ。実際の設定は各 BDS の `server.properties` が正で、
ツールは必要に応じてそこから読む。

## 2. コマンド

```
node tools/mc.mjs <command> [args]
```

| コマンド | 動作 |
| --- | --- |
| `status` | 全サーバーの稼働状況（PID・ポート・ワールド・稼働時間） |
| `start <server>` | BDS を起動（バックグラウンド。ログはファイルへ） |
| `stop <server>` | BDS を停止 |
| `restart <server>` | 停止 → 起動 |
| `logs <server\|portal\|bots> [-n N]` | 直近 N 行のログ（既定 40） |
| `console "<コマンド>"` | **BDS のコンソールに送る**（`op` / `reload all` / `allowlist`） |
| `deploy <addon> [--server <s>]` | アドオンをビルドして配置し、ワールドへの適用定義も書く |
| `worlds [--server <s>]` | BDS 側のワールド一覧 |
| `client-worlds` | **クライアント側のワールド一覧**（不可読なフォルダ名を解決して表示） |
| `import-world <id> [--as <name>] [--server <s>]` | クライアントのワールドを BDS に取り込む |
| `use-world <name> [--server <s>]` | `level-name` を切り替える |
| `add-server <name> --port <p>` | 新しいサーバーインスタンスを作る |
| `portal start` / `portal stop` | bedrock-portal の起動・停止 |
| `bots start` / `bots stop` | 偽プレイヤー管理ツールの起動・停止 |
| `bots summon [名前]` / `bots dismiss <名前\|all>` | ボットの操作（0体でも使える） |
| `bots list` / `bots forget` | 一覧 / LLM の会話履歴を破棄 |

`--server` 省略時は `mc.config.json` の最初のサーバー。

## 3. ワールドについて

### 3-1. BDS はワールドを生成するが、種類は選べない

`level-name` に指定した名前のワールドが `worlds/` に無ければ、**その名前で新規生成される**。
同梱ドキュメントの `level-name` の説明:

> The name of level to be used/**generated**. Each level has its own folder in `/worlds`.

起動ログにも `CREATING VANILLA WORLD` と出る。

**ただし生成タイプは指定できない。** 同梱 `bedrock_server_how_to.html` が列挙する
**全42プロパティ**を確認したが、`level-type` / `generator-settings` に相当するものは無い。
ワールドに関して指定できるのは以下だけ:

| プロパティ | 内容 |
| --- | --- |
| `level-name` | ワールド名。無ければその名前で生成される |
| `level-seed` | シード値。空ならランダム |

つまり **BDS が生成できるのは常に通常世界のみ。スーパーフラットは作れない。**

### 3-2. スーパーフラットを使う手順

**クライアントで作って持ち込む。これが唯一の方法。**

1. Minecraft クライアントで新しいワールドを作る
   - 「フラットワールド」を ON
   - クリエイティブ、チート ON（`/reload` に必要）
   - 一度ワールドに入って抜ける（フォルダが確定する）
2. `node tools/mc.mjs client-worlds`
   → フォルダ ID と実際のワールド名の対応が出る
3. `node tools/mc.mjs import-world <id> --as flatworld`
4. `node tools/mc.mjs use-world flatworld`
5. `node tools/mc.mjs restart dev`

クライアントのワールドは
`%appdata%\Minecraft Bedrock\Users\<XboxユーザーID>\games\com.mojang\minecraftWorlds\`
にあり、**フォルダ名は `Crugh+t31-4=` のような不可読な文字列**。
実際の名前は各フォルダ内の `levelname.txt` に入っている。
`client-worlds` はこれを解決して一覧にする。

`import-world` がやること:

- **対象サーバーが停止していることを確認**（起動中なら中断する）
- クライアントのワールドフォルダを `<BDS>/worlds/<name>/` にコピー
- `levelname.txt` を `<name>` に書き換え
- 既に同名があれば中断（上書きしない）

### 3-3. 別のサーバーを立てる

**1つの BDS インスタンスで同時に動かせるワールドは1つだけ**（`level-name` で選ぶ）。
複数のワールドを同時に動かすなら、BDS インスタンス自体を複数用意する。

`add-server <name> --port <p>` がやること:

1. 既存インスタンスのフォルダを複製（`worlds/`・ログ・PID は除く）
2. `server.properties` を書き換え
   - `server-port=<p>` / `server-portv6=<p+1>`
   - **`enable-lan-visibility=false`**（下記）
   - `level-name=<name>` / `server-name=<name>`
3. `mc.config.json` に追記

> #### 落とし穴: `enable-lan-visibility`
>
> 既定 `true`。`transport=raknet` のとき、**`server-port` に別の値を設定していても
> 既定ポート 19132/19133 にもバインドする**（LAN 検出に応答するため）。
> 2台目以降で `true` のままだとポート衝突で起動に失敗する。
>
> 同梱ドキュメントにも明記:
> > Consider turning this off if LAN discovery is not desirable, or
> > **when running multiple servers on the same host may lead to port conflicts.**

## 4. deploy の動作

1. `addons/<addon>/` で `npm run build`
2. `<BDS>/development_behavior_packs/<addon>/` に BP + `dist/scripts` を配置
3. `<BDS>/development_resource_packs/<addon>/` に RP を配置
4. `<BDS>/worlds/<level-name>/world_behavior_packs.json` に BP の UUID を登録
   （既存エントリがあれば version を更新、無ければ追記）
5. `world_resource_packs.json` も同様

サーバー起動中でも配置自体はできるが、反映には `/reload` か再起動が必要。
判断基準は [../research/02-hot-reload.md](../research/02-hot-reload.md)。

> なお、全ワールドへ横断適用する `system_behavior_packs` / `system_resource_packs`
> というフォルダも BDS には存在する（自動生成されない）。ただし UUID が保護され、
> 同じ ID の他パックがロード失敗する副作用があるため、**本ツールでは使わない。**

## 5. BDS のコンソール操作（監督プロセス）

`op` / `allowlist` / `reload all` などは、**BDS のコンソール（標準入力）でしか実行できない**。
バックグラウンド起動しただけでは stdin に書けないため、
`tools/supervisor/supervisor.mjs` を間に挟む。

```
mc.mjs console "op xxx"
   │  HTTP GET /command?cmd=...
   ▼
supervisor.mjs  ── stdin ──▶ bedrock_server.exe
   │  （BDS を子プロセスとして抱え、stdin を保持する）
   ▼
結果は BDS の標準出力 → ログへ
```

- `mc.mjs start` は BDS を**直接ではなく監督プロセス経由で**起動する
- 制御ポートは `mc.config.json` の `controlPort`（既定 45600）
- **`127.0.0.1` にのみ bind する**
- 停止時は BDS に `stop` を送って正常終了させる（ワールドの破損を避けるため）

```bash
node tools/mc.mjs console "op zerda256py"
node tools/mc.mjs console "reload all"
node tools/mc.mjs console "allowlist add xxx"
```

> **`op` は対象プレイヤーがオンラインでないと効かない**（`No targets matched selector`）。

### reload と restart の使い分け

| 変更した場所 | 必要な操作 |
| --- | --- |
| スクリプトのコールバックの中身 | `console "reload all"` |
| **コマンド定義**（名前・引数・権限）／ JSON ／ manifest | `restart` |

判断基準の詳細は [../research/02-hot-reload.md](../research/02-hot-reload.md)。

## 6. portal の動作

`portal start` は `tools/portal/portal.mjs` を別プロセスで起動する。

- 初回は **Xbox Live のデバイスコード認証**が必要。
  コンソールに出る URL とコードを人間がブラウザで入力する。
- トークンは `tools/portal/.auth/` にキャッシュ（**git 管理外**）
- 設定は `tools/portal/portal.config.json`

**`joinability` は `FriendsOnly`。**

bedrock-portal 自体の既定は `FriendsOfFriends`（フレンドのフレンドまで参加可）だが、
範囲を広げすぎないよう `FriendsOnly` にしている。

| 値 | 挙動 |
| --- | --- |
| `InviteOnly` | 招待した人だけ。**フレンド欄には出ない** |
| `FriendsOnly` | 認証アカウントのフレンドが、招待なしで参加・閲覧できる（**現在の設定**） |
| `FriendsOfFriends` | フレンド + フレンドのフレンド |

> **フレンド欄に出すには `InviteOnly` では不可。** 最低でも `FriendsOnly` が要る。

### 誰のフレンド欄に出るのか（重要）

セッションは**認証したアカウントがホスト**になる。したがって:

- **表示されるのは「認証したアカウントのフレンド」の画面**
- **ホスト本人のフレンド欄には出ない**（自分は自分のフレンドではないため）

同一アカウントで portal を動かしつつ自分でも参加を確認したい場合は、
別アカウントで portal を動かす（本来の想定用法）か、
フレンドに見えているか確認してもらう必要がある。

`peers` オプションで、ホスト以外のアカウントを追加でセッションに接続させることもできる。

### フレンド欄に出すための前提（相互フレンド）

セッションは**認証したアカウントがホスト**になる。
`zerda256py` のフレンド欄に出すには:

1. **portal は `zerda256py` とは別のアカウントで認証する**
   （本人で動かすと、自分は自分のフレンドではないので自分の欄には出ない）
2. **その別アカウントと `zerda256py` が相互フレンドである**こと

2 を自動化するため `AutoFriendAccept` モジュールを使う。
`zerda256py` から portal アカウントへフレンド申請を送れば、自動で承認される。

**許可リスト方式**にしてある。`portal.config.json` の `autoFriendAccept.allow` に
載せた gamertag 以外は承認しない（誰彼構わず承認しないため）。

```json
"autoFriendAccept": {
  "enabled": true,
  "allow": ["zerda256py"],
  "inviteOnAdd": true
}
```

`inviteOnAdd: true` は、フレンドになった時点でセッションへ招待も送る。

### 手順

1. portal 用の Microsoft アカウントを用意する（`zerda256py` とは別のもの）
2. `node tools/mc.mjs portal start`
3. `node tools/mc.mjs logs portal` に出る URL とコードで、**portal 用アカウント**を認証
4. ログに出るホストの gamertag を確認する
5. `zerda256py` から、その gamertag にフレンド申請を送る
6. 自動承認される（ログに記録が出る）
7. `zerda256py` のフレンド欄に **`LLM実験場`** が現れる


## 7. やらないこと

- サーバーの自動起動・自動再起動・死活監視
- ワールドの自動バックアップ（必要になったら別途仕様を書く）
- 複数サーバーの一括起動（明示性を優先し1つずつ指定させる）
- `system_behavior_packs` の利用
