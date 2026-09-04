# 仕様: 設計図（層とモジュール）

> ### **コードを書く前に、ここを見る。**
>
> **新しいモジュールを足すときは、先にこの表へ 1 行足す。**
> **書いてから実装する**（`CLAUDE.md` のドキュメント駆動）。
>
> **層の決まりは [ESLint が機械的に見張っている](11-code-rules.md)**——
> 破ると `npm run check` が落ちる。

## 1. 層は 4 つ。**依存は一方向**

```
features / events        入口。イベント・tick・コマンド
      ↓
services                 土台の振る舞い。Minecraft API に触る
      ↓
state                    永続。dynamic property の読み書きだけ
      ↓
core                     純粋。**Minecraft を知らない**
```

| 層 | 何を置くか | 何を import してよいか |
| --- | --- | --- |
| **core** | **計算と文字列だけ。** テストできる | **何も**（`@minecraft/server` も禁止） |
| **state** | **保存の出し入れ。** 鍵は `state/keys.ts` に集約 | core ／ `@minecraft/server` |
| **services** | **複数の入口から呼ばれる振る舞い。** 「機能」ではない | core ／ state ／ `@minecraft/server` |
| **features** | **入口 1 つ ＝ 1 機能。** `Feature` を 1 つ export する | core ／ state ／ services |
| **events** | **1 つのイベントを購読する場所** | 同上 |

> ### **features どうしは import しない**（[imp.md](../../../../docs/imp.md) 10-4）
>
> **共有したくなったら、それは services か core にあるべきもの。**
> 「弓がダメージを呼ぶ」は**機能が機能を呼んでいる**——**土台へ下ろす。**

## 2. モジュール一覧

**足したらここへ 1 行。** 「状態」は**そのモジュールが持つ可変データ**。

### 2-1. core（純粋）

| モジュール | 責務 | 公開しているもの | 状態 |
| --- | --- | --- | --- |
| `core/damage.ts` | **削る値の計算**（防御率のクランプ） | `finalDamage` / `clampDefense` | 無し |
| `core/bar.ts` | **HP の帯と数字の文字列** | `bar` / `hpNumber` / `barColor` / `SEGMENTS` | 無し |
| `core/plate.ts` | **名札の組み立て** | `plateText` / `PlateParts` | 無し |

**ここは全部テストがある**（`tests/`）。**API を呼ばないので、そのまま Node で回せる。**

### 2-2. state（永続）

| モジュール | 責務 | 公開しているもの | 状態 |
| --- | --- | --- | --- |
| `state/keys.ts` | **動的プロパティの鍵**。**ここでしか決めない** | `KEYS` | 無し |
| `state/hp.ts` | **HP の出し入れ**（実体に紐づく） | `setup` / `has` / `current` / `max` / `setMax` / `damage` / `heal` | 実体側 |
| `state/label.ts` | **表示名の出し入れ** | `setLabel` / `labelOf` | 実体側 |

### 2-3. services（土台）

| モジュール | 責務 | 公開しているもの | 状態 |
| --- | --- | --- | --- |
| `services/combat.ts` | **削る 1 本道。** ここを通らないダメージを作らない | `hit` / `onHit` / `hpOf` / `HitOptions` / `HitInfo` | フックの配列 |
| `services/attack.ts` | **1 発の威力の組み立て**（攻撃力・クリティカル） | `buildShot` / `critRate` / `critMult` / `intervalRate` / 定数 | 無し |
| `services/feedback.ts` | **手応え**（赤く光る・音・ノックバック） | `feedback` / `stepFeedback` | 光っている実体の表 |
| `services/number.ts` | **ダメージの数字**を出す | `popNumber` / `NumberKind` | tick ごとの本数 |
| `services/fx.ts` | **粒と音の見た目**。定義表を持つ | `fx` / `critFx` / `tier` ほか | 無し |

