/**
 * ロールを変える球。
 *
 * 仕様は `docs/spec/24-role.md` 2-1。
 *
 * ## 村人ではなく、浮いている球（2026-08-27 変更）
 *
 * **触るとロールの盤面が開く。** それ以外は何もしない。
 * 人の形をしていると**話しかけられる相手**に見えるが、
 * これは**装置**であって、店員のように売り買いをするものではない。
 *
 * ## 置き場所
 *
 * **初期値を持っている**（`DEFAULT_SPOT`）。
 * 動かしたいときは `/game:rolekeeper` で足せる。
 *
 * ## 覚えておく
 *
 * 置いた場所は**ワールドの動的プロパティ**に残す。
 * 後片付けで消えても、**次の見張りで同じ場所に戻る。**
 */

import {
  CommandPermissionLevel,
  CustomCommandStatus,
  system,
  world,
  type CustomCommandOrigin,
  type CustomCommandRegistry,
  type CustomCommandResult,
  type Entity,
  type Player,
  type Vector3,
} from "@minecraft/server";

import { ARENAS, inBox, type Team } from "../../lib/arena.js";
import { lobbyPoint } from "../../lib/lobby.js";
import { openShop, shopBlockedReason } from "../shop/index.js";
import { showRoles } from "./ui.js";
import { opMessage } from "../../lib/op.js";
import { droneUiBlocked } from "../drone/index.js";

/** 実体 */
const KEEPER = "game:rolekeeper";

/** 頭の上に出す名前 */
const NAME = "§bロール";

/** 待機所のショップの球に付ける名前 */
const SHOP_NAME = "§6ショップ §7(お試し)";

/** 待機所のロールの球に付ける名前 */
const TRY_NAME = "§bロール §7(お試し)";

/**
 * 待機所の球に付ける印。
 *
 * **触ったときに何を開くか**を、これで見分ける
 *（`docs/spec/25-practice.md` 2 章）。
 */
const TAG_SHOP = "cw:orb_shop";

/** 待機所の球だという印。**試合が始まったら消す目印** */
const TAG_LOBBY = "cw:orb_lobby";

/** 待機所の球を置く左右のずれ（マス） */
const SIDE = 1.5;

/**
 * **必ずここに 1 個ある**（`docs/spec/24-role.md` 2-1）。
 *
 * 店員（`features/shop/keeper.ts`）と同じ扱いにした（2026-08-27 変更）。
 *
 * はじめは「まだ一度も置いていなければ入れる」としていたが、
 * **一度でも `/game:rolekeeper` を使った後は入らない。**
 * 試した跡が残っているだけで**マップの備品が出てこない**のでは、
 * 置き場所を決めた意味が無い。
 *
 * **地図に載っているものとして扱う。** 足したいものはコマンドで足す
 */
const MAP_SPOTS: readonly Vector3[] = [
  // 赤の拠点
  { x: 1110.5, y: -8.3, z: 1000.5 },
  // 青の拠点。**赤と向かい合わせ**（島の中心から同じだけ外側）
  { x: 890.5, y: -8.3, z: 1000.5 },
];

/** 置いた場所を覚えておく名前 */
const KEY = "cw:rolekeepers";

/** 同じ場所とみなす距離（マス） */
const SAME_SPOT = 1.5;

/** 見張る間隔（tick）。**5 秒** */
const INTERVAL = 100;

function spots(): Vector3[] {
  try {
    const raw = world.getDynamicProperty(KEY);
    if (typeof raw !== "string") return [];
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.filter((v): v is Vector3 => typeof v === "object" && v !== null && "x" in v);
  } catch {
    return [];
  }
}

function saveSpots(list: readonly Vector3[]): void {
  try {
    world.setDynamicProperty(KEY, JSON.stringify(list));
  } catch {
    /* 書けなかった */
  }
}

/**
 * 待機所に浮かべる球（`docs/spec/25-practice.md` 2 章）。
 *
 * **待機所は動かせる**（`/game:setlobby`）ので、座標を決め打たない。
 * 見張りのたびに、**いまの待機所の左右**へ置き直す。
 */
function lobbySpots(): { at: Vector3; shop: boolean }[] {
  const at = lobbyPoint();
  return [
    { at: { x: at.x - SIDE, y: at.y + 1, z: at.z }, shop: false },
    { at: { x: at.x + SIDE, y: at.y + 1, z: at.z }, shop: true },
  ];
}

/** そこはどちらの拠点か。**どちらでもないなら undefined** */
function teamAt(at: Vector3): Team | undefined {
  const bases = ARENAS[0].bases;
  if (inBox(bases.blue, at)) return "blue";
  if (inBox(bases.red, at)) return "red";
  return undefined;
}

function near(a: Vector3, b: Vector3): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) <= SAME_SPOT;
}

/** いま居る球を全部拾う */
function alive(): Entity[] {
  try {
    return world.getDimension("overworld").getEntities({ type: KEEPER });
  } catch {
    return [];
  }
}

