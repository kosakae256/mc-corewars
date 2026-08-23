# 調査: プレイヤーと同じスキンの「分身」を出せるか（VALORANT ヨルの Fakeout 相当）

調査日: 2026-08-22 / 型定義と公式ドキュメントの実物で確認

## 0. 結論

**できる。アドオン単体で完結する。**

```ts
import * as gametest from "@minecraft/server-gametest";

const skin = gametest.getPlayerSkin(player);   // 読む
clone.setSkin(skin);                            // 着せる
```

読む側と着せる側が両方そろっている。BDS もプロキシも要らない。

| やりたいこと | 可否 | 手段 |
| --- | --- | --- |
| 分身を出す・走らせる・消す | 可 | `SimulatedPlayer` |
| プレイヤーのスキンを**読む** | 可 | `gametest.getPlayerSkin(player)` |
| 分身にスキンを**着せる** | 可 | `SimulatedPlayer.setSkin(data)` |

## 1. 見落としの記録（同じ轍を踏まないために）

**最初「不可能」と誤って結論した。** 原因は探し方。

- `@minecraft/server` の中だけを探した → スキンを読む API は本当に無い
- `server-gametest` は**クラスのメンバーだけ**見た → `SimulatedPlayer.setSkin` は見つけた
- **モジュール直下の `export function` を見ていなかった** → `getPlayerSkin` はそこにいた

> **教訓: `grep -nE "^export function " index.d.ts` を必ずやる。**
> Script API はクラスに属さないモジュール関数がそこそこある。
> クラスのメソッドだけ見て「無い」と言ってはいけない。

なお**公式ドキュメントにも普通に載っている**
（`reference/minecraft-creator-docs/creator/ScriptAPI/minecraft/server-gametest/minecraft-server-gametest.md`）。
未文書化の裏技ではなく、単に探す場所を間違えていただけ。

## 2. API の中身

### 2-1. 読む

```ts
export function getPlayerSkin(player: minecraftserver.Player): PlayerSkinData;
```

- restricted-execution では呼べない
- 無効なエンティティを渡すと投げる

### 2-2. 着せる

```ts
// SimulatedPlayer のメソッド
setSkin(options: PlayerSkinData): void;
```

### 2-3. 受け渡す型

```ts
interface PlayerSkinData {
  armSize?: PersonaArmSize;          // Slim | Wide
  personaPieces?: PlayerPersonaPiece[];
  skinColor?: RGB;
}

interface PlayerPersonaPiece {
  id: string;
  packId: string;
  productId: string;
  type: PersonaPieceType;
  isDefaultPiece?: boolean;
}
```

`PersonaPieceType` は25種類:
`Arms Back Body Bottom Capes Dress Eyes FaceAccessory FacialHair Feet Hair
Hands Head HighPants Hood LeftArm LeftLeg Legs Mouth Outerwear
RightArm RightLeg Skeleton Skin Top`

**`Skin` という種別がある**ので、Character Creator を使っていない
（自作 PNG を入れている）プレイヤーもここに乗る可能性が高い。
ただし**未検証**（4章）。

## 3. バージョン（重要）

`getPlayerSkin` は beta の `@minecraft/server-gametest` にある。
**開発機の実機 1.26.44 に対応する版にも入っていることを確認済み。**

| 版 | `getPlayerSkin` | モジュール直下 `spawnSimulatedPlayer` |
| --- | --- | --- |
| `1.0.0-beta.1.26.44-stable` | あり | あり |
| `1.0.0-beta.1.26.50-preview.26`（導入済み） | あり | あり |

`@minecraft/server`（stable 2.9.0 / beta 2.11.0）には**どちらも無い**。
`EntitySkinIdComponent`（`minecraft:skin_id`）は村人などの見た目番号で無関係。
beta で増える `EntityNpcComponent.skinIndex` も NPC の内蔵スキン番号で別物。

## 3-A. 実機で分かったこと（2026-08-22 検証）

### 3-A-1. `personaPieces` が空になる場合がある

`getPlayerSkin` は呼べて、例外も出ない。だが **`パーツ=0`** で返ることがある。

