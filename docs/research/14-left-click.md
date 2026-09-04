# 左クリック（腕の振り）を拾う

**結論：拾える。** `world.afterEvents.playerSwingStart` が **空振りでも飛ぶ**
（2026-09-01・Bedrock 1.26.44 実機で確認）。

> ### 昔の回り道は要らない
>
> 以前は「アニメーションコントローラーで `query` を見て、コマンドでタグを付ける」
> という遠回りが必要だった。**Script API v2 に専用のイベントがある。**

## 何が取れるか

```ts
world.afterEvents.playerSwingStart.subscribe((ev) => {
  ev.player;          // 誰が
  ev.swingSource;     // なぜ（EntitySwingSource）
  ev.heldItemStack;   // 何を持って（手ぶらなら undefined）
});
```

| `swingSource` | いつ |
| --- | --- |
| **`Attack`** | **左クリック。空振りでも飛ぶ**（何も無い所を殴っても出る） |
| `Mine` | 掘る |
| `Build` | 置く |
| `Interact` | 触る |
| `UseItem` | 使う |
| `DropItem` / `ThrowItem` / `Event` / `None` | 落とす／投げる／その他 |

**`Attack` だけを見れば、採掘や設置と混ざらない。**

## 何に使えるか

**左クリック＝スキル発動**（`worlds/pve-v2/docs/decisions/2026-09-01-build-axes.md` 3-1）。
**ため・右クリック・アイテム消費を使わずに、もう 1 系統の操作が増える。**

## 注意

- **after イベントなので止められない**（振り自体は打ち消せない）。
  攻撃モーションは出る前提で組む。
- **連打すると毎回飛ぶ。** 再使用時間は**こちらで持つ**。
- 確認用の機能を `worlds/pve-v2/packs/pve_v2/scripts/features/swing/` に置いてある
  （`/pve:swing` で入／切）。**スキルができたら消す。**
