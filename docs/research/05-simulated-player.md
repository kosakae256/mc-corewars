# 調査: 偽プレイヤーを作る方法（SimulatedPlayer）

> 調査日: 2026-08-22
> 結論: **`@minecraft/server-gametest` の `SimulatedPlayer` が答え。** 公式 API

## 0. 結論

**「任意の名前のボットを、自分のワールドに好きなだけ入れる」は
Script API だけで実現できる。**

```ts
import * as gametest from "@minecraft/server-gametest";

gametest.register("myclass", "mytest", (test) => {
  const bot = test.spawnSimulatedPlayer({ x: 0, y: -60, z: 0 }, "整地くん");
  bot.navigateToLocation({ x: 10, y: -60, z: 10 });
  bot.breakBlock({ x: 10, y: -61, z: 10 });
});
```

外部プログラムも BDS も不要。**アドオン1つで完結する。**

## 1. できること

`SimulatedPlayer` は `Player` を継承し、以下を持つ。

| 分類 | メソッド |
| --- | --- |
| **経路探索移動** | `navigateToLocation` / `navigateToBlock` / `navigateToEntity` / `navigateToLocations` |
| 直線移動 | `moveToLocation` / `moveToBlock` / `move` / `moveRelative` / `stopMoving` |
| **ジャンプ** | `jump` |
| **採掘** | `breakBlock` / `stopBreakingBlock` |
| **設置・使用** | `useItem` / `useItemOnBlock` / `useItemInSlot` / `useItemInSlotOnBlock` / `interactWithBlock` |
| 持ち物 | `giveItem` / `setItem` / `dropSelectedItem` |
| 視線・姿勢 | `lookAtBlock` / `lookAtLocation` / `lookAtEntity` / `rotateBody` / `setBodyRotation` |
| 戦闘 | `attack` / `attackEntity` |
| 移動系 | `fly` / `stopFlying` / `swim` / `stopSwimming` / `glide` / `stopGliding` |
| その他 | `chat` / `respawn` / `disconnect` / `setSkin` / `startBuild` / `stopBuild` |

`breakBlock` は「**壊れるまで殴り続ける**」動作で、
`stopBreakingBlock` を呼ぶかアイテムを使うまで続く。

## 2. 生成のしかた

```
spawnSimulatedPlayer(
  blockLocation: Vector3,
  name?: string,          // 既定 "Simulated Player"
  gameMode?: GameMode     // 既定 0
): SimulatedPlayer
```

**名前もゲームモードも自由に指定できる。**

## 3. 制約（重要）

### 3-1. ~~`Test` インスタンスが要る~~ → **要らない**（2026-08-22 訂正）

> **この節は誤りだった。** `Test` を経由しない生成関数が、
> 同じモジュールの**直下**に用意されている。
> クラスのメンバーだけ見て「無い」と判断したのが原因。
> 詳細は [07-player-skin-clone.md](07-player-skin-clone.md) の 1章・5章。

```ts
// モジュール直下。Test は不要。ワールド座標をそのまま渡せる
export function spawnSimulatedPlayer(
  location: minecraftserver.DimensionLocation,
  name: string,
  gameMode: minecraftserver.GameMode,
): SimulatedPlayer;
```

説明文にも
*"Spawns a simulated player that **isn't associated to a specific Test**"*
と明記されている。`1.0.0-beta.1.26.44-stable` から確認済み。

**これを使うと消えるもの:**

- GameTest の登録（`register()` / `/gametest run`）
- 構造物 `.mcstructure`（`tools/make-empty-structure.mjs`）
- **GameTest 相対座標への変換**（`toRelative`）

#### 従来の方法（`Test.spawnSimulatedPlayer`）

`leveler` はこちらで作られている。

```ts
register(testClassName: string, testName: string, testFunction: (test: Test) => void): RegistrationBuilder
```

`Test` は `gametest.register()` のコールバック引数としてのみ得られ、
登録したテストは **`/gametest run <クラス名>:<テスト名>`** で起動する。

**この方法だと座標が GameTest 相対になる**（実測）。
ワールド座標をそのまま渡すと構造物の展開位置を基準に解釈され、
まったく違う方向へ歩いていく。`leveler` で最も手こずった落とし穴。
モジュール直下の関数を使えばこの問題自体が発生しない。

