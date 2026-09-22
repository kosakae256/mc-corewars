# 散弾の定義を画像で検証する（2026-09-10）

ユーザー依頼: マイクラの現在の散弾と、同じデータを読むツールの表示を比較し、
一致を確認してから持ち方を調整する。現在の腕・銃の定義は照合中に変更しない。

## 入出力

- `python tools/pve3-rig-preview.py`。Python、NumPy、Pillow を使う。
- RP の client entity から geometry・texture・animation の参照を解決する。
  銃は attachable の geometry・texture・装備時 animation を読む。
- 対象は銃装備済み、構えへの遷移完了、直立・停止・通常状態の散弾。
  頭の視線は比較用パラメーターで指定する。ゲーム全体の Molang・状態機械の再実装ではない。
- 数値および `数値 - this` の静的チャンネルを評価する。未対応の式はエラーにする。
  `this` の位置は親からの初期相対位置を含む現在値として評価する。
  別名やアニメの選択と、省略する動的処理は出力のレポートに明示する。
- 骨の親子関係・pivot・回転・位置・scale、cube の回転・inflate、
  box UV / per-face UV、PNG の透明画素を扱い、画素ごとの奥行きで隠面を判定する。
- 画像は正面・側面・両斜め・上方から出す。カメラを指定した透視投影にも対応する。
  入力ファイルの SHA-256 を記録し、配置済み RP と照合できるようにする。

## 校正

手と握りの点の距離が近いだけでは合格にしない。以前の簡易プレビューは
テクスチャ・奥行き・衣服層を省略しており、腕の交差や肩への食い込みを十分確認できなかった。

現在の不自然な重なりも含めてマイクラと並べ、肩・腕の輪郭、肌と袖の境界、
銃口・銃床の方向、銃と手の位置関係を照合する。カメラや光源による差と
模型の変換の差を区別する。一方向の類似だけで全機能を保証したとは扱わない。
不一致があれば先にツールの仮定と計算を調べ、散弾の定義を変更して辻褄を合わせない。

ワールドの光源・影・HUD・名前・エンジンの動的アニメは再現範囲外。
出力は開発用画像であり、実機スクリーンショットと明記して混同させない。

## 実行例と確認結果

```powershell
python tools/pve3-rig-preview.py
python tools/pve3-rig-preview.py --compare-rp "$env:APPDATA/Minecraft Bedrock/Users/Shared/games/com.mojang/development_resource_packs/pve_v3"
python -m unittest discover -s tools/rig_preview -p test_preview.py
```

通常の出力は `out/shotgun-rig/current/views.png` と `report.json`。
`--single --yaw -40 --pitch 12` でカメラを指定できる。
`--time 0.5` で、編集ツールから保存したキーフレームの0.5秒時点も描画できる。
`--distance 80 --fov 27.5` は透視投影（モデル単位での距離、画角は度）。
`--reference <実機PNG> --crop <左> <上> <右> <下>` を併用すると、
実機の切り抜きとツールの画像を `comparison.png` に並べる。
実機画像へ施すのは切り抜きと最近傍拡大のみ。模型を画像処理で変形しない。

再読み込み後の実機と、斜め・ほぼ正面の2方向で校正した。
初版ツールは銃が手先に出ていたが、`this` に初期相対位置を含める修正によって、
実機と同じ肩寄りに出た。腕の交差、袖の位置、銃と肩の位置関係を再現できた。
比較画像は `out/shotgun-rig/calibration-side/comparison.png` と
`out/shotgun-rig/calibration-front/comparison.png`。カメラは目視推定で、
光源・色調・頭の動的視線などは一致させていない。画素の完全一致や
歩行・別の装備など未検証状態までの正しさは保証していない。

この校正作業で RP の模型・アニメ・テクスチャは変更していない。
銃の位置指定 `数値 - this` は手からの微調整ではなく、初期相対位置を消す。
今後の構え調整ではここも直す必要がある。
