# 遠距離モブの接近停止（2026-09-10）

## 実機からの追加報告と採用方式

within_radiusを100へ変更しても、ランダム歩行のようになり遠い時は接近しないとのユーザー報告。
半径調整だけでは期待する継続追跡にならなかった。
既存spec/25の14章・spec/24の11章にある、ダメージ0のmelee_box_attackによる追跡を採用する。
同梱のゾンビ・ピグリンなどと同じ継続追跡で、track_targetをtrueにする。
公式資料: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_melee_box_attack
`track_target`は固有の感知機能がない場合も標的を追跡し、`require_complete_path: false`は
標的までの完全な経路を必須にしない。射撃可能位置での停止は引き続きScriptの担当。

## 直前の調査記録

妖狐を含む共通接近は`minecraft:behavior.move_towards_target`を使用し、
`within_radius: 1`だった。ユーザーは攻撃できない位置での停止を実機で確認。
停止判断自体は射程外・遮蔽時にseekを返すため、その先のBP接近設定を修正する。

参照した一次資料:
- `bedrock-samples/behavior_pack/entities/iron_golem.json`: 同じ接近部品に半径32を指定。
- `bedrock-samples/documentation/Entities.html`: 同部品は取得済みのtargetを必要とする。
- https://learn.microsoft.com/en-us/minecraft/creator/reference/content/entityreference/examples/entitygoals/minecraftbehavior_move_towards_target

公式のwithin_radiusの説明は目標からの距離と表現されている。
エンジン内部の判定条件を自動テストから観測したわけではないため、
「1マスを超えた瞬間に必ず起動しない」と断定はしない。
本実装では索敵と同じ100にし、攻撃可能位置での停止はScriptで明示的に制御する。
さらに、停止した経路を2秒ごとに再探索できるよう接近部品を再追加する。
ロジック・BP整合性テストと、実機での経路探索確認は区別する。
