# 骨マンの指定スキンと顔差し替え

2026-09-10、ユーザー指定。

- ベース: `user/6404524243.png`（64×64、標準腕幅4）。
- 顔: `user/skin_Slim_White_140114730f7c1147462502569e0559ed.png`（64×64）。
- 顔の正面 `[8,8]` から8×8、および顔に重なる外層の正面 `[40,8]` から8×8だけを
  ドナーからRGBAごとコピーする。元の前髪が差し替えた顔を隠さないよう外層も対応させる。
- それ以外の全画素はベースと一致させる。側頭・後頭・頭頂・顎下・体・手足は変更しない。
- ドナーのSlim体型は採用せず、ベースに合わせた標準人型 `geometry.pve3.humanoid` を使う。
  現在のスケルトン模型ではプレイヤー用スキンの手足・胴のUVと合わないため。
- client entityは専用PNGと人型geometry、`entity_alphatest`へ変更する。
  攻撃・移動アニメーションの参照、弓なし、HP・速度・当たり判定などのBPは保持する。
- 出力 `textures/entity/pve3/boneman_user_v1.png`。入力原稿には書き込まない。
- 再生成: `powershell -ExecutionPolicy Bypass -File tools/pve3-boneman-face.ps1`。
- ピクセル一致の検証と正面・斜め・背面の実データプレビューを行い、全パック検査後に配置する。

## 検証・配置結果

2026-09-10: 顔の128画素はドナーと一致、それ以外の3968画素はベースと一致。
`out/user-skins/boneman-views.png` に3方向の実データ描画を保存。
`npm run check` 全項目合格（82テスト、BP・RP・アニメ参照・pose含む）。
RP **1.0.190** を配置し、配置先のentity・texture・geometry・manifestのハッシュ一致を確認。
ゲーム内での今回の外見確認は未実施。ワールドへの再入場で読み直す。
