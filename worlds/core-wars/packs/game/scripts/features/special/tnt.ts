/**
 * TNT は置いた瞬間に着火する。
 *
 * 仕様は `docs/03-content.md` 1-4。
 *
 * ## なぜそうするのか
 *
 * **置いてから火を点ける手順を挟むと、戦闘中に使えない。**
 * 火打石を別に買わせるのも、持ち物の枠を 1 つ潰すだけで面白くならない。
 *
 * **置いた = 投げた**にすれば、TNT は「時間差の攻撃」という
 * 分かりやすい 1 つの道具になる。
 *
 * ## 置いたブロックとして残らない
 *
 * 一瞬でブロックでなくなるので、後片付けの対象にならない。
 * 消し忘れの心配が無い。
 */

import { system, world, type Entity, type Player } from "@minecraft/server";

import { ARENAS, inBox } from "../../lib/arena.js";

/** 置かれたときに着火するブロック */
const TNT_BLOCK = "minecraft:tnt";

/** 着火した TNT の実体。**ブロックと同じ名前だが別物** */
const TNT_ENTITY = "minecraft:tnt";

/** 拠点に入り込んだ TNT を探す間隔（tick） */
const SWEEP = 5;

/**
 * 火を点けた人の印。
 *
 * **味方を巻き込まないために要る**（`docs/spec/11-match.md` 5-1）。
 *
 * ## なぜ実体に書くのか
 *
 * TNT は 4 秒で消える短命な実体だが、
 * **表に持つと、消えた分を掃除して回ることになる。**
 * 実体と一緒に消えるほうが漏れない。
 *
 * `/reload` をまたいでも残る（`docs/spec/09-state-management.md`）。
 */
const OWNER_KEY = "cw:tnt_owner";

/**
 * どこから出た TNT かの印。
 *
 * **`"drone"` ならドローンから落としたもの。**
 * キルログで**「ドローンの TNT で」**と書き分けるのに使う
 *（`docs/spec/14-death.md` 3 章）。
 */
const FROM_KEY = "cw:tnt_from";

/** どこから出た TNT か */
export type TntFrom = "hand" | "drone";

/**
 * 火を点けた TNT の控え。**実体の印とは別に、こちらにも持つ。**
 *
 * ## なぜ二重に持つのか
 *
 * **爆発した瞬間の TNT は、読めなくなっていることがある。**
 * ダメージが飛ぶ時点で実体が無効なら、
 * **印を書いてあっても読み出せない。**
 *
 * 控えがあれば、**id さえ分かれば**持ち主も出どころも引ける。
 *
 * | | いつ効くか |
 * | --- | --- |
 * | 実体の印 | **`/reload` をまたいでも残る** |
 * | **この控え** | **実体が読めなくなっても残る** |
 *
 * TNT は 4〜8 秒で消えるので、**溜まり続けない。**
 * それでも取りこぼしに備えて、古いものは捨てる。
 */
const noted = new Map<string, Lit>();

/** 火の点いた TNT 1 つぶんの控え */
interface Lit {
  /** 火を点けた人。**分からなければ空** */
  owner: string;
  from: TntFrom;
  /** 湧いた tick */
  at: number;
  /** まだ生きている実体。**爆ぜたら undefined** */
  entity?: Entity;
  /** 初めて地面に着いた tick。**まだなら undefined** */
  landedAt?: number;
  /** 実体が消えた tick */
  goneAt?: number;
}

/** 控えを捨てるまで（tick）。**十分に長く** */
const FORGET = 400;

/**
 * 地面に着いてから爆ぜるまで（tick）。**6 秒。**
 *
 * 仕様は `docs/03-content.md` 1-4。
 *
 * ## なぜ「置いてから」ではないのか
 *
 * **落ちている間に燃え尽きる。**
 * ドローンから落とす（`docs/spec/23-drone.md` 5-D）と、
 * 高さによって**着く前に爆ぜたり、着いた瞬間に爆ぜたり**する。
 *
 * **着いてから数えれば、どこから落としても同じ 6 秒。**
 * 落とされた側にも、逃げるか押し返すかを決める時間が同じだけある。
 */
