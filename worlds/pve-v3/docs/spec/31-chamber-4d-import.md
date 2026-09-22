# チェンバーの自作4Dスキン移植

ユーザー指定元: `C:/Users/kosaka256/Documents/4d/使用データ/originalAAAA=`。
`skins.json` で `chen.png` を参照する `chen` と `chen_armor` は `geometry.chen`。
同じPNGを参照する `chen_arm` は `geometry.chen_arm` だが、提供されたgeometry.jsonに定義がない。
画像で示された通常姿の再現には、存在する `geometry.chen` を採用する。

geometry.json全体は約26.8MB。全文をコンテキストへ出力せず、Pythonで読み取り、
参照一致したモデルだけ抽出する。他の22モデルは取り込まない。
該当モデルは17ボーン・694cubeで、右腕に銃を含む683cubeがある。

- 原稿PNGはバイト単位でそのまま `chamber_user_4d_v1.png` に複製。
- geometryの旧形式メタデータを現行RP形式へ包み直す。
- 識別子を `geometry.pve3.chamber.user4d` とし、64×64のUV基準、bounds、
  全ボーン、親子、pivot、cube座標・UV・inflateを変更せず保持する。
- 右腕の銃も模型そのものに含まれるため別銃アイテムは加えない。
- client entityの模型とテクスチャのみ切り替え、既存の攻撃・移動・照準ロジックを保持。
- 元フォルダへは書き込まない。抽出元と出力のSHA256と骨格一致検査を記録する。
- 正面・斜め・背面の実データ描画を提示し、ユーザーの4Dスキン画面と比較する。
  表情・照明・ゲーム中の姿勢はスクリーンショットと異なりうるため、実機の完全一致は別途確認。

再生成: `python tools/pve3-chamber-import.py`。

2026-09-10: 抽出ファイル251,494バイト。全ボーン・cubeの構造一致とPNGのSHA256一致を検証。
報告は `user/chamber-import/report.json`、実データ画像は `out/user-skins/chamber-views.png`。
提供された画像の顔・衣装・右手の金色の銃をプレビューでも確認した。
RP1.0.189へ配置済み。ゲーム内での照明・姿勢を含む最終確認は未実施。
