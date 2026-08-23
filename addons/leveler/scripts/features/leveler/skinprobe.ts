/**
 * スキン複製の検証（調査用）。
 *
 * 仕様: docs/research/07-player-skin-clone.md
 *
 * ## 確かめたいこと
 *
 *   1. `gametest.getPlayerSkin(player)` が実機で何を返すか。
 *      とくに**Character Creator を使っていない（自作 PNG の）プレイヤー**で
 *      `personaPieces` が埋まるのか
 *   2. **モジュール直下の `spawnSimulatedPlayer`** が本当に
 *      GameTest 無しで動くか（ワールド座標をそのまま渡せるか）
 *   3. **他人のスキン**を分身に着せられるか（本命）
 *
 * ## 操作はアイテムを主軸にする
 *
 * **コマンドを増やすとワールドに入り直す必要がある**（登録は起動時のみ）。
 * アイテムの右クリックはイベント購読なので **`/reload` だけで反映される**。
 * 試行錯誤する部分はアイテム側に寄せておく。
 *
 * これは調査用の使い捨て。作ると決めたら `docs/spec/` に書いてから実装し直す。
 */
import {
  GameMode,
  system,
  world,
  type Dimension,
  type DimensionLocation,
  type Player,
} from "@minecraft/server";
import * as mc from "@minecraft/server";
import * as gametest from "@minecraft/server-gametest";

// ---------------------------------------------------------------- 設定

/** 分身を出すアイテム。通常＝走る分身／スニーク＝その場に立つ分身 */
const CLONE_ITEM = "minecraft:blaze_rod";

/** 後始末のアイテム。通常＝分身を全部消す／スニーク＝原因の切り分け */
const UTIL_ITEM = "minecraft:bone";

/** 実行時リフレクションのアイテム。型定義に載っていないメンバーを探す */
const REFLECT_ITEM = "minecraft:feather";

/** 走る分身が消えるまでの時間（tick）。20 tick = 1秒 */
const CLONE_LIFETIME = 200;

/** 分身が走る速さ */
const CLONE_SPEED = 1;

/**
 * 待機させておく分身の置き場。
 *
 * **「ゲームに参加しました」の通知は湧いた瞬間に出る。**
 * ゲームルールにも API にも抑止する手段が無い（全37個のゲームルールを確認済み。
 * `playerJoin` は after イベントでキャンセルできない）。
 *
 * そこで**先に出しておいて遠くに待機させ、使うときはテレポートするだけ**にする。
 * 通知は用意した時点で1回出るだけで、能力の発動時には出ない。
 */
const PARK = { x: 100000, y: 100, z: 100000 };

// ---------------------------------------------------------------- 状態

/** 出した分身。まとめて消せるように持っておく */
const clones = new Set<gametest.SimulatedPlayer>();

/** 名前が衝突しないように通し番号を振る */
let seq = 0;

/** 待機中の分身。使うときはここから取り出してテレポートする */
const pool: gametest.SimulatedPlayer[] = [];

// ---------------------------------------------------------------- スキン情報

/** `getPlayerSkin` の戻りを1行で読める形にする */
export function describeSkin(data: gametest.PlayerSkinData): string {
  const pieces = data.personaPieces ?? [];
  const types = [...new Set(pieces.map((p) => p.type))];
  const c = data.skinColor;
  const color = c ? `${c.red.toFixed(2)}/${c.green.toFixed(2)}/${c.blue.toFixed(2)}` : "なし";

  return `腕=${data.armSize ?? "なし"} パーツ=${pieces.length}個 色=${color} 種別=[${types.join(", ")}]`;
}

/**
 * そのプレイヤーのスキン情報をチャットとログに出す。
 *
 * @returns パーツが取れたか（複製できる見込みがあるか）
 */
export function dumpSkin(player: Player, quiet = false): boolean {
  let data: gametest.PlayerSkinData;
  try {
    data = gametest.getPlayerSkin(player);
  } catch (e) {
    world.sendMessage(`§c[skin] ${player.name}: 取得に失敗 ${String(e)}§r`);
    return false;
  }

  const ok = (data.personaPieces ?? []).length > 0;
  const mark = ok ? "§a○" : "§c×";
  world.sendMessage(`${mark} §b${player.name}§r: ${describeSkin(data)}`);

  if (!quiet) {
    // **生の中身も出す。** 要約だけだと
    // 「何も返っていない」のか「パーツだけ空なのか」が切り分けられない
    const raw = JSON.stringify(data);
    world.sendMessage(`§7  raw: ${raw.length > 240 ? `${raw.slice(0, 240)}…（続きはログ）` : raw}§r`);
  }
  console.warn(`[skin] ${player.name} = ${JSON.stringify(data)}`);

  return ok;
}

/**
 * 参加者全員ぶん出す。
 *
 * **誰なら複製できるかが一目で分かるようにする。**
 * `getPlayerSkin` は persona（キャラクター作成）のパーツしか返さないので、
 * 取れる人と取れない人が混ざる。
 */
