/**
 * ジェネレータ。**置かれたブロックの上に資源を湧かせる。**
 *
 * ルールは `docs/01-rules.md`。
 *
 * ## 位置を設定に持たない
 *
 * **ワールドに置かれたブロックそのものを正とする**（`docs/01-rules.md`）。
 * 座標を設定ファイルに書くと、動かすたびに両方直すことになり、必ずズレる。
 *
 * 目印は**独自ブロック**にしてある（`game:map_parts_gold_block` など）。
 * バニラの金ブロックは**プレイヤーが持ち込んだもの**なので目印ではない。
 * **区別が付くので、誰かが金ブロックを置いても湧き口が増えない。**
 *
 * ## 再走査
 *
 * 探すのは**起動時と `/game:regen` のときだけ。**
 * 毎 tick 探すと重いし、目印は試合中に動かないので必要ない。
 *
 * `docs/01-rules.md` の「`/reload` で再走査し、明示的に報告する」に従い、
 * **見つけた数を必ず出す。** 黙って 0 個だと、湧かない理由が分からない。
 */

import {
  system,
  world,
  ItemStack,
  CommandPermissionLevel,
  CustomCommandStatus,
  Player,
  type Vector3,
  type Dimension,
  type CustomCommandOrigin,
  type CustomCommandResult,
  type CustomCommandRegistry,
} from "@minecraft/server";

import { DebugText, debugDrawer } from "@minecraft/debug-utilities";

import { isRunning } from "../../lib/match-state.js";
import { ARENAS } from "../../lib/arena.js";
import { reportTo } from "../../lib/op.js";

/**
 * 目印のブロック → 湧くもの と 間隔（tick）。
 *
 * **拠点は安い資源が速く、中央は高い資源が遅い**（`docs/01-rules.md`）。
 * 中央を奪い合う理由がこの差から生まれる。
 */
interface Spawner {
  readonly item: string;
  readonly intervalTicks: number;
  /** 頭上に出す名前 */
  readonly label: string;
  /** 頭上に出す色 */
  readonly color: { red: number; green: number; blue: number; alpha: number };
}

const WHITE = { red: 1, green: 1, blue: 1, alpha: 1 };
const YELLOW = { red: 1, green: 0.85, blue: 0.2, alpha: 1 };
const CYAN = { red: 0.4, green: 0.9, blue: 1, alpha: 1 };
const GREEN = { red: 0.3, green: 1, blue: 0.4, alpha: 1 };

const GENERATORS: ReadonlyMap<string, Spawner> = new Map([
  ["game:map_parts_iron_block", { item: "minecraft:iron_ingot", intervalTicks: 30, label: "鉄", color: WHITE }],
  ["game:map_parts_gold_block", { item: "minecraft:gold_ingot", intervalTicks: 120, label: "金", color: YELLOW }],
  ["game:map_parts_diamond_block", { item: "minecraft:diamond", intervalTicks: 600, label: "ダイヤ", color: CYAN }],
  [
    "game:map_parts_emerald_block",
    { item: "minecraft:emerald", intervalTicks: 900, label: "エメラルド", color: GREEN },
  ],
]);

/**
 * 探す範囲。**3 つの島だけ。**
 *
 * マップ全体を1つの箱で囲うと 300 万マスになり、走査に 1 分以上かかる。
 * 島は離れているので、**島ごとに箱を分ける**と 35 万マスまで落ちる。
 *
 * 座標は `docs/02-map.md` 2-C から。高さは地面の上下だけに絞ってある
 *（ジェネレータは地面か 2 階に置かれ、地中や空中には無い）。
 */
interface Box {
  readonly min: Vector3;
  readonly max: Vector3;
}

/**
 * 探す範囲。**島の箱そのまま。**
 *
 * 高さを戦闘範囲まで広げる案は取り下げた（2026-08-25）。
 * **ジェネレータは島の上にしか無い**ので、広げても走査が増えるだけ。
 *
 * 数が合わなかったのは範囲ではなく、
 * **読み込みが間に合っていない場所を「無い」と数えていた**ため
 *（`unreadable` の説明）。
 */
