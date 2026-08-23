# 調査: BDS を使わず、通常ワールド（クライアントホスト）にボットを繋ぐ

> 調査日: 2026-08-22 / 対象: Minecraft BE 1.26.44
> 結論: **繋げる。** BDS は必須ではない

## 0. 結論

**クライアントが開いた通常のワールドに、外部プログラムから
「プレイヤーとして」接続できる。アドオンは不要。**

| トランスポート | 用途 | ポート |
| --- | --- | --- |
| **RakNet** | BDS（専用サーバー） | UDP 19132 |
| **NetherNet**（WebRTC） | **LAN・Xbox Live セッション = 通常ワールド** | UDP 7551 |

Minecraft クライアントは、ワールドを開いている間 **UDP 7551 で待ち受けている**
（実測: `Minecraft.Windows` が `7551` を LISTEN）。
これは LAN 公開のための機能で、ゲーム本体に組み込まれている。

> **以前の記述は誤り。** 本ドキュメント作成前、
> 「クライアントのワールドには外部から接続できない」と複数回述べたが、
> これは NetherNet を見落としていたための誤りだった。

## 1. 到達したところ

| 段階 | 状態 |
| --- | --- |
| LAN 上のワールドを検出 | **成功** |
| WebRTC 接続の確立 | **成功** |
| Minecraft パケットの送受信 | **成功** |
| Xbox Live 認証 | **成功** |
| ワールドへの参加 | **アカウント重複で失敗**（下記） |

最後は `server_id_conflict` = **ホストと同じアカウントで入ろうとした**ため。
プロトコル上の問題ではない。**別アカウントを使えば参加できる。**

エラーの変遷がそのまま進捗を示している:

```
（応答なし）  → 0xfe を外す
not_authenticated → Xbox Live 認証を通す
server_id_conflict → 別アカウントが必要  ← いまここ
```

## 2. 使うもの