export function dumpAllSkins(): void {
  const players = world.getAllPlayers();
  world.sendMessage(`§b[skin] ${players.length} 人ぶん（§a○§b=複製できる §c×§b=できない）§r`);

  const ok: string[] = [];
  for (const player of players) {
    if (dumpSkin(player, true)) ok.push(player.name);
  }

  if (ok.length === 0) {
    world.sendMessage("§e複製できる人がいません。キャラクター作成でパーツから組んだスキンが必要です§r");
    return;
  }
  world.sendMessage(`§a複製できる: ${ok.join(", ")}§r`);
  world.sendMessage(`§7  → /level:cloneof ${ok[0]} で並べて見比べられます§r`);
}

/**
 * 原因の切り分け。文脈と対象を変えて `getPlayerSkin` を呼ぶ。
 *
 * 空の返り方には意味の違いがある。
 *   `{}`                            → API が値を返していない
 *   `{"armSize":..,"skinColor":..}` → 動いているがパーツが無い（persona でない）
 */
export function diagnoseSkin(player: Player): void {
  const report = (label: string, subject: Player): void => {
    try {
      const data = gametest.getPlayerSkin(subject);
      const raw = JSON.stringify(data);
      world.sendMessage(`§7[診断] ${label}: keys=[${Object.keys(data).join(",")}] raw=${raw}§r`);
      console.warn(`[診断] ${label} raw=${raw}`);
    } catch (e) {
      world.sendMessage(`§c[診断] ${label}: 例外 ${String(e)}§r`);
    }
  };

  world.sendMessage("§b[診断] getPlayerSkin の切り分けを始めます§r");
  report("イベント直下/自分", player);
  system.run(() => report("system.run/自分", player));
  system.runTimeout(() => report("40tick後/自分", player), 40);
}

/**
 * 実行時の中身を列挙する。
 *
 * **型定義やメタデータに載っていないメンバーが実体にあるかを確かめる。**
 * プロトタイプ鎖をたどって全部集め、スキン関係の語に当たるものを目立たせる。
 */
function reflect(label: string, obj: object | undefined): void {
  if (!obj) {
    world.sendMessage(`§7[反射] ${label}: 対象なし§r`);
    return;
  }

  const names = new Set<string>();
  let cur: object | null = obj;
  while (cur && cur !== Object.prototype) {
    for (const n of Object.getOwnPropertyNames(cur)) names.add(n);
    cur = Object.getPrototypeOf(cur) as object | null;
  }

  const all = [...names].sort();
  const hits = all.filter((n) => /skin|persona|texture|appearance|image|geometry|cape/i.test(n));

  world.sendMessage(
    `§7[反射] ${label}: ${all.length}個` +
      (hits.length > 0 ? ` §e該当=[${hits.join(", ")}]§r` : " 該当なし§r")
  );
  console.warn(`[反射] ${label} (${all.length}) = ${all.join(",")}`);
}

/** 主要なオブジェクトを一通り列挙する */
export function reflectAll(player: Player): void {
  world.sendMessage("§b[反射] 実行時の中身を列挙します（詳細はコンテンツログ）§r");
  reflect("@minecraft/server（モジュール）", mc as unknown as object);
  reflect("@minecraft/server-gametest（モジュール）", gametest as unknown as object);
  reflect("world", world);
  reflect("system", system);
  reflect("Player（実プレイヤー）", player);
}

// ---------------------------------------------------------------- 分身

export type CloneOptions = {
  /** 誰のスキンを着せるか。省略したら本人 */
  skinFrom?: Player;
  /** 前へ走らせるか。false ならその場に立つ */
  run: boolean;
  /** 消えるまでの tick。0 なら消えない */
  lifetime: number;
};

/**
 * 分身を出す。
 *
 * **`Test` を使わないモジュール直下の `spawnSimulatedPlayer` を使う。**
 * 座標をワールド座標のまま渡せるので、
 * 整地くんで必要だった相対座標への変換が要らない。
 */