const SCAN_BOXES: readonly Box[] = ARENAS[0].islands;

/**
 * 直前の走査で読めなかったマス数。
 *
 * **0 でなければ、その走査は信用できない。**
 * 読み込みが間に合っていないだけなので、待ってやり直す。
 */
let unreadable = 0;

/** 直前の走査は完全だったか */
export function scanWasComplete(): boolean {
  return unreadable === 0;
}

/** 1 tick あたりに見るマス数（watchdog 対策。docs/imp.md 5.3） */
const PER_TICK = 2048;

/**
 * 同じ場所に溜まりすぎないための上限。
 *
 * **拾われずに積み上がると、後から来た人が一気に総取りできてしまう。**
 * 一定数を超えたら湧かせない。
 */
const MAX_STACKED = 48;

interface Found {
  /** 目印のブロックそのものの位置。**設置禁止の判定に使う** */
  readonly block: Vector3;
  readonly at: Vector3;
  readonly spawner: Spawner;
  /** 次に湧かせる tick */
  next: number;
  /** 頭上の表示。作り直すときに消すので持っておく */
  label: DebugText | undefined;
  /** いま出している文字。**変わったときだけ作り直す**ため */
  labelText: string | undefined;
}

const found: Found[] = [];
let scanning = false;

/**
 * **ジェネレータの真上を塞げないようにする範囲か。**
 *
 * 目印の**上 4 マス**と、**その周り 1 マス（斜めを含む）**。
 * つまり目印を中心にした 3 x 3 の柱が、上へ 4 マス。
 *
 * ## なぜ塞げないようにするのか
 *
 * **湧いた資源が取れなくなる。**
 * 目印の上を埋められると、アイテムが出る場所が無くなるか、
 * 壁の中に閉じ込められて拾えなくなる。
 *
 * 中央のジェネレータを塞ぐのは、**相手の資源を止める嫌がらせ**として
 * 強すぎる。壊せば済む話にしない。
 */
export function blockedByGenerator(x: number, y: number, z: number): boolean {
  for (const g of found) {
    const b = g.block;
    if (x < b.x - 1 || x > b.x + 1) continue;
    if (z < b.z - 1 || z > b.z + 1) continue;
    if (y < b.y + 1 || y > b.y + 4) continue;
    return true;
  }
  return false;
}

/** 目印ブロックそのものの位置。**設置禁止の掃除で使う** */
export function generatorBlocks(): readonly Vector3[] {
  return found.map((g) => g.block);
}

/** いくつ見つかっているか。**診断用** */
export function generatorCount(): number {
  return found.length;
}

/** 見つけた数を種類ごとに数える */
function summary(): string {
  const count = new Map<string, number>();
  for (const g of found) count.set(g.spawner.item, (count.get(g.spawner.item) ?? 0) + 1);
  if (count.size === 0) return "§cジェネレータが 1 つも見つかりません";
  const parts = [...count.entries()].map(([item, n]) => `${item.replace("minecraft:", "")} x${n}`);
  return `§aジェネレータ ${found.length} 個 §7(${parts.join(" / ")})`;
}

