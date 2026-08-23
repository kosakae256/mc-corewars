/**
 * bedrock-portal 起動スクリプト
 *
 * Xbox Live 上に「参加可能なゲームセッション」を作り、
 * 参加してきたプレイヤーを portal.config.json の ip/port（= BDS）へリダイレクトする。
 * これにより、認証したアカウントのフレンドから見て
 * 「フレンドがワールドを開いている」ように見える。
 *
 * 仕様: docs/spec/01-mc-tool.md / 調査: docs/research/03-bds-and-friend-join.md
 *
 * 直接叩かず `node tools/mc.mjs portal start` から起動する。
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// bedrock-portal は CommonJS なので、default import してから分解する
import pkg from "bedrock-portal";
const { BedrockPortal, Joinability, Modules } = pkg;

const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(HERE, "portal.config.json"), "utf8"));

// 進行状況をログに残す（mc.mjs logs portal で見る）
process.env.DEBUG = process.env.DEBUG ?? "bedrock-portal*";

const joinability = Joinability[config.joinability];
if (!joinability) {
  console.error(
    `joinability の値が不正です: ${config.joinability}\n` +
    `使える値: ${Object.keys(Joinability).join(", ")}`
  );
  process.exit(1);
}

const portal = new BedrockPortal({
  ip: config.ip,
  port: config.port,
  joinability,
  host: {
    username: config.account.username,
    // トークンのキャッシュ先。git 管理外
    cache: resolve(HERE, config.account.cacheDir),
  },
  // フレンド欄に出るカードの見た目。実際の接続先は上の ip/port
  world: config.world,
});

// Player は { profile, session } という形。gamertag は profile の下にある
// （player.gamertag を直接見ると undefined になる）
const who = (player) =>
  player?.profile?.gamertag ?? player?.profile?.xuid ?? "(不明)";

// フレンド申請の自動承認。
// フレンド欄に出すには「portal のアカウント」と「見る側」が相互フレンドである必要がある。
// 見る側から申請してもらい、それをここで自動承認する。
// allow に載せた gamertag 以外は承認しない（誰彼構わず承認しないため）。
if (config.autoFriendAccept?.enabled) {
  const allow = new Set(config.autoFriendAccept.allow ?? []);
  portal.use(Modules.AutoFriendAccept, {
    inviteOnAdd: config.autoFriendAccept.inviteOnAdd ?? false,
    conditionToMeet: (request) => {
      const ok = allow.has(request.gamertag);
      console.log(
        `[portal] フレンド申請: ${request.gamertag} → ${ok ? "承認" : "無視（許可リスト外）"}`
      );
      return ok;
    },
  });
  portal.on("friendAdded", (player) => {
    console.log(`[portal] フレンドになりました: ${who(player)}`);
  });
}

// リスナーは start() より前に登録する（後だと取りこぼす）
portal.on("sessionCreated", () => {
  console.log("[portal] セッションを作成しました");
});
portal.on("playerJoin", (player) => {
  console.log(`[portal] 参加: ${who(player)}`);
});
portal.on("playerLeave", (player) => {
  console.log(`[portal] 退出: ${who(player)}`);
});

async function main() {
  console.log("[portal] 起動中...");
  console.log(`[portal] 転送先   : ${config.ip}:${config.port}`);
  console.log(`[portal] ワールド : ${config.world.name}`);
  console.log(`[portal] 公開範囲 : ${config.joinability}`);
  console.log("");
  console.log("初回は Xbox Live のデバイスコード認証が必要です。");
  console.log("下に出る URL とコードを、ブラウザで入力してください。");
  console.log("");

  await portal.start();

  console.log("");
  console.log(`[portal] 開始しました。ホスト: ${portal.host.profile.gamertag}`);
  console.log("[portal] このアカウントのフレンドから、フレンド欄に表示されます。");
}

main().catch((err) => {
  console.error("[portal] 起動に失敗しました:", err);
  process.exit(1);
});

// 停止時にセッションを畳む
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log("[portal] 停止します");
    process.exit(0);
  });
}