export function spawnClone(owner: Player, options: CloneOptions): void {
  seq++;
  const source = options.skinFrom ?? owner;
  const name = `${source.name}の分身${seq}`;

  const at: DimensionLocation = {
    x: owner.location.x,
    y: owner.location.y,
    z: owner.location.z,
    dimension: owner.dimension,
  };

  // **待機中のものがあれば使い回す。**
  // 新しく湧かせると「ゲームに参加しました」が出て、分身にならない
  let clone = takeFromPool();
  const reused = clone !== undefined;

  if (!clone) {
    try {
      // Adventure にするのは、分身に地形を壊させないため
      clone = gametest.spawnSimulatedPlayer(at, name, GameMode.Adventure);
    } catch (e) {
      world.sendMessage(`§c[clone] 生成に失敗: ${String(e)}§r`);
      return;
    }
  } else {
    try {
      clone.teleport(at, { dimension: owner.dimension });
      clone.removeEffect("invisibility");
    } catch (e) {
      world.sendMessage(`§e[clone] 待機中の分身を呼び出せませんでした: ${String(e)}§r`);
    }
  }
  clones.add(clone);

  // スキンを合わせる。ここが本題
  try {
    clone.setSkin(gametest.getPlayerSkin(source));
  } catch (e) {
    world.sendMessage(`§e[clone] スキンの複製に失敗: ${String(e)}§r`);
  }

  // 呼び出した人の向きを引き継ぐ
  try {
    clone.setRotation(owner.getRotation());
    if (options.run) clone.moveRelative(0, 1, CLONE_SPEED);
  } catch {
    // 動けなくても見た目の確認はできる
  }

  const life = options.lifetime > 0 ? `${options.lifetime / 20} 秒で消えます` : "消えません";
  const how = reused ? "待機中のものを使用（参加通知なし）" : "新規に生成（参加通知あり）";
  world.sendMessage(`§b[clone] ${name} を出しました（${life} / ${how}）§r`);

  if (options.lifetime > 0) {
    const target = clone;
    // **消さずに待機場所へ戻す。** 消すと「退出しました」が出るうえ、
    // 次に使うときまた参加通知が出る
    system.runTimeout(() => parkClone(target), options.lifetime);
  }
}

/** 名前でプレイヤーを探す。前方一致でよい（日本語名を打ちやすくするため） */
export function findPlayer(name: string): Player | undefined {
  const players = world.getAllPlayers();
  return players.find((p) => p.name === name) ?? players.find((p) => p.name.startsWith(name));
}

function removeClone(clone: gametest.SimulatedPlayer): void {
  clones.delete(clone);
  try {
    if (clone.isValid) clone.disconnect();
  } catch {
    // 既に居なければ何もしない
  }
}

/**
 * 分身を先に用意して、遠くに待機させておく。
 *
 * **ここで「ゲームに参加しました」がまとめて出る。**
 * 以降の呼び出しではテレポートするだけなので通知は出ない。
 *
 * 待機中は透明にしておく。誰かが待機場所に行っても見えないように。
 */
export function preparePool(dimension: Dimension, count: number): void {
  for (let i = 0; i < count; i++) {
    seq++;
    try {
      const clone = gametest.spawnSimulatedPlayer(
        { ...PARK, dimension },
        `控えの分身${seq}`,
        GameMode.Adventure
      );
      // 効かなくても待機場所は遠いので実害は無い
      try {
        clone.addEffect("invisibility", 20_000_000, { showParticles: false });
      } catch {
        // 無視してよい
      }
      pool.push(clone);
    } catch (e) {
      world.sendMessage(`§c[clone] 待機分身の用意に失敗: ${String(e)}§r`);
      return;
    }
  }
  world.sendMessage(`§b[clone] 待機分身を ${pool.length} 体まで用意しました§r`);
}

/** 待機中の分身を1体取り出す */
function takeFromPool(): gametest.SimulatedPlayer | undefined {
  while (pool.length > 0) {
    const clone = pool.pop();
    if (clone?.isValid) return clone;
  }
  return undefined;
}

/** 待機中の数 */
export function poolSize(): number {
  return pool.length;
}

/** 使い終わった分身を待機場所へ戻す。消さないので通知も出ない */
export function parkClone(clone: gametest.SimulatedPlayer): void {
  clones.delete(clone);
  if (!clone.isValid) return;
  try {
    clone.stopMoving();
    clone.teleport(PARK, { dimension: clone.dimension });
    clone.addEffect("invisibility", 20_000_000, { showParticles: false });
    pool.push(clone);
  } catch {
    // 戻せなければ捨てる
  }
}

/** 出した分身を全部消す */
export function clearClones(): number {
  const n = clones.size;
  for (const clone of [...clones]) removeClone(clone);
  clones.clear();
  return n;
}

// ---------------------------------------------------------------- アイテム操作

let subscribed = false;

/**
 * アイテムでの操作を有効にする。
 *
 * **コマンドと違い、これは `/reload` だけで反映される。**
 * 検証中に触りたくなる部分はここへ寄せる。
 */
export function enableCloneItems(): void {
  if (subscribed) return;
  subscribed = true;

  world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    const id = event.itemStack.typeId;
    const sneaking = player.isSneaking;

    if (id === CLONE_ITEM) {
      // スニークならその場に立たせる（見比べ用・消えない）
      spawnClone(player, {
        run: !sneaking,
        lifetime: sneaking ? 0 : CLONE_LIFETIME,
      });
      return;
    }

    if (id === REFLECT_ITEM) {
      reflectAll(player);
      return;
    }

    if (id === UTIL_ITEM) {
      if (sneaking) {
        // 原因の切り分け。全員ぶんの一覧は /level:skin で見られる
        diagnoseSkin(player);
      } else {
        const n = clearClones();
        world.sendMessage(`§b[clone] ${n} 体消しました§r`);
      }
    }
  });

  console.warn(
    `[skinprobe] ${CLONE_ITEM}=分身（スニークで据え置き） / ${UTIL_ITEM}=消す（スニークで全員のスキン表示）`
  );
}