### 3-2. beta モジュール

`@minecraft/server-gametest` は **stable 版が存在しない**。

```
1.0.0-beta.1.26.50-preview.26
```

ワールドで「Beta APIs」実験トグルが必要。

> Bedrock Wiki の記述:
> 「最古のモジュールなのに、stable 版が1つも存在しない」

### 3-3. restricted execution では呼べない

`spawnSimulatedPlayer` は restricted execution で使えない。
`before` イベントやカスタムコマンドのコールバックから直接呼べないので、
`system.run()` で逃がす。

## 4. 実在する応用例

**Understudy**（CurseForge / MCPEDL）というアドオンが、
まさにこの API で偽プレイヤーを実現している。

- `/simplayer:join <名前>` で生成、`/simplayer:leave <名前>` で退場
- **無制限に生成できる**と明記
- 農場の AFK、チャンクの読み込み、撮影用の配置などに使われている
- **周囲に mob が通常どおりスポーンする**（＝プレイヤーとして扱われる）

同種のものに StarBot がある。

## 5. 遠回りの記録

**この API に辿り着く前に、3つの方向を試して全て失敗した。**
同じ道を辿らないために残す。

| 試したもの | 結果 | 原因 |
| --- | --- | --- |
| `minecraft:npc` エンティティ | ✗ | 見た目だけの置物。歩かない、プレイヤー一覧に出ない、チャットしない |
| `bedrock-protocol` で自作ボット（BDS） | △ | 接続・チャットはできたが、**`player_auth_input` を送っても移動しなかった** |
| NetherNet で通常ワールドに接続 | △ | 接続は成功。だが**Xbox Live 認証が必須**で、`offline: true` は `not_authenticated` で切断。**1体につきアカウント1つ必要**になり「入れ放題」が原理的に不可能 |

### 反省

**`reference/` にローカル取得済みの公式ドキュメントを先に調べるべきだった。**

`reference/minecraft-creator-docs/creator/ScriptAPI/minecraft/server-gametest/`
に `SimulatedPlayer.md` が最初から存在していた。
Web で外部事例を探す前に、手元の一次情報を当たるべきだった。

`CLAUDE.md` の「調べ物の優先順位」にもそう書いてある:

> 1. `addons/<名前>/node_modules/@minecraft/server/index.d.ts`
> 2. `reference/minecraft-creator-docs/creator/Documents/`
> 3. `reference/bedrock-samples/behavior_pack/`
> 4. `reference/bedrock-wiki/docs/`
> 5. Web

**ScriptAPI ディレクトリを見落としていた。** 優先順位2は
`Documents/` だけでなく `ScriptAPI/` も含めて読むべき。

## 6. BDS 方式との比較

| | `SimulatedPlayer` | `bedrock-protocol` ボット（BDS） |
| --- | --- | --- |
| 必要なもの | **アドオンだけ** | BDS + 外部 Node プロセス |
| 任意の名前 | **可能** | 可能（`online-mode=false`） |
| 台数 | **無制限** | 無制限 |
| 通常ワールドで動くか | **動く** | 動かない |
| 経路探索 | **標準装備** | 自作が必要（未達） |
| 採掘・設置 | **標準装備** | 自作が必要（未達） |
| LLM 連携 | 別途 `server-net` が要る（BDS 限定） | Node 側で自由 |
| 安定性 | 公式 API（ただし beta） | 非公式ライブラリ依存 |

**用途で使い分ける:**

- **ワールド内で動く偽プレイヤー** → `SimulatedPlayer`
- **外部サービスと連携する常駐ボット** → BDS + `bedrock-protocol`

いま動いている `cat`（LLM チャット）は後者のままでよい。
整地ボットは前者で作る。

## 7. 未検証

- [ ] GameTest の実行が終わると SimulatedPlayer は消えるか
- [ ] `maxTicks` をどこまで延ばせるか
- [ ] 空の構造ファイル（`.mcstructure`）の作り方
- [ ] SimulatedPlayer がチャンクを読み込ませるか
- [ ] 通常ワールド（クライアント）とBDSの両方で動くか
