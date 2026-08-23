# deep research 依頼文: プレイヤーのスキンを分身に複製できるか（アドオン範囲限定）

そのまま貼って使うための依頼文。
これまでの調査は [07-player-skin-clone.md](07-player-skin-clone.md) にある。

---

## 調べてほしいこと

**Minecraft Bedrock Edition で、あるプレイヤーとまったく同じ見た目（スキン）の
「分身」を出す方法が、アドオンの範囲内に存在するか。**

VALORANT のヨルの Fakeout のような、本人と見分けがつかない囮を出したい。

## スコープ（ここが重要）

**「アドオンで完結する方法」だけを対象にする。**

### 対象に含む

- ビヘイビアーパック / リソースパック
- **Script API**（`@minecraft/server` および `@minecraft/server-gametest` の beta 含む）
- **通常のマルチプレイワールド**（クライアントがホストする世界、LAN、Realms）
- 実験機能（Beta APIs など）はオンにしてよい

### 対象から外す

- **Bedrock Dedicated Server (BDS) 専用の機能**
  （`@minecraft/server-net` / `@minecraft/server-admin` は BDS でしか動かないため対象外）
- **プロキシ・独自サーバー実装・プロトコルを直接扱う方法**
  （WaterdogPE、PocketMine、Nukkit、bedrock-protocol などは対象外）
- 外部プロセス（ボットクライアント等）を必要とする方法

> **理由:** サーバー側に降りれば可能なことは既に分かっている。
> 知りたいのは「そこまでやらずに済む道があるか」。

## すでに確認済みのこと（重複調査を避けるため）

対象バージョン: Minecraft Bedrock **1.26.44**、`@minecraft/server` 2.9.0 /
`@minecraft/server-gametest` 1.0.0-beta.1.26.44-stable。

### 1. 分身そのものは出せる

`@minecraft/server-gametest` の**モジュール直下**にある
`spawnSimulatedPlayer(location, name, gameMode)` で、
GameTest に紐づかない `SimulatedPlayer` を出せる。ワールド座標をそのまま渡せる。

### 2. スキンの読み書き API はある。ただし persona 限定

```ts
gametest.getPlayerSkin(player): PlayerSkinData   // 読む
simulatedPlayer.setSkin(data): void              // 着せる
```

`PlayerSkinData` の中身は **3項目だけ**。

```ts
interface PlayerSkinData {
  armSize?: PersonaArmSize;          // Slim | Wide
  personaPieces?: PlayerPersonaPiece[];
  skinColor?: RGB;
}
```

**スキン画像を入れる欄が存在しない。**

実機で確認した結果:

| 相手のスキン | 結果 |
| --- | --- |
| キャラクター作成 / マーケットプレイス（persona） | パーツが返り、分身の見た目も**一致した** |
| 自作・配布の PNG スキン | `personaPieces` が空。分身は既定の見た目になる |

`getPlayerSkin` の戻り値をそのまま `setSkin` に渡す（値を自分で組み立てない
「コピー＆ペースト」の形）でも、クラシックスキンは複製されない。
ネイティブのハンドルが画像を内部的に持っているわけではない、と考えられる。

### 3. プロトコルには画像がある（が、アドオンからは触れない）

プロトコルの `SerializedSkin` は **22項目**あり、
`ImageData`（スキン画像のピクセル）、`GeometryData`、`CapeImageData`、
`IsPersona` などを含む。
つまり**サーバーは画像を持っているが、Script API には公開されていない**。

### 4. API 表面は全数列挙済み。ほかに手段は見つからなかった

- Mojang 公式のスクリプトモジュール メタデータ **85ファイル**を機械的に走査。
  skin / persona に触れる定義は3箇所のみ
  （`EntitySkinIdComponent`＝村人等の見た目番号、
  `PlayerEmoteAfterEvent.personaPieceId`＝エモート時の1パーツ、
  `EntityNpcComponent.skinIndex`＝NPC の内蔵スキン番号）
- **モジュール直下の関数**を全モジュールぶん列挙。スキン関係は `getPlayerSkin` のみ
- `Player`（プロパティ25・メソッド28）と `Entity`（プロパティ20・メソッド43）を
  全部確認。スキンに触れるものは無い
- **実行時リフレクション**（ゲーム内でプロトタイプ鎖を列挙）でも、
  型定義・メタデータと一致。隠しメンバーは無かった
- **クライアントにパケットを送る API が無い**
  （送信系は `sendMessage` / `queueMusic` / `sendScriptEvent` /
  外部宛の `WebSocketClient.send` のみ）
- コマンド一覧（`mojang-commands.json`）に skin 関連のコマンドは無い
- Molang は `query.skin_id` と `query.is_persona_or_premium_skin` の2つのみ。
  画像は運べない
- リソースパック側も、プレイヤーのテクスチャは
  `textures/entity/steve` という**置き換え用のプレースホルダ**で、
  実際の差し替えはエンジンがプレイヤー実体に対して行う。
  リソースパックは事前に焼いたテクスチャしか持てない

## 答えてほしい問い

1. **上記の結論は正しいか。** アドオンの範囲内で、
   クラシックスキン（PNG）のプレイヤーと同じ見た目の分身を出す方法は
   本当に存在しないのか
2. 見落としている **API・コンポーネント・リソースパックの仕組み**はないか。
   とくに次のような回り道:
   - プレイヤー実体以外で、実行時に任意の画像をテクスチャにできる仕組み
   - `runtime_identifier` など、エンティティをプレイヤーとして描画させる手法で、
     スキンが引き継がれるもの
   - アタッチャブル、`texture_sets`、`render_controllers` を使った回避
3. **将来的に可能になる見込み**はあるか。
   1.26.50 以降のプレビュー、Mojang の公開ロードマップ、
   フィードバックサイトの受理済み要望などに、
   `PlayerSkinData` の拡張やスキン画像の公開に関する動きはあるか
4. 実際に**アドオンだけでプレイヤーそっくりの NPC / 分身を実現している事例**はあるか。
   あるなら、どういう仕組みか（persona 限定で妥協しているのか、別の手があるのか）

## 回答に求めること

- **一次情報を優先**（Microsoft Learn の Script API リファレンス、
  Mojang の公式ドキュメント、`bedrock-samples` リポジトリ、
  Minecraft のフィードバックサイト）
- 「できる」と言う場合は、**具体的な API 名・JSON の書き方・出典**まで
- 「できない」と言う場合も、**どこまで確認してそう言えるのか**を明示
- BDS 専用機能やプロトコル層の話は**対象外**なので、
  そちらに話が寄った場合はその旨を明記してほしい