/**
 * 居るべき姿に合わせる。
 *
 * **足りなければ湧かす。** 何度呼んでも同じ結果になる。
 */
function sync(): void {
  // ---- **待機所の球は、いつでも置いておく**（`docs/spec/25-practice.md`）
  //
  // 試合中は消していたが、**その間もロビーに人は居る**（2026-08-27 変更）。
  // 参加しなかった人の居場所を、試合の間だけ取り上げる理由が無い
  const dim = world.getDimension("overworld");
  const here = alive();
  {
    for (const spot of lobbySpots()) {
      if (here.some((e) => e.hasTag(TAG_LOBBY) && near(e.location, spot.at))) continue;
      try {
        const e = dim.spawnEntity(KEEPER, spot.at);
        e.addTag(TAG_LOBBY);
        if (spot.shop) e.addTag(TAG_SHOP);
        e.nameTag = spot.shop ? SHOP_NAME : TRY_NAME;
        e.triggerEvent(spot.shop ? "game:gold" : "game:neutral");
      } catch {
        /* 読み込まれていない。次の機会に */
      }
    }
    // **動かした跡は片付ける。** 待機所を移すと、前の場所に残る
    for (const e of here) {
      try {
        if (!e.hasTag(TAG_LOBBY)) continue;
        if (lobbySpots().some((spot) => near(e.location, spot.at))) continue;
        e.remove();
      } catch {
        /* 既に消えている */
      }
    }
  }

  // **地図の分と、運営が足した分**
  const want = [...MAP_SPOTS, ...spots()];

  for (const at of want) {
    if (here.some((e) => !e.hasTag(TAG_LOBBY) && near(e.location, at))) continue;
    try {
      const e = dim.spawnEntity(KEEPER, at);
      e.nameTag = NAME;
      // ---- **拠点の色に合わせる**（2026-08-27 追加）
      //
      // どちらの拠点にあるかで**青・赤**に変わる。
      // どちらでもない場所なら**水色のまま**
      const team = teamAt(at);
      if (team !== undefined) e.triggerEvent(`game:${team}`);
    } catch {
      /* 読み込まれていない。次の機会に */
    }
  }
}

/**
 * 見張りを始める。
 *
 * **トップレベルから呼ぶこと。**
 * `worldLoad` の中に置くと `/reload` で起動しない
 *（`docs/research/02-hot-reload.md` 3-2-b）。
 */
export function syncRoleKeepers(): void {
  sync();
}

export function startRoleKeeper(): void {
  // **すぐ出す。** 5 秒待たせない
  system.run(sync);
  system.runInterval(sync, INTERVAL);
}

/**
 * 触られたら盤面を開く。
 *
 * **トップレベルから呼ぶこと。**
 */
export function registerRoleKeeper(): void {
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const target = ev.target;
    if (target.typeId !== KEEPER) return;
    // **ドローンの最中は開かない**（`features/drone` 5-E）
    if (droneUiBlocked(ev.player, ev.itemStack?.typeId)) return;
    // **手に持っているものが暴発しないように打ち消す**
    ev.cancel = true;
    const player = ev.player;
    let shop = false;
    try {
      shop = target.hasTag(TAG_SHOP);
    } catch {
      /* 消えている */
    }
    // **before の中では画面を出せない**（`docs/imp.md` 5.1）
    system.run(() => {
      if (!shop) {
        showRoles(player);
        return;
      }
      // ---- **お試しのショップ**（`docs/spec/25-practice.md` 3 章）
      const why = shopBlockedReason(player);
      if (why !== undefined) {
        player.sendMessage(why);
        return;
      }
      openShop(player);
    });
  });
}

/** `system.beforeEvents.startup` の中から呼ぶこと */
export function registerRoleKeeperCommand(registry: CustomCommandRegistry): void {
  registry.registerCommand(
    {
      name: "game:rolekeeper",
      description: "いま立っている場所にロールの球を置く（運営のみ）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (origin: CustomCommandOrigin): CustomCommandResult => {
      const e = origin.sourceEntity;
      if (e === undefined || e.typeId !== "minecraft:player") {
        return { status: CustomCommandStatus.Failure, message: "プレイヤーから実行すること" };
      }
      const player = e as Player;
      system.run(() => {
        const at = player.location;
        const list = [...spots(), { x: at.x, y: at.y, z: at.z }];
        saveSpots(list);
        sync();
        opMessage(`§7ロールの球を置いた（${list.length} 個目）`);
      });
      return { status: CustomCommandStatus.Success };
    }
  );

  registry.registerCommand(
    {
      name: "game:rolekeeper_clear",
      description: "足したロールの球を消す（地図の 2 個は残る。運営のみ）",
      permissionLevel: CommandPermissionLevel.Admin,
    },
    (): CustomCommandResult => {
      system.run(() => {
        saveSpots([]);
        for (const e of alive()) {
          try {
            e.remove();
          } catch {
            /* 既に消えている */
          }
        }
        opMessage("§7足したロールの球を消した §7(地図の 2 個は残る)");
      });
      return { status: CustomCommandStatus.Success };
    }
  );
}