| | |
| --- | --- |
| [`nethernet`](https://github.com/PrismarineJS/node-nethernet) | NetherNet のトランスポート層。**0.1.0 / WIP** |
| `bedrock-protocol` | Minecraft のパケット層。3.58.2 |
| `prismarine-auth` | Xbox Live 認証 |
| `node-datachannel` | WebRTC（`nethernet` の依存） |

**両者を繋ぐ統合は存在しない。** アダプタを自作する。

## 3. 手順

### 3-1. ワールドを検出する

```js
const { Client } = require("nethernet");
const scout = new Client(0n);           // 0n = 探索のみ
scout.on("pong", (params) => {
  params.sender_id;                     // 接続先の networkId
  Buffer.from(String(params.data), "hex"); // 広告データ
});
scout.sendDiscoveryRequest();           // 定期的に呼ぶ
```

広告データは長さ接頭辞つきの文字列が並ぶ:

```
\x06 \n zerda256py \t SUSURU TV ... 8aba1fa20ff34c6e
     ^ホスト名        ^ワールド名      ^セッションID
```

### 3-2. `bedrock-protocol` のトランスポートを差し替える

`client.js` は接続のたびに `require('./rak')(options.raknetBackend)` を呼ぶ。
**このファクトリを包めば、正規の経路で差し替えられる。**

```js
const rakPath = require.resolve("bedrock-protocol/src/rak");
const original = require(rakPath);
require.cache[rakPath].exports = (backend) =>
  backend === "nethernet"
    ? { RakClient: NetherNetRakAdapter, RakServer: class {}, RakTimeout: class extends Error {} }
    : original(backend);

// bedrock-protocol は「この後で」require する
const bedrock = require("bedrock-protocol");
bedrock.createClient({ ..., raknetBackend: "nethernet" });
```

> **`require.cache` を後から差し替えるのは駄目。**
> `bedrock-protocol` を先に読むと `createClient.js` が
> `RakClient` を束縛済みで効かない（実測）。

アダプタが実装するのは4つだけ:

| メソッド / コールバック | 対応 |
| --- | --- |
| `connect()` | `nn.connect()` |
| `close()` | `nn.close()` |
| `sendReliable(buf)` | `nn.send(buf)` |
| `onConnected` / `onCloseConnection` / `onEncapsulated` | イベントから呼ぶ |

## 4. 踏んだ罠（全部で7つ）

### A. `nethernet` のイベント名

**`connected` / `disconnect`**。`connect` / `close` ではない。
間違えると WebRTC が繋がっても `onConnected` が呼ばれず、
`bedrock-protocol` が `Connect timed out` になる。

### B. `connect()` は探索をしない

`nethernet` の `connect()` は `createOffer()` を呼ぶだけ。
**相手のアドレスを知るには `sendDiscoveryRequest()` を回し続ける必要がある。**
アダプタの `connect()` の中で定期送信を始め、接続確立で止める。

### C. NetherNet はパケットをバッチ化しない

**これが最大の関門。** RakNet は複数パケットを `0xfe` で始まる
バッチにまとめるが、**NetherNet は1パケットずつ送る**
（[df-mc/nethernet-spec](https://github.com/df-mc/nethernet-spec)）。

`0xfe` を付けたままだとゲームは**何も返さない**（エラーも出ない）。

```js
client.batchHeader = 0;   // これで送受信とも 0xfe を扱わなくなる
```

### D. 圧縮ヘッダが先頭に来る

`network_settings` を受け取った後は、**各メッセージの先頭に
圧縮アルゴリズムの1バイト**が付く（`0xff` = 非圧縮）。
RakNet では `0xfe` の後ろに来るが、NetherNet では先頭。

```js
if (client.features?.compressorInHeader && client.compressionReady) {
  buf = Framer.decompress(buf[0], buf.subarray(1));
}
```

### E. `Buffer.from(x.buffer)` が別物を返す

`bedrock-protocol` の `onEncapsulated` はこう書かれている:

```js
const buffer = Buffer.from(encapsulated.buffer)
```

**`.buffer` は ArrayBuffer 全体を指す。**
13 バイトのつもりが 8192 バイトの共有領域が丸ごと渡り、
まったく別のデータ（RakNet のマジックバイト等）を読んでしまう。

アダプタ側で**ぴったりの ArrayBuffer に包んで渡す**:

```js
const exact = new Uint8Array(b.length);
exact.set(b);
this.onEncapsulated({ buffer: exact.buffer, length: b.length }, "nethernet");
```

### F. `Framer.decode` は必ず1バイト捨てる

`batchHeader` の有無に関係なく `buf.slice(1)` する実装になっている。
ヘッダ無しだとパケット長 varint の先頭が削られる。
**`client.handle` を差し替えて自前でフレーム分解する。**

### G. 認証は接続と分けて行う

`createClient` に `onMsaCode` を渡す方式だと、
**認証完了前にプロセスが終わってトークンが保存されない**ことがある。

**認証だけを行うスクリプトを先に流す**のが確実。

```js
const keyPair = crypto.generateKeyPairSync("ec", { namedCurve: "secp384r1" });
const clientX509 = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

const flow = new Authflow("nnbot", "./.auth", {
  flow: "live",
  authTitle: Titles.MinecraftNintendoSwitch,  // live フローには必須
  deviceType: "Nintendo",
}, (data) => { /* デバイスコードを表示 */ });

await flow.getMinecraftBedrockToken(clientX509);   // 完了を待つ
```

- `getMinecraftBedrockToken` には **ECDH の公開鍵が必要**
- `flow: "live"` には **`authTitle` が必須**
- 後で `createClient` に渡す `authflow` も**同じ設定**にする（違うとキャッシュを使わない）

### H. ライブラリのバグ: 空の discovery_message で落ちる

`SignalStructure.fromString` が `BigInt(undefined)` で例外を投げる。
接続開始直後に長さ0のメッセージが来るため、必ず踏む。

```js
const orig = nn.handleMessage.bind(nn);
nn.handleMessage = (packet) => {
  const data = packet?.params?.data;
  if (typeof data !== "string" || data.trim().length === 0) return;
  if (data === "Ping") return;
  return orig(packet);
};
```

## 5. 制約

- **ホストと同じアカウントでは入れない**（`server_id_conflict`）。
  ボット用に別の Microsoft アカウントが要る
- **Xbox Live 認証が必須**。`offline: true` は `not_authenticated` で弾かれる
  （BDS の `online-mode=false` に相当するものがクライアント側に無い）
- **ワールドを開いている間しか繋げない**。ホストが閉じれば切れる
- `nethernet` は **0.1.0 / WIP**。バージョン追従が止まる可能性がある
- 同一 LAN 内が前提。**インターネット越しは署名サーバー
  （`wss://signal.franchise.minecraft-services.net`）経由**になり、未検証

## 6. BDS との比較

| | BDS | 通常ワールド（NetherNet） |
| --- | --- | --- |
| ボットの接続 | 容易（RakNet・実績あり） | **可能だが自作のアダプタが要る** |
| ボットのアカウント | **不要**（`online-mode=false`） | **1体につき1つ必要** |
| `@minecraft/server-net` | 使える | **使えない** |
| 常時稼働 | できる | ホストが開いている間だけ |
| 権限（op） | 安定しない（`online-mode=false` の副作用） | 未検証 |

**用途で選ぶ:**

- **常設・多数のボット・外部連携** → BDS
- **手元のワールドで軽く試す・アドオン不要** → NetherNet

## 7. 未検証

- [ ] 別アカウントでの実際の参加（`server_id_conflict` の解消）
- [ ] 参加後のチャット送受信・移動
- [ ] インターネット越し（Xbox Live の署名サーバー経由）
- [ ] ホストが `zerda256py` 以外のとき（フレンドのワールド）
