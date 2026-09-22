# 独自HPをJSON UIへ渡す（2026-09-10）

参照した一次資料:
- 同梱 `bedrock-samples/resource_pack/ui/hud_screen.json`
- `@minecraft/server/index.d.ts` のScreenDisplay（導入済み2.9系）
- https://learn.microsoft.com/en-us/minecraft/creator/scriptapi/minecraft/server/screendisplay

ScreenDisplayには既存HUDの表示切替とtitle/actionbarの文字列送信がある。
任意のdynamic propertyをJSON UIへ直接公開するAPIはない。
`updateSubtitle`は事前のsetTitleを前提とするので、独立した常時通信としては採用しない。

同梱バニラは`#hud_title_text_string`をglobal bindingとして使用している。
ハートの親は `centered_gui_elements_at_bottom_middle`（幅180）、
`centered_gui_elements_at_bottom_middle_touch`（幅200）、`not_centered_gui_elements`。
ハート原点は下中央profileで親のbottom_leftから[-1,-40]、ポケットでtop_leftから[2,2]。
Health非表示は既存のScript APIで行い、新しいlabelはheart_renderer自体へ追加しない。
親のcontrolsをmodifications/insert_backで拡張することで他のHUDを残す。

JSON UIの結合とバインディングは実際のクライアントが解釈するため、
JSON構造検査とフォントによる配置図だけでは実機表示の成功を保証できない。

## HP増減時の配置

現在HPと最大HPの文字数からバー本数を決めていたため、200→99などの桁境界で
バーの開始位置と総本数が変わっていた。数値とバーを別labelへ分け、数値は右揃え、バーは左揃えにする。
手元の`reference/bedrock-wiki/docs/json-ui/json-ui-intro.md`のString Formatting節では
`('%.39s' * #text)`の長さは文字数ではなくUTF-8バイト数とされる。
§の2バイトを含めて数値欄39バイトに固定し、ASCII空白で埋める。通信をバイト単位で分離するテストを追加する。
実クライアントでの書式解釈・配置は再読み込み後に確認が必要。
