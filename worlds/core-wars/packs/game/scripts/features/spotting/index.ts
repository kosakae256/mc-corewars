/**
 * 見られていると光る。
 *
 * 仕様は `docs/spec/15-presentation.md` 7-3。
 *
 * ## 地図の代わり
 *
 * 名前を消したので、**相手の位置を知る手がかりが無くなった。**
 *
 * だが「見ている方向に居るなら見えている」のは自然な話で、
 * **壁越しに分かるわけではない。**
 *
 * 探す行為に意味を残しつつ、**見つけた相手を見失わないようにする。**
 *
 * ## どうやって見せるか
 *
 * **光らせるのはやめた**（2026-08-25）。
 * `glowing` 効果は Bedrock に無く、殻をかぶせる手は壁を越えない。
 *
 * **相手の頭上に名前と残量を出す**（`marker.ts`）。
 * `DebugText` は壁越しに描けて、**見せる相手も選べる。**
 *
 * ここが持つのは「誰が誰に見つかっているか」だけで、
 * **見せ方は `marker.ts` が決める。**
 */

import { system, world, type Player, type Vector3 } from "@minecraft/server";

import { isRunning, teamOf } from "../../lib/match-state.js";
import { clearSpotted, isSpotted } from "../cosmetic/index.js";
import { refreshMarks } from "./marker.js";
import { isSpectating } from "../death/index.js";
import { droneMuzzle } from "../drone/index.js";

/**
 * 視界とみなす角度（度）。**視点から左右 60 度。**
 *
 * **狭めない**（2026-08-25 に 45 度へ狭めて、戻した）。
 * 画面の外まで含んでいるように見えるが、**実際の遊びでは合っている。**
 * 広すぎたのは角度ではなく、**遮蔽の当て方**だった（`hasLineOfSight`）。
 */
const HALF_ANGLE = 60;

/**
 * 狙う高さ（マス）。**足元から胴のあたり。**
 *
 * 頭を狙うと、**壁の上に頭だけ出ていれば通ってしまう。**
 */
const CHEST = 1.0;

/**
 * 相手の手前で止める距離（マス）。
 *
 * **ごくわずかにする**（2026-08-25 修正）。
 *
 * 0.5 にしていたので、**近いほど壁を飛び越していた。**
 * 距離 2 マスで 0.5 引けば、**厚さ 1 マスの壁がまるごと範囲外**になる。
 * 「壁に近いほど見えやすい」の正体はこれ。
 *
 * 狙う先は相手の胴——**そこは空気**なので、そもそも長く切る必要が無い。
 * 終点ちょうどのマスを拾わないためだけの余裕にする。
 */
const BACKSTOP = 0.05;

/**
 * 見え続けた時間（tick）。**0.2 秒**（2026-08-25 変更）。
 *
 * 0.5 秒では**見つけたのに出ない**間が長かった。
 * 一瞬よぎっただけで出さないための下限なので、**短くてよい。**
 */
const HOLD_TICKS = 4;

/** 見張る間隔（tick）。**細かく見ないと 0.5 秒を測れない** */
const INTERVAL = 2;

/**
 * どこまで見つけられるか（マス）。**30。**
 *
 * 80 にしていたが、**遠すぎた**（2026-08-25 変更）。
 * マップの向こう端に居る相手まで暴かれると、
 * **近づく前に位置が割れている。**
 *
 * 30 マスなら、**見えている相手を見失わない**という目的には足りる。
 */
const MAX_DIST = 30;

/**
 * 誰が、誰に、いつから見られ続けているか。**メモリだけ。**
 *
 * 鍵は `見られている人 | 見ている人`。
 *
 * **見る人ごとに持つ**（2026-08-25 変更）。
 * 1 つにまとめていたので、**味方の誰かが見つけていれば
 * 壁の裏に居る自分にも見えていた。**
 */
const seenSince = new Map<string, number>();

/** 見られている人 → 見つけている敵の id */
const spottedBy = new Map<string, Set<string>>();

/** 誰も見つけていないことを表す。**毎回作らない** */
const NOBODY: ReadonlySet<string> = new Set<string>();

/**
 * ダーツが刺さっている人 → いつまで（tick）。
 *
 * 仕様は `docs/spec/23-drone.md` 4 章。
 *
 * **刺さっている間は、見ていなくても敵全員に見える。**
 * ドローンは落とされる道具なので、**落とされた後に何も残らないなら上げる意味が薄い。**
 *
 * **メモリだけ。** `/reload` で消えるが、
 * 1 分で切れるものなので**作り直しても困らない。**
 */
const darted = new Map<string, number>();

/** ダーツを刺す。**続く長さ（tick）を渡す** */
export function stickDart(playerId: string, ticks: number): void {
  darted.set(playerId, system.currentTick + ticks);
}