`PlayerSkinData` は **persona（キャラクター作成）専用**で、
公式ドキュメントを見ても `armSize` / `personaPieces` / `skinColor` の3つしかない。
**自作 PNG のスキンを表現する欄が無い。**

つまり:

| 相手のスキン | 分身に複製 |
| --- | --- |
| キャラクター作成（persona） | **できる（見込み）** |
| 自作・配布の PNG スキン | **できない** |

これは実装の工夫で回避できない。型に情報を入れる場所が無い。

### 3-A-2. 「ゲームに参加しました」が出る

`SimulatedPlayer` が湧くと参加通知が出る。分身としては致命的。

**抑止する手段は無い。**

- ゲームルール37個を全部確認したが、該当するものが無い
  （`ShowDeathMessages` はあるが参加通知は別）
- `world.afterEvents.playerJoin` は after のみでキャンセル不可

**回避策: 先に出して待機させ、使うときはテレポートするだけにする。**

1. 起動時などに分身をまとめて湧かせる（**通知はここで1回だけ出る**）
2. 遠くの待機場所へ送り、透明化しておく
3. 能力の発動時は、そこからテレポートするだけ → **通知は出ない**
4. 使い終わったら**消さずに待機場所へ戻す**
   （消すと退出通知が出るうえ、次に使うとき再び参加通知が出る）

### 3-A-3. Script API はスキン情報の**ごく一部**しか見せていない

`bedrock-samples/metadata/json_schemas/protocol/SerializedSkin.json` が、
**プロトコルが実際に運んでいるスキン情報の全項目**。22 個ある。

```
AnimatedImageData  AnimationData  ArmSize  CapeID  CapeImageData
FullID  GeometryData  GeometryDataMinEngineVersion  ID
ImageData  ← スキン画像そのもの（ピクセル）
IsPersona  ← キャラクター作成のスキンかどうか
IsPersonaCapeOnClassicSkin  IsPremium  IsPrimaryUser
OverridesPlayerAppearance  PersonaPieces  PieceTintColors
PlayFabID  ProfileHash  ResourcePatch  SkinColor  TrustedSkinFlag
```

対して `PlayerSkinData` が持つのは **3個だけ**。

| | プロトコル | Script API |
| --- | --- | --- |
| 項目数 | 22 | **3** |
| スキン画像（`ImageData`） | **ある** | **無い** |
| ジオメトリ | ある | 無い |
| ケープ | ある | 無い |
| persona かどうか（`IsPersona`） | ある | 無い |
| `ArmSize` / `PersonaPieces` / `SkinColor` | ある | ある |

**ここから言えること:**

- **自作 PNG スキン（`IsPersona: false`）は、Script API では絶対に複製できない。**
  画像を運ぶ欄が `PlayerSkinData` に無い。実装の工夫では埋まらない
- **キャラクター作成のスキンなら `PersonaPieces` が埋まるはず。**
  埋まらないなら、そのスキンは persona ではない可能性が高い

> **紛らわしい点:** キャラクター作成の画面の中にも「クラシックスキン」の枠があり、
> **そこから選んだものは persona ではない**（`IsPersona: false`）。
> パーツを組み合わせて作ったものだけが persona。

#### 自分のスキンが persona かどうかを確かめる方法

`IsPersona` は Script API から見えないが、**プロトコルなら見える**。
`tools/bots/dump-skins.mjs` が `player_list` パケットから
`persona=` を表示する。BDS に接続した状態で実行すれば分かる。

### 3-A-4. カスタムモブにスキンを着せることはできない

「GameTest のモブを使わず、クローン用のモブを用意してスキンを適用する」
という案は**成立しない**。

- `setSkin` は `SimulatedPlayer` にしか無い
- エンティティの見た目を切り替える component
  （`minecraft:skin_id` / `minecraft:variant` / `minecraft:mark_variant`）は
  **すべて `readonly value`**。スクリプトから書けない
- 書けたとしても、選べるのは**リソースパックに焼き込んだテクスチャ**だけ。
  画像データを渡す API はどこにも無い