function* scanJob(report: Player | undefined): Generator<void, void, void> {
  const dim = world.getDimension("overworld");
  // **古い表示を消してから作り直す。** 消さないと幽霊が残る
  clearLabels();
  found.length = 0;
  let seen = 0;
  // **読めなかったマスを数える。**
  //
  // 読み込みが間に合っていない場所を「何も無い」と数えると、
  // **`/reload` のたびに違う数が出る**（2026-08-25 の指摘）。
  // **部分的な結果は結果ではない。**
  unreadable = 0;

  for (const box of SCAN_BOXES) {
    for (let x = box.min.x; x <= box.max.x; x++) {
      for (let y = box.min.y; y <= box.max.y; y++) {
        for (let z = box.min.z; z <= box.max.z; z++) {
          if (++seen % PER_TICK === 0) yield;
          try {
            const b = dim.getBlock({ x, y, z });
            if (b === undefined) {
              unreadable++;
              continue;
            }
            const spawner = GENERATORS.get(b.typeId);
            if (spawner === undefined) continue;
            // **湧く場所は目印の1つ上。** 目印の中に湧かせても取れない
            // **ブロックの中心の真上に出す。**
            // 座標をそのまま渡すと角に湧いて、隣のマスへ散らばる。
            // +0.5 で中心に寄せ、y は少し浮かせて床にめり込ませない
            found.push({
              block: { x, y, z },
              at: { x: x + 0.5, y: y + 1.1, z: z + 0.5 },
              spawner,
              next: 0,
              label: undefined,
              labelText: undefined,
            });
          } catch {
            // **読めなかった。** この走査は信用できない
            unreadable++;
          }
        }
      }
    }
  }

  scanning = false;
  const msg = summary();
  // **誰にも頼まれていない自動の探索で、0 個のときは黙る。**
  //
  // 自動の探索は 10 秒ごとに回るので、
  // **出すと同じ警告が延々と流れる**（2026-08-24 の指摘）。
  // 頼まれたとき（`/game:regen`）は 0 個でも必ず出す
  if (report === undefined && found.length === 0) return;
  // **必ず知らせる。** 黙って 0 個だと、湧かない理由が分からない
  reportTo(report, msg);
}

/** 走査を始める */
export function rescan(report: Player | undefined): void {
  if (scanning) return;
  scanning = true;
  // **走査が途中で死んでも詰まらないように、上限で必ず解除する。**
  // これが無いと、一度失敗しただけで二度と走査できなくなる
  system.runTimeout(() => {
    scanning = false;
  }, 600);
  system.run(() => {
    system.runJob(scanJob(report));
  });
}

/** やり直す回数の上限 */
const MAX_RETRY = 10;

/** やり直す間隔（tick）。チャンクが読み込まれるのを待つ */
const RETRY_TICKS = 60;

/**
 * **見つかるまでやり直す。**
 *
 * ティッキングエリアを張った直後は、まだチャンクが読み込まれていない。
 * すぐ走査すると 0 個になり、**そのあと一生湧かない。**
 *
 * 一定回数で諦め、**諦めたことを必ず報告する。**
 * 黙って 0 個で進むと、湧かない理由が分からなくなる。
 */
export function rescanUntilFound(report: Player | undefined, attempt = 1): void {
  // **いつでも探せる**（2026-08-24 変更）。
  //
  // ティッキングエリアを張りっぱなしにしたので、
  // 非開始中でもチャンクは読み込まれている
  rescan(report);
  system.runTimeout(() => {
    // **数が揃っていても、読めない場所があればやり直す。**
    // 部分的な結果を答えにすると、reload のたびに数が変わる
    if (found.length > 0 && scanWasComplete()) return;
    if (attempt >= MAX_RETRY) {
      const msg =
        found.length > 0
          ? `§eジェネレータ ${found.length} 個（§c読めない場所が ${unreadable} マス残っています§e）`
          : "§cジェネレータが見つかりません。§7ティッキングエリアと lib/arena.ts の範囲を確認してください";
      reportTo(report, msg);
      return;
    }
    rescanUntilFound(report, attempt + 1);
  }, RETRY_TICKS);
}

// ---------------------------------------------------------------- 頭上の表示
/**
 * ジェネレータの頭上に、種類・落ちている数・次の秒数を出す。
 *
 * ## なぜモブを置かないのか
 *
 * 昔から使われてきた手は「見えないモブに名札を付ける」だった。
 * だが**モブは重いし、押せるし、湧き潰しにも影響する。**
 *
 * `@minecraft/debug-utilities` の `DebugText` は
 * **実体を持たない文字だけの表示。** 当たり判定も物理も無い。
 * ジェネレータの案内にはこちらが向いている。
 *
 * > **beta モジュール。** `manifest.json` に依存を書いてある
 * > （`CLAUDE.md` の「使う beta API は docs に記録する」に従い、
 * >  `docs/spec/11-match.md` にも記す）。
 */
