# JSON UIによる独自HPゲージ

2026-09-10。PVE-v3の文字バーを赤い画像ゲージへ変更。

2026-09-11追記: 残量を10bitの文字列で送りbool加算してclipへ渡す実装も、修正版を読み込んだ実機では100/100が空表示になった。
数字と所持金表示は正常。式のどの演算またはclip適用が失敗したかは未確定で、Pythonの式評価成功は実機の保証にならない。
PVE-v3はScriptで幅を決め、透過PNGを動的な`#texture` bindingで選ぶ方式へ変更する。
文字列から画像パスを作るだけに絞り、描画側の数値変換を避ける。
画像のtextureとbindingの接続は公式UI要素リファレンス、および同梱hud_screenの`#left_tip_background`→`#texture`接続を参照。

2026-09-11: ユーザーのスクショで満タン時の空表示を確認。`clip_ratio`は残量ではなく切り取る割合（同梱schemaのclip_ratio.json）として扱い、満タン時は0にする。数値はtitleから直接取り出し、残量のみsubtitleから抽出する。実機での再確認は必要。

- 同梱 `bedrock-samples/resource_pack/ui/hud_screen.json` の `full_progress_bar` はimageに `clip_direction: left` と `#clip_ratio` のbindingを使う。
- 文字列の先頭抽出は既存実装でも使っている `%.Ns`。ASCII数字4桁ならバイト境界が安定する。
- 算術による文字列から数値への変換は手元の `reference/bedrock-wiki/docs/json-ui/type-conversion.md` を参照。浮動小数で割って整数除算を避ける。
- layerとUI構造は[公式UI要素リファレンス](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/jsonuireference/examples/jsonuicomponents/ui_element?view=minecraft-bedrock-stable)も確認。
- [公式HUD例](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/ui/hud_screen.json)。画像の合成プレビューはゲームエンジンの描画試験ではない。
