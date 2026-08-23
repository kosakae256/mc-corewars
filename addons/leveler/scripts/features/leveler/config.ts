/**
 * 整地ボットの設定値。変えたくなったらここ1箇所を直す。
 */

/** GameTest の登録名。`/gametest run leveler:start` で起動する */
export const TEST_CLASS = "leveler";
export const TEST_NAME = "start";

/**
 * ボットを呼ぶ先のプレイヤー名。
 * この名前の人がいなければ、ワールドにいる最初のプレイヤーのところへ行く。
 */
export const CALL_TO_PLAYER = "zerda256py";

/** ボットの名前 */
export const BOT_NAME = "整地くん";

/**
 * GameTest が勝手に終わらないようにする tick 数。
 * 終了するとボットも消えるため、十分大きくとる。
 * 20 tick = 1秒なので、これは約 27 時間。
 */
export const MAX_TICKS = 2_000_000;

/**
 * GameTest の構造を展開する場所。
 *
 * ここにコマンドブロックと構造の枠が出るので、
 * **プレイヤーが普段いない遠くの座標**にする。
 * 生成したボットは呼び出したプレイヤーの位置へ teleport する。
 */
export const TEST_SITE = { x: 100000, y: 100, z: 100000 };

/**
 * 埋める対象の上限の高さ。
 *
 * **`BEDROCK_Y` より上、この高さ以下**の空気ブロックが対象。
 * つまり Y = -63, -62, -61 の3段。
 * 岩盤（-64）には触らない。
 */
export const GROUND_Y = -61;

/** この高さ以下は触らない（岩盤） */
export const BEDROCK_Y = -64;


/** 埋めるのに使うブロック */
export const FILL_ITEM = "minecraft:dirt";

/** 設置に使うホットバーのスロット */
export const FILL_SLOT = 0;

/**
 * 掘るのに使う道具。
 *
 * **サバイバルでは素手だと土を掘るのに約0.75秒かかる。**
 * 埋没からの脱出は毎 tick 掘ろうとするので、道具が無いと永久に抜け出せない。
 */
export const DIG_TOOL = "minecraft:netherite_shovel";

/** 掘削に使うホットバーのスロット。設置用と分ける */
export const DIG_SLOT = 1;

/**
 * 体力・空腹を満タンに戻す間隔（tick）。
 *
 * 殴り合いで一気に削られることがあるので短めにする。
 * 100体 × 3 component でも 5 tick に1回なら安い。
 */
export const VITALS_INTERVAL = 5;

/**
 * 走査の中心。
 *
 * `null` ならボットの現在地を中心にする。
 * 座標を指定すると、常にそこを中心に走査する。
 */
export const SCAN_CENTER: { x: number; z: number } | null = null;

/** 一度に走査する最大半径 */
export const MAX_RADIUS = 64;

/**
 * 自動整地で使う半径。
 *
 * 1マスずつ歩いて埋めるので、広すぎると終わらない。
 * 半径8で最大 289 列 = 最大 1156 マス。
 * 走査はボットの現在地を中心に毎回やり直すので、
 * 狭くても作業しながら少しずつ進んでいく。
 */
export const AUTO_RADIUS = 8;

/** 対象が無くなったあと、次に探し直すまでの間隔（tick） */
export const RESCAN_INTERVAL = 200;

/**
 * 走査を分割する単位。この数ごとに1 tick 空ける（watchdog 対策）。
 *
 * `getTopmostBlock` は軽いので、AUTO_RADIUS=8 の 289 列なら 1 tick で足りる。
 * 小さくすると走査が何 tick にも分かれ、**動き出しが目に見えて遅くなる**。
 */
export const SCAN_CHUNK = 400;

/**
 * 1件あたり、移動に使ってよい最大 tick 数。超えたら諦めて次へ。
 *
 * 段差で詰まってもジャンプで復帰する余地を持たせるため、長めにとる。
 * 20 tick = 1秒なので、これは約 10 秒。
 */
export const MOVE_TIMEOUT_TICKS = 200;

/**
 * 作業ループの間隔（tick）。
 * 短いほど反応が良いが、負荷も上がる。2 tick = 0.1 秒。
 */
