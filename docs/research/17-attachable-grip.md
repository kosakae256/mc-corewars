# 調査: 装備する模型と、持ち主の構えを合わせる

2026-09-10。PVE v3 の散弾の銃で調査した。

## 仕様とバニラで確認したこと

- `minecraft:attachable` の定義は RP の `attachables/` に置く。
  `identifier` と装備アイテムの ID を一致させる。
- `item` の条件をプレイヤーだけにすると、モブが持った場合には使えない。
  全所有者に使う定義なら `{ "pve_v3:gun": "1.0" }` とする。
- `binding: "q.item_slot_to_bone_name(context.item_slot)"` は装備スロットから
  持ち主の `rightItem` / `leftItem` を選ぶ。`parent` で同じ名前を書くだけの方式とは違う。
- バニラのトライデントは装備模型の根の pivot を `[0,24,0]` としている。
  今回もこの配置に揃え、握りの画素をこの基準点へ合わせた。
- アニメは `scripts.animate` の順に、骨の各チャンネルへ重なる。
  バニラのピリジャーも構えの回転に `値 - this` を使う。
  足を止めずに腕だけ固定するには、構えを後段に置いて腕だけ上書きする。
- 回転は X → Y → Z。逆回転は各角度の符号を反転するだけでなく、**順序も逆**にする。
  複数軸の補正が必要なら親子の骨に分けると追いやすい。

参照:

- [Microsoft Learn: Using Attachables](https://learn.microsoft.com/en-us/minecraft/creator/documents/attachables?view=minecraft-bedrock-stable)
- [Microsoft Learn: Animations Overview](https://learn.microsoft.com/en-us/minecraft/creator/documents/animations/animationsoverview?view=minecraft-bedrock-stable)
- `bedrock-samples/resource_pack/models/entity/trident.geo.json`
- `bedrock-samples/resource_pack/animations/pillager.animation.json`

## 今回見つけた不一致

着手時のパックには銃の attachable が無く、`user/` に試作用の定義があるだけだった。
通常のアイテム表示に、モブ側の `rightItem` の位置補正と X 方向の scale を掛けていた。

`pve3-pose.tpl.html` と `pve3-poseref.py` の持ち物は、手の pivot に置いた
16×16 の板である。実際の装備模型・binding・装備時の補正を読んでいない。
この板だけで合わせた位置を、そのままゲームの持ち物へ適用しても一致するとは限らない。
前者は回転行列の順序と scale の扱いにも差があるため、今回の確認には使わなかった。

## 散弾への適用と検証の範囲

`tools/pve3-gunrig.py` が既存 PNG を読み、透明部分を除いた64個の cube を生成する。
絵の変更・追加取得はしない。1px = 0.25 モデル単位、厚みは 0.9 単位。
寸法を cube に持たせ、アニメによる縮小が途切れたときの巨大化を避ける。

モブの腕と装備模型の補正は別のアニメに置く。銃の握りを原点にしてから、
右腕の傾きを銃側の親子2本の骨で補正する。描く経路は attachable 1つ。

実際の JSON の階層を使った幾何プレビューでは、右掌と握りの距離が 0、
左掌と銃の表面の距離が約 0.805 モデル単位（掌の半幅2以内）になった。
これはゲームエンジンそのものの描画ではない。binding の実機での解釈、
テクスチャの両面、視界端、歩行中の構えは実機確認で判断する。

RP 1.0.184 を配置した後の画面を、当初は修正版の表示と判断してしまった。
その後ユーザーから、ゲームは修正版をまだ読み込んでいなかったと説明があった。
**この時点の画面を修正版の実機検証の根拠にしない。** ファイルが配置済みであることと、
ゲームがそのファイルを再読み込みしたことを区別する。

また、手と銃の距離が近いだけでは、腕の交差や肩への埋まりを否定できない。
ユーザーから明確な指摘を受けたため、定義を固定して描画ツールを先に校正する。
`tools/pve3-rig-preview.py` は実際の模型・テクスチャ・衣服層・静的アニメと
attachable を読み、UV と画素単位の奥行きを使った6方向の画像を出す。
仕様・対応範囲は `worlds/pve-v3/docs/spec/26-rig-preview.md`。

2026-09-10 時点では読み取った9ファイルの SHA-256 が配置済み RP と一致。
変換・this の上書き・初期相対位置・交差面の隠面判定・透明画素の5テストを通過した。

再読み込み後の実機を斜め・ほぼ正面から撮影して比較した。最初のツールでは
銃が手先に出ており、実機では肩寄りに出る不一致があった。
位置チャンネルの `this` を初期相対位置込みで評価すると、同じ定義のまま
肩寄りへの移動と腕の交差を再現できた。`rightItem` の初期相対位置は
`[-1,-7,1]` なので、`[0-this,-1-this,-1-this]` はこれを消してしまう。
前述の「右掌と握りの距離0」はこの解釈を誤ったプレビューの値であり、
実機の接触の根拠として使ってはいけない。

比較画像は `out/shotgun-rig/calibration-side/comparison.png` と
`out/shotgun-rig/calibration-front/comparison.png`。現在の静止姿勢の主要な形と
位置関係を照合した範囲の検証である。カメラは目視推定、環境光・HUD・頭の視線は
再現しておらず、画素の完全一致・動的アニメ全体の保証ではない。

UV と座標反転の参照:
[Blockbench の Bedrock 読み込み処理](https://github.com/JannisX11/blockbench/blob/master/js/formats/bedrock/bedrock.js)、
[cube の面座標](https://github.com/JannisX11/blockbench/blob/master/js/outliner/types/cube.js)。

## 参考画像による構えの修正

ユーザーの参考画像は肘を曲げず、両腕を前へ伸ばした構えだった。
肘を追加する解釈はユーザー訂正を受けて取り消し、元の人型模型を維持した。
右腕 `[-90,-10,0]`、左腕 `[-90,32,0]`、右手の位置へ `[2.4,-1,-2]` を加算。
銃側は X=90 と Y=10 を親子の骨に分け、腕の回転を打ち消して水平に向けた。
これにより腕の交差と、this による肩への銃の引き込みを解消した。

RP 1.0.185 を実機で見たユーザーから「銃が太い以外はいい感じ」と確認を得た。
その時点で厚みを2.2にしていたため、元の0.9に戻した RP 1.0.186 を配置した。
厚み以外の姿勢は維持している。

続いて `tools/pve3-rig-editor.py` を実装。ブラウザー側はキーの編集と操作を担当し、
描画は校正した Python の `rig_preview` を共用する。全身のキーフレームを作成し、
Bedrock のアニメJSONへ書き出せる。仕様は `spec/27-rig-editor.md`。

静的検査は `npm run check` と追加ファイルの JSON スキーマ検査で行う。
既存 `pve3_bow.json` は古い attachable スキーマに offscreen 設定を拒まれるため、
追加した銃の検証結果とは分ける。
