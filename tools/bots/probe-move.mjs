/**
 * 段階2の検証: ボットが `player_auth_input` で移動できるかを確かめる。
 *
 *   node tools/bots/probe-move.mjs [北へ進む距離]
 *
 * やること:
 *   1. 接続して自分の位置を把握する（= 地面の高さも分かる）
 *   2. `player_auth_input` を毎tick送り、指定方向へ歩く
 *   3. 位置が実際に変わったかを記録する
 *
 * 結果は probe-move.txt に書く（標準出力が親シェルに届かないことがあるため）。
 */
import { appendFileSync, writeFileSync } from "node:fs";

import bedrock from "bedrock-protocol";

const DISTANCE = Number(process.argv[2] ?? 6);
const OUT = "probe-move.txt";
writeFileSync(OUT, "");

function log(...parts) {
  const line = parts.join(" ");
  appendFileSync(OUT, line + "\n");
  console.log(line);
}

const client = bedrock.createClient({
  host: "127.0.0.1",
  port: 19132,
  username: "walker",
  offline: true,
  conLog: () => {},
});

/** 現在位置。サーバーからの補正で更新する */
let pos = null;
let tick = 0n;

// サーバーが送ってくる位置。これが唯一の正解
client.on("packet", (p) => {
  const name = p?.data?.name;
  const params = p?.data?.params;
  if (name === "move_player" && params?.runtime_id === client.entityId) {
    pos = { ...params.position };
  } else if (name === "player_location" || name === "respawn") {
    if (params?.position) pos = { ...params.position };
  }
});

const fmt = (p) =>
  p ? `x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)}` : "(不明)";

client.on("spawn", () => {
  const sg = client.startGameData ?? {};
  pos = pos ?? { ...sg.player_position };
  log("spawn しました");
  log("初期位置 :", fmt(pos));
  log("ゲームモード:", String(sg.player_gamemode), "/ world:", String(sg.world_gamemode));

  const start = { ...pos };
  let sent = 0;

  // 毎tick（50ms）入力を送る。move_vector の y が前進量
  const timer = setInterval(() => {
    if (!pos) return;
    tick += 1n;
    sent++;

    client.queue("player_auth_input", {
      pitch: 0,
      yaw: 0,
      head_yaw: 0,
      position: pos,
      move_vector: { x: 0, z: 1 }, // 前進
      input_data: {
        // 前進の入力フラグ。名称は protocol.json の input_data に従う
        up: true,
        sprinting: false,
        sneaking: false,
        jumping: false,
        start_sprinting: false,
      },
      input_mode: "mouse",
      play_mode: "screen",
      interaction_model: "crosshair",
      interact_rotation: { x: 0, z: 0 },
      tick,
      delta: { x: 0, y: 0, z: 0 },
      transaction_presence: false,
      item_stack_request_presence: false,
      block_action_presence: false,
      vehicle_rotation_presence: false,
      predicted_vehicle_presence: false,
      analogue_move_vector: { x: 0, z: 1 },
      camera_orientation: { x: 0, y: 0, z: 0 },
      raw_move_vector: { x: 0, z: 1 },
    });

    if (sent % 20 === 0) log(`  ${sent}tick 経過:`, fmt(pos));

    if (sent >= 100) {
      clearInterval(timer);
      const moved =
        Math.hypot(pos.x - start.x, pos.z - start.z).toFixed(2);
      log("");
      log("開始位置 :", fmt(start));
      log("終了位置 :", fmt(pos));
      log(`水平移動距離: ${moved} ブロック`);
      log(moved > 0.5 ? "=> 移動できた" : "=> 移動していない");
      try {
        client.close();
      } catch {
        /* 既に切れている */
      }
      process.exit(0);
    }
  }, 50);
});

client.on("error", (e) => {
  log("エラー: " + (e?.message ?? String(e)));
  process.exit(1);
});

setTimeout(() => {
  log("タイムアウト");
  process.exit(1);
}, 40000);

void DISTANCE;