export const WORK_INTERVAL = 2;

/**
 * 1マス埋め終わってから次を探すまでの間隔（tick）。
 *
 * 0 にはしない。設置がワールドに反映される前に走査すると、
 * 埋めたばかりの場所をもう一度狙ってしまう。
 */
export const NEXT_TARGET_DELAY = 1;

/** 予約が他のボットとぶつかったときの、探し直しまでの間隔（tick） */
export const RETRY_DELAY = 2;

/**
 * 「どいて」と頼まれたボットが、どき続ける tick 数。
 *
 * この間は自分の移動指示を出さない。
 * 出すと、どく動きがその場で打ち消されて一歩も動けない。
 */
export const EVACUATE_TICKS = 30;

/** どく距離（ブロック） */
export const EVACUATE_DISTANCE = 4;

/**
 * 「どいて」と頼んだマスを、候補から外しておく tick 数。
 *
 * これが無いと次の走査でまた同じマスが最優先で選ばれ、
 * 頼んでは飛ばすを繰り返して一歩も進まない。
 */
export const DEFER_TICKS = 60;

// 手詰まりのときに半径を広げる仕組みは廃止した（2026-08-22）。
// 四角い走査は (2r+1)^2 列と高くつく割に距離が伸びない。
// 遠くは線で探す（`RAY_COUNT` / `RAY_LENGTH`）方が圧倒的に安い。

/**
 * 共有した走査結果を、何 tick まで信じるか。
 *
 * ボットが地形を変えたときはその場で記録を直すので、
 * これは「人が地形を変えた」ような場合の保険。
 * 20 tick = 1秒なので、これは 15 秒。
 */
export const TERRAIN_TTL = 300;

/** 共有する列の記録の上限。超えたら古いものから捨てる */
export const TERRAIN_CACHE_LIMIT = 20_000;

/**
 * 1マスに掛けてよい時間（tick）。超えたら諦めて次へ。
 *
 * 「経路は壊してよいので到達不可能は無い」方針だが、
 * それでも**進まないまま張り付く**ことはある。10 秒で見切る。
 * どいている間は数えない（自分の都合で止まっているわけではないため）。
 */
export const PLACE_TIMEOUT_TICKS = 200;

/**
 * 候補として覚えておくマスの数。
 *
 * 多いほど散らばるが、走査を打ち切れなくなる。
 */
export const CANDIDATE_LIMIT = 32;

/**
 * どき始めてから、歩いて逃げるのを諦めて
 * **下にブロックを積んで上へ逃げる**までの tick 数。
 */
export const EVACUATE_PILLAR_AFTER = 20;

// ---------------------------------------------------------------- 遠くを探す

/**
 * 遠くを探すときに飛ばす線の本数。
 *
 * 四角く走査すると半径 r で (2r+1)^2 列になり、遠くは現実的でない
 * （半径128 なら 66049 列）。
 * **線を何本か飛ばして拾い読みする**方がはるかに安い
 * （8本 × 128 = 1024 サンプルで同じ距離に届く）。
 *
 * 角度は毎回ランダム。何度も試すうちに周囲がまんべんなく当たる。
 */
export const RAY_COUNT = 8;

/** 線を伸ばす距離（ブロック） */
export const RAY_LENGTH = 256;

/** 他のボットが見つけた場所を、一度に何件まで見るか */
export const SHARED_JOB_LIMIT = 64;

/**
 * 共有記録から抜き取るときに、何件まで走査するか。
 *
 * 記録は数千件になりうる。全部なめると重いので途中で切る。
 * 抜き取りはランダムなので、切っても偏らない。
 */
export const SHARED_SCAN_LIMIT = 2000;

/**
 * やることが無いときに、次に探し直すまでの間隔（tick）。
 *
 * **空振りが続いても延ばさない。** 延ばすと、近くに埋める場所ができても
 * 待っている間はそれに気づけない。
 * この 100 tick の間、ボットは他のボットを殴っている（spec 3-A-8）。
 */
export const IDLE_RESCAN_TICKS = 100;

