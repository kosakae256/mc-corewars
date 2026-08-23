# 仕様: relay — クライアントと BDS の間に入るプロキシ

調査の裏付け: [docs/research/07-player-skin-clone.md](../research/07-player-skin-clone.md)

## 0. なぜ作るのか

**Script API では、クラシックスキン（PNG 画像）を複製できない。**

Bedrock のスキンには2種類ある。

| | クラシックスキン | persona（キャラクター作成） |
| --- | --- | --- |
| 実体 | **1枚の PNG 画像** | パーツの組み合わせ |
| 例 | 自作・配布サイトのスキン | キャラクター作成で組んだもの、マーケットプレイスのキャラ |

Script API の `PlayerSkinData` は **persona の表現そのもの**で、
`armSize` / `personaPieces` / `skinColor` しか無い。
**画像を入れる欄が構造的に存在しない。**

一方、プロトコルの `SerializedSkin` は22項目あり、
**`ImageData`（画像のピクセル）を含む**。
つまり**サーバーは持っているのに、Script API には公開されていない**。

そこでプロトコルに降りる。

## 1. 方式: `SimulatedPlayer` × Relay の分担

**アドオンの良さを捨てない。** 分身の制御は Script API に任せ、
**見た目だけ Relay が差し替える。**

```
参加者 ⇄ Relay（自作） ⇄ BDS（exp アドオン）
```

| 担当 | 何をするか | なぜそこか |
| --- | --- | --- |
| exp アドオン | 分身を湧かせる・走らせる・消す | `SimulatedPlayer` の制御が圧倒的に楽 |
| Relay | 分身の見た目を差し替える | 画像を扱えるのはここだけ |

### 採らなかった案: 分身自体をボットクライアントにする

ログイン時に自分のスキンを申告するだけなので単純
（`bedrock-protocol` の `createClient({ skinData })`）。
だが**移動も見た目もすべてパケットで自作**することになり、
`navigateToLocation` のような制御を失う。

## 2. 段階を分ける

**いきなり書き換えない。** 素通しで壊れないことを先に確かめる。

| 段階 | 内容 | 確かめること |
| --- | --- | --- |
| 1 | **素通しの中継** | Relay 越しで普通に遊べるか。遅延・切断は無いか |
| 2 | スキンの収集 | 参加者の `SerializedSkin` を溜められるか |
| 3 | 差し替え | 分身の `AddPlayer` を書き換えて意図どおり見えるか |

**この仕様では段階1だけを定める。** 2以降は動いてから追記する。

## 3. 段階1: 素通しの中継

### 3-1. 構成

```
参加者 --(Xbox 認証)--> Relay(19134) --(offline)--> BDS(19132)
```

- **参加者は Relay に対して認証する**（`offline: false`）
- **Relay は BDS へ認証なしで繋ぐ**（`destination.offline: true`）
- よって **BDS 側は `online-mode=false` に戻す**必要がある

> 認証の位置が BDS から Relay へ移るだけで、
> 参加者から見た手順は変わらない。

### 3-2. フレンド欄の向き先を変える

`bedrock-portal` の転送先を **BDS ではなく Relay** にする。
`tools/portal/portal.config.json` の `port` を Relay の待受ポートにする。

### 3-3. 落ちても被害を限定する

**全員の通信が Relay を通る。落ちれば全員落ちる。**

- 段階1では**何も書き換えない**。素通しなら壊しようがない
- 使わないときは Relay を止め、`portal` の向き先を BDS に戻せば元通り

### 3-4. リロードで全員を落とさない

**書き換えロジックはプロセスを生かしたまま差し替えられる形にする**
（[02](../research/02-hot-reload.md) 5-A）。

- パケットの加工を**差し替え可能な関数**として分離する
- 制御ソケットで「規則を読み直せ」と伝える
  （`tools/bots/ControlServer.ts` が 127.0.0.1:45500 で同じことをしている）

接続の張り方や `bedrock-protocol` のバージョンを変えるときだけは再起動が要る。

## 4. 設定

`tools/relay/relay.config.json` に置く。

| 名前 | 既定 | 意味 |
| --- | --- | --- |
| `port` | 19134 | Relay の待受ポート |
| `destination.host` | 127.0.0.1 | BDS |
| `destination.port` | 19132 | BDS |
| `logging` | false | パケットログ（重い） |

## 5. 操作

`mc.mjs` に合わせる。

```
node tools/mc.mjs relay start
node tools/mc.mjs relay stop
node tools/mc.mjs logs relay
```

## 6. やらないこと（段階1）

- パケットの書き換え
- スキンの収集・保存
- 分身との連携

## 7. 未検証

- Relay 越しの体感（遅延・チャンク読み込み）
- `enableChunkCaching` を有効にすべきか
- 複数人が同時に入ったときの安定性