/** 抜く。**倒れたときに呼ぶ**（`features/death`） */
export function clearDart(playerId: string): void {
  darted.delete(playerId);
}

/** いま刺さっているか */
export function hasDart(playerId: string): boolean {
  const until = darted.get(playerId);
  if (until === undefined) return false;
  if (system.currentTick < until) return true;
  darted.delete(playerId);
  return false;
}

/**
 * その人を見つけている敵。
 *
 * **手で入れた場合（`/game:glow`）は敵全員**として扱う。
 * 確認のために入れたものが、見る人によって出たり出なかったりしては困る。
 *
 * **ダーツが刺さっている間も敵全員**（`docs/spec/23-drone.md` 4 章）。
 * 見つけ続けなくても見える、というのがダーツの値打ち。
 */
function spottersOf(player: Player): ReadonlySet<string> {
  if (isSpotted(player) || hasDart(player.id)) return everyoneElse(player);
  return spottedBy.get(player.id) ?? NOBODY;
}

/** その人以外の全員 */
function everyoneElse(player: Player): ReadonlySet<string> {
  const out = new Set<string>();
  for (const p of world.getAllPlayers()) if (p.id !== player.id) out.add(p.id);
  return out;
}

/**
 * 自動の判定を止めているか。**確認用**（`command.ts`）。
 *
 * 手で光らせても、**次の判定（2 tick 後）で消えてしまう。**
 * 見た目だけを確かめたいときに、見張りごと止められるようにしてある。
 */
let locked = false;

/** 止まっているか */
export function spotLocked(): boolean {
  return locked;
}

/** 止める／戻す。**止めたなら true** */
export function toggleSpotLock(): boolean {
  locked = !locked;
  if (!locked) seenSince.clear();
  return locked;
}

function sub(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/**
 * 視線が通っているか。
 *
 * **壁の向こうは見つけたことにしない**（2026-08-25 追加）。
 *
 * 以前は「角度と距離だけで決める。壁は見ない」としていた。
 * 壁越しに位置が分かることこそ目的だと考えたためだが、**逆だった。**
 *
 * > **見えていないのに見つけたことになるのはおかしい。**
 *
 * 見つけたあとは壁越しでも表示が残る（`marker.ts`）。
 * 壁に隠れれば積み上げが止まり、やがて消える。
 * **見つける瞬間だけ、視線を要求する。**
 */
function hasLineOfSight(watcher: Player, target: Player): boolean {
  try {
    const from = watcher.getHeadLocation();

    // ---- **狙うのは胴**（2026-08-25 修正）
    //
    // はじめは頭を狙っていたが、**壁の上に頭だけ出ていれば通ってしまう。**
    // 「壁の陰に居るのに見つかる」の正体はこれ。
    //
    // **胴が見えていなければ見つけたことにしない。**
    // 覗き込んでいる相手を見つけたいわけではない
    const at = target.location;
    const to = { x: at.x, y: at.y + CHEST, z: at.z };

    const dir = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-6) return true;

    const hit = watcher.dimension.getBlockFromRay(
      from,
      { x: dir.x / len, y: dir.y / len, z: dir.z / len },
      {
        // **草や花では遮られない。** 通り抜けられるものは視線も通す
        includePassableBlocks: false,
        includeLiquidBlocks: false,
        // **相手の手前で止める。**
        // 相手ちょうどまで伸ばすと、**相手の背中側の壁に当たって**
        // 「見えていない」ことになる
        maxDistance: Math.max(0, len - BACKSTOP),
      }
    );
    return hit === undefined;
  } catch {
    // **読めないなら見つけていない側に倒す。**
    // 読み込まれていない場所を「見えた」ことにはしない
    return false;
  }
}

/**
 * 見えているか。
 *
 * **角度・距離・遮蔽の 3 つ**（`docs/spec/15-presentation.md` 7-3）。
 *
 * > 遮蔽は重い。視線の走査は**人数の 2 乗ぶん**走りうる（15 人で 210 回）。
 * > **だから角度と距離で先に落としてから調べる。**
 * > ほとんどの組み合わせは角度の時点で外れる。
 */
function inSight(watcher: Player, target: Player): boolean {
  const to = sub(target.location, watcher.location);
  const dist = Math.hypot(to.x, to.y, to.z);
  if (dist < 0.5 || dist > MAX_DIST) return false;

  const v = watcher.getViewDirection();
  const dot = (to.x * v.x + to.y * v.y + to.z * v.z) / dist;
  // cos は角度が小さいほど 1 に近い
  if (dot < Math.cos((HALF_ANGLE * Math.PI) / 180)) return false;

  // **安いふるいを通ったものだけ、視線を調べる**
  return hasLineOfSight(watcher, target);
}

/**
 * ドローンから見えているか。
 *
 * 仕様は `docs/spec/23-drone.md` 3 章。
 *
 * **条件はプレイヤーと同じ**（角度・距離・遮蔽）。
 * 別の規則にすると、**どちらの目で見つけたのかで挙動が変わる。**
 *
 * 視線の向きは**操縦している人の向き**（機体はその人が向けている）。
 */
