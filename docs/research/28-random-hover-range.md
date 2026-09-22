# random_hoverのhover_height形式（2026-09-11）

実機ログ00:18:28で `pve_v3:barrage` が `hover_height: expected an object` により読込失敗。
旧バニラbeeの `[1,4]` を1.26.20の自作定義へそのまま持ち込めない。

同梱 `bedrock-samples/metadata/json_schemas/server/entity/1.26.20/RandomHoverGoalDefinition.json` は `IntRange` のobjectで、整数の`min`と`max`を定義する。
[26.20公式変更履歴](https://feedback.minecraft.net/hc/en-us/articles/45400537384333-Minecraft-Bedrock-Edition-26-20-Changelog)もmin/maxオブジェクトへの変更を明記。
[コンポーネント解説](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_random_hover?view=minecraft-bedrock-stable)の冒頭はrange_min/range_maxと記す一方、表はmin/max。ここは同梱schemaと変更履歴に合わせる。
部品名だけの既存検査では内容の型不一致を検出できなかったため、hover_heightの型・整数・上下限も検査する。
