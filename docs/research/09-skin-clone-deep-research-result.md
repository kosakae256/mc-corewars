# deep research 結果: アドオン範囲でのスキン複製は可能か

実施日: 2026-08-22 / 依頼文は [08](08-skin-clone-deep-research-brief.md)
規模: 101 エージェント・約16分・一次情報19件・主張19件を3票の敵対的検証にかけた

## 0. 結論

**これまでの結論は正しかった。** 検証は全会一致（3-0）。

> アドオンの範囲内（BP/RP + Script API、実験機能オン）で、
> **クラシック PNG スキンのプレイヤーと同じ見た目の分身を出す方法は存在しない。**

理由も既に把握していたとおり。
`SimulatedPlayer.setSkin` の入り口である `PlayerSkinData` が
`armSize` / `personaPieces` / `skinColor` の3項目しか持たず、
`personaPieces` も persona カタログへの識別子（`id` / `packId` / `productId` / `type`）
だけで、**プロトコルの `SerializedSkin.ImageData` に相当するピクセルを運ぶ欄がどこにも無い**。

## 1. 新しく分かったこと

### 1-1. スキンパック（`skins.json`）も塞がっている

こちらは自分では調べていなかった。

スキーマは `localization_name` / `geometry` / `texture` / `type` の4項目で
**`additionalProperties: false` の閉じたスキーマ**。
スキンをエンティティや NPC など**プレイヤー以外に割り当てるフックが定義されていない**。

### 1-2. 実例が存在しない（この分野で最も成熟した実装が諦めている）

**問い4への回答。** アドオンのみでプレイヤーそっくりの分身を実現している実例は無い。

この分野で最も成熟しているのは **Understudy**（v1.2.3・45,900 DL）と
その後継 **Canopy**。どちらも `SimulatedPlayer` で偽プレイヤーを出すアドオンだが、
**スキンのコピーを一切試みておらず、既定の見た目のまま出している。**

「やろうとして避けている」ことの傍証になる。

### 1-3. 「固定メンバーなら焼き込みで可能」という例外

検証側が挙げた重要な但し書き。

**対象プレイヤーを特定の一人（または既知の少人数）に固定できるなら、
その PNG をリソースパックにビルド時に焼き込み、
`variant` / `mark_variant` / `skin_id` で選択する手法は成立する。**

不可能なのはあくまで
**「実行時に任意のプレイヤーのスキンを取得して反映すること」**。

> 身内サーバーで参加者が固定なら、これは現実的な選択肢になりうる。
> 参加者が増減するたびにパックを作り直す必要はある。

### 1-4. beta モジュールは実際に動いている

`SimulatedPlayer` の削除 API が **1.26.44 の `remove` → 1.26.50 の `disconnect`** に
変わっている。beta を使う以上、この手の変更は前提として持っておく。

## 2. 潰れた回避策（すべて 3-0 で確定）

| 候補 | なぜ駄目か |
| --- | --- |
| client entity の `textures` | 「短縮名 → パック内ファイルパス」の**静的宣言**。実行時に画像を持ち込めない |
| render controller | 既に宣言済みの短縮名を選ぶだけ。スキーマが `^[Tt]exture\..+` に制約 |
| Molang | 数値・真偽値しか運べない。テクスチャパス文字列を組み立てて代入する手段が無い |
| `minecraft:skin_id` | `readonly` な数値のみ |
| `minecraft:npc` の `skinIndex` | パック同梱の固定テクスチャ60件への添字 |
| スキンパック `skins.json` | 閉じたスキーマ。非プレイヤーへの割り当て口が無い |

**唯一それらしく見えた例外**は、アーマーの render controller にある
`variable.has_trim ? variable.trim_path : Texture.default`。
だが `trim_path` は**エンジン C++ が設定するもの**で、
どのパック JSON からも代入されておらず、参照先も結局パック同梱ファイル。

## 3. 未検証のまま残っていること

**問い2(b) は今回の19クレームのいずれもカバーしていない。**

- **`runtime_identifier: "minecraft:player"` を付けたカスタムエンティティ**が、
  エンジンのプレイヤー描画パス
  （`textures/entity/steve` プレースホルダを実スキンで差し替える処理）に乗るのか、
  それとも client entity の `textures` 宣言が使われるのか。
  **今回まったく検証されていない唯一の残ルート。実機で試す価値がある**
- 任意の persona パーツ ID を手で組んで `setSkin` に渡し、
  クラシックスキンの人の見た目を**近似**できないか
- attachable で「スキン風の外殻」を被せる手法でどこまで寄せられるか
- `feedback.minecraft.net` に `PlayerSkinData` 拡張の要望があり受理されているか

## 4. 将来の見込みについて

`1.26.50-preview.26` の時点でも `PlayerSkinData` / `PersonaPieceType` /
`PlayerPersonaPiece` の形は **1.26.44 から一切変わっていない**。

ただし「全チェンジログを走査して追加ゼロ」といった主張は**検証で否決された**
（走査の網羅性が担保できないため）。
**「将来も不可能」とは言えない。**

## 5. この結論の限界

- スコープどおり**アドオン範囲に限定**した話。
  プロトコル層（`SerializedSkin` を直接扱う経路）なら可能なことは既知で、
  今回の否定的結論はそこには及ばない
- 「不可能」の根拠は**公開されている型定義・スキーマ・ドキュメントの網羅列挙**という
  消極的証明。未文書の内部メンバーの不在まで証明したものではない
  （ただし実行時リフレクションは自分たちで実施済み。[07](07-player-skin-clone.md) 3-D）

## 6. 主な出典

- Microsoft Learn — `PlayerSkinData` / `PlayerPersonaPiece` / `PersonaPieceType` /
  `SimulatedPlayer` / `server-gametest` モジュール / `EntityNpcComponent`
- Mojang/bedrock-samples — `resource_pack/entity/npc.entity.json`、
  `render_controllers`、`metadata/script_modules`
- wiki.bedrock.dev — render controllers、runtime identifier
- bedrock.dev — Texture Sets