const FUSE_TICKS = 120;

/** 爆発の強さ。**バニラの TNT と同じ** */
const POWER = 4;

/** 見張る間隔（tick）。**着地を取りこぼさないように毎 tick** */
const WATCH = 1;

/** 知らない TNT を拾いに行く間隔（tick）。**`/reload` をまたいだ分** */
const ADOPT = 10;

/**
 * 導火線を止める合図。
 *
 * **バニラの 4 秒では、こちらが数える前に爆ぜる。**
 * `behavior_packs/game/entities/tnt.json` に足した component group で
 * **60 秒まで延ばし、実際の起爆はこちらで行う。**
 *
 * 60 秒で切ってあるのは保険。**script が止まっても、いつかは消える。**
 */
const HOLD = "game:hold";

/**
 * 拠点の中か。
 *
 * **ブロックを置けない範囲**をそのまま使う
 *（`docs/spec/11-match.md` 6-G）。
 * 別に持つと必ずずれる。
 */
function inNoBuild(at: { x: number; y: number; z: number }): boolean {
  for (const arena of ARENAS) {
    for (const box of arena.noBuild) if (inBox(box, at)) return true;
  }
  return false;
}

/**
 * 拠点の TNT は消さない（2026-08-25 変更）。
 *
 * 以前は**拠点に入り込んだ TNT を消していた。**
 * 「置けない場所を爆破で抜けさせない」ためだったが、やめた。
 *
 * > **拠点で禁じたいのは「埋めて塞ぐ」こと**（`docs/spec/11-match.md` 6-G）。
 * > TNT は**置いた瞬間に実体になる**ので、ブロックとして残らない。
 * > 塞ぐ手段にはならない。
 *
 * **攻める側に、拠点を崩す手段を 1 つ渡す。**
 * 守り一辺倒にならないように。
 *
 * コアだけは爆発で消えない（`features/protection`）——
 * **削るのは殴ったときだけ**という決まりを守るため。
 */
export function startTntGuard(): void {
  // **何もしない。** 呼び出し側を消して回るより、ここで止めるほうが分かりやすい
}

/**
 * 誰が火を点けたかを覚えさせる。
 *
 * **湧かした直後に呼ぶこと。** ドローンから落とす分（`features/drone`）も同じ。
 */
export function markTntOwner(tnt: Entity, player: Player, from: TntFrom = "hand"): void {
  try {
    tnt.setDynamicProperty(OWNER_KEY, player.id);
    tnt.setDynamicProperty(FROM_KEY, from);
  } catch {
    /* 消えている。**印が無いだけ**——控えのほうが残る */
  }
  hold(tnt, player.id, from);
}

/**
 * 導火線をこちらで握る。
 *
 * **湧いた TNT は必ずここを通す。**
 * 通っていない TNT はバニラの 4 秒で爆ぜてしまう。
 */
function hold(tnt: Entity, owner: string, from: TntFrom): void {
  try {
    tnt.triggerEvent(HOLD);
  } catch {
    /* 定義が読み込まれていない。**バニラの 4 秒で爆ぜる**だけ */
  }
  try {
    noted.set(tnt.id, { owner, from, at: system.currentTick, entity: tnt });
  } catch {
    /* id も読めない。ここまで来たら諦める */
  }
}

/** 控えから引く。**実体が読めなくなっていても効く** */
function notedOf(tnt: Entity): { owner: string; from: TntFrom } | undefined {
  try {
    return noted.get(tnt.id);
  } catch {
    return undefined;
  }
}

/**
 * その TNT に火を点けた人の id。**分からなければ undefined。**
 *
 * `features/combat` が「味方の巻き添えか」を決めるのに使う。
 */