const LABEL_HEIGHT = 2.0;

/**
 * 表示を見直す間隔（tick）。
 *
 * **`runInterval` の周期そのもの。** 中で tick を割って判定しない。
 * 割ると開始位置によっては一度も成立しない（実際に表示が出なくなった）。
 */
const LABEL_INTERVAL = 5;

/**
 * 表示を出す距離（マス）。
 *
 * **遠くのものまで出すと画面が文字だらけになる。**
 * マップの端から端まで見えてしまい、どれが近いのか分からない。
 *
 * 近くにあるものだけ出せば、**必要なときにだけ目に入る。**
 */
const LABEL_RANGE = 16;

/**
 * **寿命を付けない。**
 *
 * `timeLeft` を省くと**無期限**になる（省略時は寿命なし）。
 *
 * 寿命を付けると「次の更新が来る前に消える」経路ができ、
 * **見えたり見えなかったりする。** 実際にそうなった。
 *
 * 消すのは**こちらが明示的に消すときだけ**にする。
 *
 * - 範囲外になった → `dropLabel`
 * - 走査し直した → `clearLabels`
 * - 読み直した → `debugDrawer.removeAll()`
 *
 * **消し忘れの経路が無いので、無期限で困らない。**
 */

/** すべての表示を消す */
function clearLabels(): void {
  for (const g of found) dropLabel(g);
}

/** 落ちている数を数える */
function droppedCount(dim: Dimension, at: Vector3): number {
  try {
    const items = dim.getEntities({ location: at, maxDistance: 2, type: "minecraft:item" });
    let n = 0;
    for (const e of items) {
      const c = e.getComponent("minecraft:item");
      n += c?.itemStack.amount ?? 1;
    }
    return n;
  } catch {
    return 0;
  }
}

/** どこかのプレイヤーの近くにあるか */
function nearAnyPlayer(at: Vector3, players: readonly { location: Vector3 }[]): boolean {
  for (const p of players) {
    const dx = p.location.x - at.x;
    const dy = p.location.y - at.y;
    const dz = p.location.z - at.z;
    if (dx * dx + dy * dy + dz * dz <= LABEL_RANGE * LABEL_RANGE) return true;
  }
  return false;
}

/** 1 つぶんの表示を消す */
function dropLabel(g: Found): void {
  if (g.label === undefined) return;
  try {
    debugDrawer.removeShape(g.label);
  } catch {
    /* 既に消えている */
  }
  g.label = undefined;
  g.labelText = undefined;
}

/** 表示を書き換える */
function updateLabels(dim: Dimension, tick: number): void {
  const players = world.getAllPlayers();
  const running = isRunning();
  for (const g of found) {
    // **近くに誰も居なければ出さない。** 出ていたら消す
    if (!nearAnyPlayer(g.at, players)) {
      dropLabel(g);
      continue;
    }
    const left = Math.max(0, Math.ceil((g.next - tick) / 20));
    const dropped = droppedCount(dim, g.at);
    // **短く出す。** 頭上の文字が長いと、隣のジェネレータの表示と重なって読めない。
    // 「種類 落ちている数 / 次の秒数」だけあれば足りる。
    // 見出しを付けなくても、位置と並びで何の数字かは分かる
    //
    // 止まっているときは秒数を出さない。**進まない秒数を出しても嘘になる**
    const text = running ? `${g.spawner.label} §7${dropped} §8/ §7${left}s` : `${g.spawner.label} §7${dropped}`;

    // **文字は後から変えられない**（`text` は読み取り専用）。
    // 中身が変わったら作り直す。1 秒に 2 回なので、作り直しでも問題ない
    // ---- 文字が同じなら作り直さない
    //
    // **作り直すと一瞬消える。** それがちらつきの正体だった。
    // `text` は読み取り専用なので書き換えられないが、
    // **`timeLeft` は書き換えられる。** 寿命を延ばすだけなら消えない
    if (g.label !== undefined && g.labelText === text) continue;

    // ---- 文字が変わった。**先に新しいものを出してから、古いものを消す**
    //
    // 逆にすると、消してから出すまでの 1 フレームだけ何も無い状態ができる
    const old = g.label;
    const shape = new DebugText({ x: g.at.x, y: g.at.y + LABEL_HEIGHT, z: g.at.z }, text);
    shape.color = g.spawner.color;
    // **timeLeft は設定しない。** 無期限にする（上のコメント参照）
    debugDrawer.addShape(shape, dim);
    if (old !== undefined) {
      try {
        debugDrawer.removeShape(old);
      } catch {
        /* 既に消えている */
      }
    }
    g.label = shape;
    g.labelText = text;
  }
}

