# 仕様: exp — 分身（VALORANT ヨルの Fakeout 相当）

調査の裏付け: [docs/research/07-player-skin-clone.md](../research/07-player-skin-clone.md)

## 0. このアドオンの位置づけ

**`exp` は実験用のアドオン。** しばらくは試作をここに集める。

1つの完成品を作るのではなく、**試したいものを足していく置き場**にする。
機能ごとに `scripts/features/<機能名>/` で分ける。
物になったら、そのとき初めて独立したアドオンに切り出す。

配置先は **BDS**（`dev` / world `flatworld`）。

## 1. 作るもの

**使うと、自分と同じ見た目の分身が前方へ走っていく。**

VALORANT のヨルの Fakeout に相当する。

## 2. 発動

### 2-1. 常に左端に発動アイテムを持たせる

**参加者のホットバー左端（スロット0）に、分身を出すアイテムを常に置く。**

- **捨てられない・動かせない**
  → `ItemStack.lockMode = ItemLockMode.slot`
  公式の説明は *"The item cannot be moved from its slot, dropped or crafted with."*
- **死んでも失わない** → `ItemStack.keepOnDeath = true`
- 参加時と、定期的に確認して、無ければ置き直す

> **なぜコマンドにしないか。**
> カスタムコマンドの新規登録はサーバー再起動が要る（[02](../research/02-hot-reload.md) 5-A）。
> アイテムの右クリックはイベント購読なので **`/reload` だけで反映される**。
> 実験用アドオンなので、作り直しやすさを最優先する。

### 2-2. 使い方

右クリック（`world.afterEvents.itemUse`）で発動。

## 3. 見た目

**`SimulatedPlayer` を使う。** Bedrock で他人のスキンを描画できるのは
プレイヤー実体だけ（[07](../research/07-player-skin-clone.md) 3-A-4）。

```ts
clone.setSkin(gametest.getPlayerSkin(owner));
```

### 3-1. 複製できない人がいる

`PlayerSkinData` は **persona（キャラクター作成系）のパーツしか運べない**。

| 相手のスキン | 結果 |
| --- | --- |
| マーケットプレイス等の persona | **一致する**（実機確認済み） |
| 自作・配布の PNG スキン | パーツが空。既定の見た目になる |

**実行時に判定できる。** `personaPieces` が空なら複製できない人。
そのときも分身は出す（見た目だけ既定になる）。

## 4. 「ゲームに参加しました」を出さない（BDS 前提）

**`SimulatedPlayer` を湧かせると参加通知が出る。分身としては致命的。**
ゲームルールにも通常の API にも抑止手段が無い
（[07](../research/07-player-skin-clone.md) 3-A-2）。

**BDS なら `@minecraft/server-net` のパケットイベントで止められる。**

```ts
network.beforeEvents.packetSend.subscribe(
  (event) => { if (suppressing) event.cancel = true; },
  { monitoredPacketIds: [PacketId.TextPacket] }
);
```

- 参加・退出の通知は `TextPacket` で配られる
- `PacketEventOptions.monitoredPacketIds` で**その種類だけ**購読できる
- `PacketSendBeforeEvent.cancel` は書き換え可能

**止めるのは分身を出し入れする瞬間だけ。**
ずっと止めると普通のチャットまで消える。
`SUPPRESS_TICKS` の間だけ立てて、すぐ下ろす。

> **中身は読めない。** パケットイベントで見えるのは種類だけで、
> 本文は取れない（[07](../research/07-player-skin-clone.md) 3-C）。
> よって「参加通知だけ狙って消す」ことはできず、
> **その一瞬の `TextPacket` を全部止める**という乱暴なやり方になる。
> 代わりに窓を極力短くする。

### 必要な設定（BDS 側）

- `manifest.json` の `dependencies` に `@minecraft/server-net`
- `config/<スクリプトモジュールUUID>/permissions.json` で許可
  （既定では許可されていない）

### この方式が使えない場合の代替

通常ワールドなど `server-net` が使えない環境では、
**先に湧かせて待機させ、発動時はテレポートするだけ**にする
（[07](../research/07-player-skin-clone.md) 3-A-2 の回避策）。
初版では実装しない。

## 5. 動き

| 要素 | 決め |
| --- | --- |
| 向き | 使った人の向きを引き継ぐ |
| 進み方 | その向きへ走る |
| 走る時間 | `CLONE_RUN_TICKS` |
| 消える条件 | 走り終わる / 殴られる |
| 消え方 | 待機場所へ戻す（4 のとおり） |

殴られたら消えるのは `world.afterEvents.entityHitEntity` で拾う。

## 6. 設定値

すべて `config.ts` に集める。実験用なので触りやすさを優先する。

| 名前 | 既定 | 意味 |
| --- | --- | --- |
| `CLONE_ITEM` | `minecraft:blaze_rod` | 発動アイテム |
| `CLONE_SLOT` | 0 | 置くスロット（左端） |
| `SUPPRESS_TICKS` | 2 | 通知を止める窓の長さ。長くするとチャットが消える |
| `CLONE_RUN_TICKS` | 100 | 走る時間 |
| `CLONE_SPEED` | 1 | 走る速さ |
| `EQUIP_INTERVAL` | 40 | 左端の確認間隔 |

## 7. やらないこと（初版）

- 自作 PNG スキンの複製（プロトコル層が要る。[07](../research/07-player-skin-clone.md) 2章）
- 分身が攻撃する・ブロックを壊す
- クールダウン管理
- 音・パーティクルの演出

## 8. 未確定

- 殴られたときに音を鳴らすか（ヨル本人は鳴る）
- 走る距離・時間の詰め
- 通知抑止の窓（`SUPPRESS_TICKS`）が短すぎ／長すぎないか
- 同時に複数人が使ったときの窓の重なり