export function tntOwnerId(tnt: Entity): string | undefined {
  try {
    const id = tnt.getDynamicProperty(OWNER_KEY);
    if (typeof id === "string") return id;
  } catch {
    /* 爆発して読めない。**控えを見る** */
  }
  return notedOf(tnt)?.owner;
}

/** その TNT はどこから出たか。**分からなければ `"hand"`** */
export function tntFrom(tnt: Entity): TntFrom {
  try {
    if (tnt.getDynamicProperty(FROM_KEY) === "drone") return "drone";
    // **印が無いなら控えを見る。** `/reload` 前に湧いた分は印が無い
    return notedOf(tnt)?.from ?? "hand";
  } catch {
    return "hand";
  }
}

/**
 * 導火線を見張る。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 *
 * ## 爆発そのものをこちらで起こす
 *
 * 実体の導火線に任せると、**何秒後に爆ぜるかを後から変えられない。**
 * 60 秒まで延ばしておいて、**着地から 6 秒で自分で爆発させる。**
 *
 * 爆発の出どころ（`source`）にその TNT を渡す。
 * **誰が点けたか**（`features/death`）と
 * **コアの真上か**（`features/protection`）の判定が、そのまま効く。
 */
export function startTntFuse(): void {
  system.runInterval(() => {
    const now = system.currentTick;
    for (const [id, rec] of noted) {
      const tnt = rec.entity;
      if (tnt === undefined) {
        // **爆ぜた後の控え。** 誰の物だったかを引くために少しだけ残す
        if (now - (rec.goneAt ?? rec.at) > FORGET) noted.delete(id);
        continue;
      }

      let onGround = false;
      try {
        onGround = tnt.isOnGround;
      } catch {
        // **消えている。** 他の爆発に巻き込まれたか、片付けられた
        rec.entity = undefined;
        rec.goneAt = now;
        continue;
      }

      // ---- **まだ着いていない。** 数え始めない
      if (rec.landedAt === undefined) {
        if (onGround) rec.landedAt = now;
        continue;
      }

      if (now - rec.landedAt < FUSE_TICKS) continue;

      // ---- **爆ぜる**
      let at;
      try {
        at = tnt.location;
      } catch {
        rec.entity = undefined;
        rec.goneAt = now;
        continue;
      }
      try {
        tnt.dimension.createExplosion(at, POWER, { source: tnt, breaksBlocks: true, causesFire: false });
      } catch {
        /* 起こせなかった。**実体だけ消す** */
      }
      try {
        tnt.remove();
      } catch {
        /* 既に消えている */
      }
      rec.entity = undefined;
      rec.goneAt = now;
    }
  }, WATCH);

  // ---- **知らない TNT を拾う**
  //
  // `/reload` をまたぐと控えが空になる。
  // **拾わないと、バニラの導火線のまま爆ぜる**か、
  // 60 秒黙って居座ることになる。
  //
  // 誰が点けたかは**もう分からない**（全員に当たる扱いになる）
  system.runInterval(() => {
    try {
      for (const e of world.getDimension("overworld").getEntities({ type: TNT_ENTITY })) {
        if (noted.has(e.id)) continue;
        hold(e, "", "hand");
      }
    } catch {
      /* 読み込まれていない。次の機会に */
    }
  }, ADOPT);
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない。
 */
export function registerTntFuse(): void {
  world.afterEvents.playerPlaceBlock.subscribe((ev) => {
    if (ev.block.typeId !== TNT_BLOCK) return;
    const dim = ev.dimension;
    const at = { x: ev.block.x, y: ev.block.y, z: ev.block.z };
    system.run(() => {
      try {
        dim.setBlockType(at, "minecraft:air");
        // **ブロックの真ん中に湧かす。** 角に置くと隣のマスへずれる
        const tnt = dim.spawnEntity(TNT_ENTITY, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
        // **置いた人を覚えておく。** 味方を巻き込まないため
        markTntOwner(tnt, ev.player);
      } catch {
        // 読み込まれていない、など。**ブロックのまま残る**だけで害は無い
      }
    });
  });
}