**Bedrock で任意のプレイヤーのスキンを描画できるのはプレイヤー実体だけ。**
スキンはプレイヤーに付いてネットワークを流れるものだから。

## 3-C. 全数調査（2026-08-22）

「他に手が無いか」を、**Bedrock が公開しているスクリプトモジュールの
メタデータ全部**（`bedrock-samples/metadata/script_modules/@minecraft/`、85 ファイル）
に対して機械的に調べた。

### skin / persona に触れる定義は3箇所しかない

| モジュール | 見つかったもの | 使えるか |
| --- | --- | --- |
| `server-bindings`（＝`@minecraft/server`） | `EntitySkinIdComponent`（村人等の見た目番号・readonly）、`personaPieceId`（エモート時の1パーツ）、`skinIndex`（NPC の内蔵スキン番号・beta） | **不可** |
| `server-gametest` | `getPlayerSkin` / `setSkin` / `PlayerSkinData` | **persona のみ** |
| `server-net` | `PlayerSkinPacket` | 後述 |

### `@minecraft/server-net` のパケットイベント

存在する。**が、中身が読めない。**

```
NetworkBeforeEvents
  packetReceive : PacketReceiveBeforeEventSignal
  packetSend    : PacketSendBeforeEventSignal

PacketSendBeforeEvent      cancel(可変) / packetId(readonly) / recipients(readonly)
PacketReceivedBeforeEvent  cancel(可変) / packetId(readonly) / packetSize(readonly) / sender(readonly)
```

`PacketId` は 228 種あり、`PlayerSkinPacket` / `AddPlayerPacket` /
`PlayerListPacket` もそろっている。

**しかしペイロードにアクセスする手段が無い。**
できるのは「この種類のパケットを止める」だけで、
読むことも書き換えることもできない。スキンの複製には使えない。

（そもそも `server-net` は BDS 専用。通常ワールドでは使えない）

### その他のモジュール

`server-graphics`（バイオームの色・大気）、`debug-utilities`（デバッグ描画）、
`diagnostics`（Sentry）、`server-admin`（allowlist / kick / transfer）。
いずれもスキンとは無関係。

### リソースパック側も不可

バニラの `player.entity.json` は
`textures.default = "textures/entity/steve"` を指しているだけで、
描画コントローラも `Texture.default` を参照するだけ。

**この差し替えはエンジンがプレイヤー実体に対してだけ行う**もので、
実体のスキンはネットワークで運ばれてくる。
リソースパックは事前に焼いたテクスチャしか持てないので、
**実行時に届く他人のスキン画像を流し込む口が無い。**

## 3-D. API 表面の全数列挙（2026-08-22）

推測の検索語でなく、**機械的に全部並べて**確認した。

### モジュール直下の関数（見落としやすい場所）

| モジュール | 関数 |
| --- | --- |
| `server-gametest` | `getPlayerSkin` `register` `registerAsync` `setAfterBatchCallback` `setBeforeBatchCallback` `spawnSimulatedPlayer` |
| `server-admin` | `deopPlayer` `kickPlayer` `opPlayer` `transferPlayer` |
| `server-graphics` | `getBiome*` `getPlayer*`（大気・色・光・水のみ） |
| `debug-utilities` | `collectPluginStats` `collectRuntimeStats` `disableWatchdogTimingWarnings` |
| `server` / `server-net` / `server-ui` / `common` / `diagnostics` | **なし** |

### `Player` / `Entity` の全メンバー（`server-bindings` 2.10.0-beta）

`Player` のプロパティ25個・メソッド28個、`Entity` のプロパティ20個・メソッド43個を
全部並べたが、**スキンに触れるものは1つも無い。**

### 実行時リフレクション（実測）

ゲーム内でプロトタイプ鎖をたどって列挙した結果、
スキン関係で出てきたのは次だけ。

```
EntitySkinIdComponent  InvalidWaypointTextureSelectorError  WaypointTexture
PersonaArmSize  PersonaPieceType  getPlayerSkin
```

- `WaypointTexture` は位置マーカーのアイコン4種
  （`Circle` / `SmallSquare` / `SmallStar` / `Square`）。スキンとは無関係