/**
 * 移動に見込む時間（1ブロックあたりの tick）。
 *
 * 諦めるまでの時間（`PLACE_TIMEOUT_TICKS`）にこれを足す。
 * 遠くの目標に固定の制限時間を使うと、着く前に必ず諦めてしまう。
 */
export const TRAVEL_TICKS_PER_BLOCK = 10;

/**
 * 探索が返ってこないまま放置してよい tick 数。
 *
 * `system.runJob` に渡したジェネレータが例外で死ぬと、
 * 完了通知が来ないまま「探索中」で固まり、**そのボットは二度と動かない**。
 * 保険として、この時間を過ぎたら探索し直す。
 */
export const SEARCH_WATCHDOG_TICKS = 200;

// ---------------------------------------------------------------- 殴り合い

/**
 * 暇なときに殴る間隔（tick）。
 *
 * **Bedrock のプレイヤーには攻撃クールダウンが無い**ので、
 * 1（毎 tick）にしてよい。詳細は spec 3-A-8。
 */
export const BRAWL_INTERVAL = 1;

/** 殴れる距離（ブロック）。これより遠ければ近づく */
export const BRAWL_REACH = 3;

/**
 * 殴る相手を選び直す間隔（tick）。
 *
 * 毎 tick 全員の距離を測ると 100体で1万回/tick になる。
 */
export const BRAWL_RETARGET_TICKS = 40;

/**
 * 殴ったときに与えるノックバックの強さ。
 *
 * **無敵時間を回避するための代替手段**（spec 3-A-8）。
 * ダメージ処理と違ってノックバックは無敵時間に縛られないので、
 * これだけは**毎 tick 効く**。
 * 0 にすると殴っても相手が反応しない。
 */
export const BRAWL_KNOCKBACK = 2.5;

/** ノックバックの上向き成分 */
export const BRAWL_KNOCKBACK_UP = 0.7;

/**
 * 1 tick に何回殴るか。
 *
 * `BRAWL_INTERVAL` は 1 tick が下限なので、
 * **それ以上速くするには同じ tick の中で何度も殴るしかない**。
 * 攻撃クールダウンは無いので、呼ぶだけ呼べる。
 */
export const BRAWL_SWINGS_PER_TICK = 20;

/**
 * 殴りに行くときの移動速度の倍率。
 *
 * 相手に届いていない間は殴れない。**移動が遅いと殴る回数も減る。**
 */
export const BRAWL_CHASE_SPEED = 3;

/**
 * 殴ったときの当たり音。
 *
 * **無敵時間の疑似回避**（spec 3-A-8）。
 * 赤く光る演出は約10 tick に1回しか出せないが、
 * **音とパーティクルは damage 処理を通らないので毎 tick 出せる**。
 * これで「連打が当たっている」ように見せる。
 *
 * ID は `reference/bedrock-samples/resource_pack/sounds.json` で確認したもの。
 */
export const BRAWL_HIT_SOUND = "game.player.attack.strong";

/** 殴られた側の悲鳴 */
export const BRAWL_HURT_SOUND = "game.player.hurt";

/** 音量。毎 tick × ボットの数だけ鳴るので控えめにする */
export const BRAWL_SOUND_VOLUME = 0.35;

/**
 * 当たったときのパーティクル。
 *
 * `reference/bedrock-samples/resource_pack/particles/critical_hit.json` の identifier。
 */
export const BRAWL_HIT_PARTICLE = "minecraft:critical_hit_emitter";

/**
 * 人間のプレイヤーが殴ったときの吹き飛ばし。
 *
 * ボット同士より控えめにする。強すぎると普通に遊べなくなる。
 */
export const PLAYER_PUNCH_KNOCKBACK = 1.2;

/** その上向き成分 */
export const PLAYER_PUNCH_KNOCKBACK_UP = 0.35;

/**
 * 何も進まないまま放置してよい tick 数。
 *
 * これを過ぎたら、外から強制的に作業をやり直させる。
 * **止まったボットを外から蹴り起こすための最後の砦。**
 */
export const STALL_LIMIT = 300;

/** 止まっているボットを見張る間隔（tick） */
export const SUPERVISOR_INTERVAL = 40;