function droneSees(pilot: Player, from: Vector3, target: Player): boolean {
  const to = sub(target.location, from);
  const dist = Math.hypot(to.x, to.y, to.z);
  if (dist < 0.5 || dist > MAX_DIST) return false;

  let v: Vector3;
  try {
    v = pilot.getViewDirection();
  } catch {
    return false;
  }
  const dot = (to.x * v.x + to.y * v.y + to.z * v.z) / dist;
  if (dot < Math.cos((HALF_ANGLE * Math.PI) / 180)) return false;

  try {
    const at = target.location;
    const dir = { x: at.x - from.x, y: at.y + CHEST - from.y, z: at.z - from.z };
    const len = Math.hypot(dir.x, dir.y, dir.z);
    if (len < 1e-6) return true;
    const hit = pilot.dimension.getBlockFromRay(
      from,
      { x: dir.x / len, y: dir.y / len, z: dir.z / len },
      { includePassableBlocks: false, includeLiquidBlocks: false, maxDistance: Math.max(0, len - BACKSTOP) }
    );
    return hit === undefined;
  } catch {
    return false;
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 */
export function startSpotting(): void {
  system.runInterval(() => {
    const players = world.getAllPlayers();

    if (!isRunning()) {
      seenSince.clear();
      spottedBy.clear();
      clearSpotted();
      return;
    }

    // **出している印を、いまの体力に合わせる。**
    // 殴られるたびに変わるので、出したときのままでは古くなる
    refreshMarks(spottersOf);

    // ---- **確認中は判定だけ止める**（2026-08-25 修正）
    //
    // 以前はここで丸ごと `return` していたので、
    // **表示も体力も更新されなかった。**
    // 止めたことを忘れると「壁越しでも見つかったまま」に見える
    if (locked) return;

    const now = system.currentTick;

    for (const target of players) {
      const mine = teamOf(target);
      if (mine === undefined) continue;
      // ---- **観戦中は関わらない**（2026-08-25 追加）
      //
      // 倒れて復活を待っている人は**そこに居ない。**
      // 見つけられる側にも、見つける側にもならない
      if (isSpectating(target)) {
        forget(target.id, players);
        spottedBy.delete(target.id);
        continue;
      }

      // ---- **見る人ごとに数える**（2026-08-25 変更）
      //
      // 「誰か 1 人でも見つけていれば敵全員に見える」にしていたので、
      // **壁の裏に居る自分にも、味方が見つけた相手が見えていた。**
      const found = new Set<string>();
      for (const watcher of players) {
        if (watcher.id === target.id) continue;
        const other = teamOf(watcher);
        // **敵だけ。** 味方に見られても意味が無い
        if (other === undefined || other === mine) continue;
        // **観戦者は見つけられない。**
        // 倒れた味方が飛び回って敵を暴くのでは、倒した意味が無い
        if (isSpectating(watcher)) continue;

        const key = `${target.id}|${watcher.id}`;
        if (!inSight(watcher, target)) {
          seenSince.delete(key);
          continue;
        }

        // ---- 見え続けた時間を数える（docs/spec/15-presentation.md 7-3）
        //
        // **一瞬よぎっただけでは出さない。**
        // 振り向いた拍子に全員出ると、情報として使えない
        const since = seenSince.get(key);
        if (since === undefined) {
          seenSince.set(key, now);
          continue;
        }
        if (now - since >= HOLD_TICKS) found.add(watcher.id);
      }

      // ---- **ドローンが見つけたら、その味方全員に見える**
      //
      // 仕様は `docs/spec/23-drone.md` 3 章。
      //
      // プレイヤーの視認は**見る人ごと**だが、ドローンは**チームの目。**
      // 上げている間だけ、味方全体が同じものを見る
      for (const pilot of players) {
        const at = droneMuzzle(pilot);
        if (at === undefined) continue;
        const side = teamOf(pilot);
        if (side === undefined || side === mine) continue;

        const key = `${target.id}|drone:${pilot.id}`;
        if (!droneSees(pilot, at, target)) {
          seenSince.delete(key);
          continue;
        }
        const since = seenSince.get(key);
        if (since === undefined) {
          seenSince.set(key, now);
          continue;
        }
        if (now - since < HOLD_TICKS) continue;
        for (const mate of players) if (teamOf(mate) === side) found.add(mate.id);
      }

      if (found.size === 0) spottedBy.delete(target.id);
      else spottedBy.set(target.id, found);
    }
  }, INTERVAL);
}

/** その人にまつわる数えかけを捨てる */
function forget(targetId: string, players: readonly Player[]): void {
  for (const p of players) seenSince.delete(`${targetId}|${p.id}`);
}