- `EntitySkinIdComponent` は村人等の見た目番号
- 残りは既知

**型定義・メタデータ・実行時の3つが一致した。隠し API は無い。**

## 3-B. 結論（2026-08-22 / 実機で確認済み）

**アドオン単体でできる。ただし「キャラクター作成系のスキン」に限る。**

実機で確認できたこと:

| 相手のスキン | `getPlayerSkin` | 分身との一致 |
| --- | --- | --- |
| マーケットプレイスのスキン（persona） | **パーツが返る** | **一致した** |
| 自作・配布の PNG スキン | 空 | 既定の見た目になる |

`getPlayerSkin` → `setSkin` の往復は**正しく動く**。
空が返るのは API の不具合ではなく、
**`PlayerSkinData` が persona のパーツしか運べない**ため。

つまり:

- persona のスキンを使っている人 → **完全に複製できる**
- 自作 PNG のスキンを使っている人 → **複製できない**（画像を運ぶ欄が無い）

後者を含めて全員を対象にしたいなら BDS 側（2章の A か B）。
プロトコルには `ImageData` まで流れているので、そちらなら制約が無い。

### 実装するときの分岐

`getPlayerSkin` の戻りの `personaPieces` が空かどうかで、
その人が複製できるかを**実行時に判定できる**。
空の人には別の見せ方（既定の見た目・名前だけ同じ、など）を用意すればよい。

## 4. 未検証（作る前に確かめること）

- [x] 自作 PNG スキンだと `personaPieces` が空 → **3-A-1 のとおり空だった**
- [ ] **キャラクター作成のスキン**なら `personaPieces` が埋まるか（次に試すこと）
- [ ] 返った `PlayerSkinData` をそのまま `setSkin` に渡して、見た目が一致するか
- [ ] マーケットプレイスで買ったパーツが混ざっている場合の挙動
      （`packId` / `productId` の所有権チェックが働かないか）
- [ ] 分身を見る**他のプレイヤー側**でも一致して見えるか

## 5. おまけの大きい発見: `Test` が要らない

同じくモジュール直下に、**GameTest に紐づかない生成関数**がある。

```ts
export function spawnSimulatedPlayer(
  location: minecraftserver.DimensionLocation,
  name: string,
  gameMode: minecraftserver.GameMode,
): SimulatedPlayer;
```

説明文にはっきり
*"Spawns a simulated player that **isn't associated to a specific Test**"*
と書いてある。

**これは [05-simulated-player.md](05-simulated-player.md) の前提を覆す。**

| | 従来（`Test.spawnSimulatedPlayer`） | こちら |
| --- | --- | --- |
| GameTest の登録 | 要る | **不要** |
| 構造物（`.mcstructure`） | 要る | **不要** |
| 座標系 | **GameTest 相対座標** | **`DimensionLocation`（ワールド座標）** |
| テスト終了で消える | する | しない |

**座標系の罠（`toRelative` を通す必要）が丸ごと消える。**
`leveler` で一番手こずったのがここだったので、影響は大きい。

> `leveler` を作り直すかは別途判断する。
> 動いているものを触るリスクはあるが、
> 構造物生成（`tools/make-empty-structure.mjs`）と
> 相対座標変換をまとめて捨てられる。

## 6. 分身の作り方（動きの部分）

ヨルの Fakeout は「前方に走っていき、撃たれるか一定時間で消える」。

| 要素 | 手段 |
| --- | --- |
| 生成 | `gametest.spawnSimulatedPlayer(loc, name, gameMode)` |
| スキンを合わせる | `clone.setSkin(gametest.getPlayerSkin(owner))` |
| 前進 | `moveRelative()` / `navigateToLocation()` |
| 撃たれたら消える | `world.afterEvents.entityHitEntity` → `disconnect()` |
| 時間で消える | `system.runTimeout()` → `disconnect()` |

**制約**（[05-simulated-player.md](05-simulated-player.md)）:

- `@minecraft/server-gametest` は beta。実験機能を有効にする必要がある
- ワールドを読み込み直すと消える
- **プレイヤーとして数えられる**ので、湧き上限・睡眠・チャンク読み込みに影響する