> ### services は**自分から tick を回さない**
>
> **`stepFeedback` のように「毎 tick 進めたい処理」も、関数として出すだけ。**
> **呼ぶのは feature**（`features/damage`）。**輪は 1 本**（[imp.md](../../../../docs/imp.md) 10-1）。

### 2-4. features（入口）

| モジュール | 責務 | tick | commands |
| --- | --- | --- | --- |
| `features/damage/` | **手応えと数字の配線** | `stepFeedback` | `/pve:dmgtest` |
| `features/bow/` | **弓**（撃つ・弾を進める・当てる） | 弾を進める | — |
| `features/mob/` | **モブ**（湧かせる・殴らせる・HP を持たせる） | 殴り・HP の面倒 | `/pve:spawn` `/pve:ally` `/pve:hp` |
| `features/portal/` | **ネザーゲート**（通さない・飾りを敷く） | 押し戻し | `/pve:gate` |
| `features/hud/` | **HP 表示**（名札・アクションバー） | 書き直し | — |

### 2-5. 骨組み

| モジュール | 責務 |
| --- | --- |
| `main.ts` | **合成ルート。** 配線だけ。**ここに処理を書かない** |
| `features.ts` | **登録表。** **並びが tick の順番** |
| `loop.ts` | **スケジューラ。** **`system.runInterval` はここだけ** |
| `types.ts` | `Feature` の宣言 |
| `events/hurt.ts` | **バニラのダメージを打ち消す**（1 イベント 1 購読） |

## 3. 決まりごと（不変条件）

| | |
| --- | --- |
| **ダメージは `services/combat.ts` の `hit()` だけを通る** | **数字が合わないとき、見る場所が 1 つになる** |
| **`system.runInterval` は `loop.ts` だけ** | 順序と負荷が 1 か所で分かる |
| **鍵は `state/keys.ts` だけ** | どこに何が入っているかが grep 不要で分かる |
| **core は `@minecraft/server` を import しない** | **テストできる範囲を、機械的に守る** |
| **1 ファイル 300 行まで** | 超えたら分ける（[imp.md](../../../../docs/imp.md) 10-8） |

## 4. 足すときの手順

**新しい遊び（例: 特殊攻撃）を足すとき。**

1. **この文書の表に 1 行足す**——どの層に何を置くか
2. **計算だけ先に `core/` へ書き、`tests/` を書く**（API が要らない部分）
3. **`services/` に振る舞いを足す**（`hit()` を呼ぶのはここ）
4. **`features/<名>/index.ts` に入口を作り、`features.ts` に 1 行足す**
5. **`npm run check`**——型・lint・層・テストが全部通ってから
6. **`npm run local-deploy`**

> ### 迷ったときの判断
>
> | 問い | 答え |
> | --- | --- |
> | どこに置く？ | **`@minecraft/server` が要るか**——要らなければ `core` |
> | feature か service か | **入口が要るか**（イベント・コマンド・tick）——要らなければ `services` |
> | 2 つの機能から呼びたい | **それは service。** feature から feature を呼ばない |
> | 状態はどこに置く？ | **消えて困るなら `state/`（永続）。** 困らないならモジュール変数でよい |

## 5. まだ直していない所

**分かっていて残しているもの。** 直すときはここを消す。

| | |
| --- | --- |
| **モジュール変数の可変状態** | `bullets` / `firedAt` / `written` などが**プロセスグローバル**。**持ち主とライフサイクルが型に出ていない**。規模が小さいうちは実害が薄いので後回し |
| **`HitOptions` がフラグの袋** | `crit?` `power?` `kind?` の**妥当な組み合わせが型に出ていない**。**判別可能な合併**にしたい |
| **`catch {}` が黙って飲む** | 「実体が消えた」と「本当のバグ」が同じ扱い。**理由つきの `attempt()`** にしたい |
| **読み書きが素通し** | `state/hp.ts` は呼ぶたびに dynamic property を読む。**tick スコープのキャッシュ**は、モブが増えてから |