/**
 * 湧かせる処理を始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function startGenerators(): void {
  // ---- **見失っていたら、自力で取り戻す**
  //
  // ジェネレータの位置はメモリにしか無いので、`/reload` で消える。
  // 読み込み時に探し直してはいるが、
  // **そのとき何らかの理由で 0 個だと、そのまま止まったままになる。**
  // 実際に「reload するとジェネレータが止まる」が再発した。
  //
  // 原因を 1 つずつ潰すより、**気づいて勝手に直る**ほうが確実。
  // 10 秒ごとに見て、0 個なら探し直す。
  //
  // > 見つかっているときは `found.length` を見るだけ。**費用はほぼゼロ。**
  system.runInterval(() => {
    // **数が揃っていて、かつ全部読めているときだけ休む**
    if ((found.length > 0 && scanWasComplete()) || scanning) return;
    rescan(undefined);
  }, 200);

  // **前の読み込みで出した表示を消す。**
  // `/reload` すると古いスクリプトが出した文字だけが残り、
  // こちらからは掴めない「幽霊」になる。まとめて消してから作り直す
  try {
    debugDrawer.removeAll();
  } catch {
    /* 何も無ければそれでよい */
  }

  system.runInterval(() => {
    if (found.length === 0) return;
    const dim = world.getDimension("overworld");
    const tick = system.currentTick;

    // **表示は試合中でなくても出す。**
    // 以前は試合中だけにしていたが、準備中こそ
    // 「どこに何のジェネレータがあるか」を見たい
    // **間隔は runInterval が決めている。** ここで tick を割らない。
    //
    // 以前は `tick % LABEL_INTERVAL === 0` と書いていたが、
    // **5 tick ごとに動く処理の中で「5 で割り切れる tick」を要求していた。**
    // 開始位置が 5 の倍数でなければ一度も成立せず、表示が出なかった
    updateLabels(dim, tick);

    // **湧くのは試合中だけ。** 準備中に資源が積み上がっても困る
    if (!isRunning()) return;

    for (const g of found) {
      if (tick < g.next) continue;
      g.next = tick + g.spawner.intervalTicks;
      try {
        // **溜まりすぎていたら湧かせない。** 総取りを防ぐ
        const near = dim.getEntities({
          location: g.at,
          maxDistance: 2,
          type: "minecraft:item",
        });
        if (near.length >= MAX_STACKED) continue;
        const e = dim.spawnItem(new ItemStack(g.spawner.item, 1), g.at);
        // **投げる勢いを消す。** 消さないと勝手に転がって散らばる
        e.clearVelocity();
      } catch {
        /* 読み込まれていない。次の機会に */
      }
    }
  }, LABEL_INTERVAL);
}

function playerOf(origin: CustomCommandOrigin): Player | undefined {
  const e = origin.sourceEntity;
  return e instanceof Player ? e : undefined;
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerGeneratorCommands(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:regen",
      description: "ジェネレータを置きなおしたあと、位置を探し直す",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      rescan(playerOf(origin));
      return { status: CustomCommandStatus.Success, message: "探し直しています…" };
    }
  );
}
