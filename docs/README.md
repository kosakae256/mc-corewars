# docs — このプロジェクトのドキュメント

**ドキュメント駆動開発。** 実装より先にここへ書く。建築も同じ。

## どこに何を書くか

**2026-08-24 に分けた。ワールド固有か、そうでないかで置き場所が違う。**

### ワールド固有 — `worlds/<ワールド名>/docs/`

そのワールドを作るためだけの文書。**ワールドと一緒に持ち運べる**ようにする。

| 場所 | 何を書くか |
| --- | --- |
| `worlds/<名>/docs/*.md` | **ゲームの設計。** 企画・ルール・マップ・中身。**ここが起点** |
| `worlds/<名>/docs/spec/` | そのワールドの技術仕様 |
| `worlds/<名>/docs/decisions/` | そのワールドでの決定記録 |

いま作っているもの: [worlds/core-wars/docs/](../worlds/core-wars/docs/)

### 汎用 — この `docs/`

**どのワールドを作るときにも効く知識。** ワールドを消しても残すべきもの。

| 場所 | 何を書くか | いつ書くか |
| --- | --- | --- |
| [research/](research/) | 技術調査。「そもそもできるのか」 | 作れるか怪しいとき |
| [spec/](spec/) | 実験用ツールの仕様 | 道具を作るとき |
| [imp.md](imp.md) | 実装方針。設計原則・コメント規約 | コードを書く前に読む |

## 順番

```
worlds/<名>/docs/      何を作るか
        ↓
worlds/<名>/docs/spec/ どう作るか
        ↓
実装・建築
```

**上が決まっていないのに下を作らない。**

---

## Core Wars（制作中のワールド）

**ここには置いていない。** [worlds/core-wars/docs/](../worlds/core-wars/docs/) を見ること。

## 技術仕様 (spec)

- [01-mc-tool.md](spec/01-mc-tool.md) — 統合管理ツール `tools/mc.mjs`。BDS の起動/停止/配置、ワールドの取り込み

過去の実験の仕様（記録として保持）:

- [02-llm-chat.md](spec/02-llm-chat.md) — ローカル LLM とのチャット（BDS + ボット）
- [03-terrain-leveling.md](spec/03-terrain-leveling.md) — 整地ボット。複数体を協調させる際の落とし穴が詰まっている
- [04-ws-llm-chat.md](spec/04-ws-llm-chat.md) — 通常ワールドで `/wsserver` を使う方式
- [05-exp-clone.md](spec/05-exp-clone.md) — 分身（ヨルの Fakeout 相当）
- [06-relay.md](spec/06-relay.md) — クライアントと BDS の間のプロキシ

## 技術調査 (research)

- [01-script-api-current-state.md](research/01-script-api-current-state.md) — Script API の現状。v2 が stable、実行文脈、開発環境
- [02-hot-reload.md](research/02-hot-reload.md) — **どこまで `/reload` で済むか。** BDS と通常ワールドの違いも
- [03-bds-and-friend-join.md](research/03-bds-and-friend-join.md) — BDS の導入と、フレンド欄から参加させる方法
- [04-nethernet-client-world.md](research/04-nethernet-client-world.md) — NetherNet でクライアント主催ワールドに繋ぐ話
- [05-simulated-player.md](research/05-simulated-player.md) — 偽プレイヤー `SimulatedPlayer`。生成方法と制約
- [06-worker-entities.md](research/06-worker-entities.md) — 作業ワーカーを作れるか。3方式の使い分け
- [07-player-skin-clone.md](research/07-player-skin-clone.md) — **プレイヤーのスキンを複製できるか。** API 表面の全数調査
- [08-skin-clone-deep-research-brief.md](research/08-skin-clone-deep-research-brief.md) — 上記の深掘り依頼文
- [09-skin-clone-deep-research-result.md](research/09-skin-clone-deep-research-result.md) — その結果。**アドオン範囲では不可能と確定**

## 決定記録

**ワールド固有の決定は、そのワールドの下にある。**
[worlds/core-wars/docs/decisions/](../worlds/core-wars/docs/decisions/)

## 関連（このディレクトリ外）

- `worlds/` — **ワールドごとの一式。** 設計・パックのソース・ワールドデータ
- `addons/` — **実験用のアドオン。** 試作の置き場。ゲーム本体は入れない
- `reference/` — 外部から取得した参照資料。編集しない
- `tools/` — 開発・運営用スクリプト
