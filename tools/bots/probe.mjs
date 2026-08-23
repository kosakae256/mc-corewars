// 使い捨ての診断スクリプト。
// ボットを1体繋いで、ゲームモード・座標・受信パケットの種類を調べる。
// 整地ボットの設計判断（地形をどう知るか）のために使う。
import bedrock from "bedrock-protocol";

const client = bedrock.createClient({
  host: "127.0.0.1",
  port: 19132,
  username: "probe",
  offline: true,
  conLog: () => {},
});

const seen = new Map();
client.on("packet", (p) => {
  const n = p?.data?.name;
  if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
});

client.on("spawn", () => {
  const sg = client.startGameData ?? {};
  console.log("=== start_game ===");
  console.log("player_gamemode :", sg.player_gamemode);
  console.log("world_gamemode  :", sg.world_gamemode);
  console.log("player_position :", JSON.stringify(sg.player_position));
  console.log("permission_level:", sg.permission_level);
  console.log("itemstates      :", Array.isArray(sg.itemstates) ? sg.itemstates.length : "?");

  setTimeout(() => {
    console.log("\n=== 受信したパケット（多い順・上位20）===");
    [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .forEach(([n, c]) => console.log(`  ${String(c).padStart(5)}  ${n}`));
    client.close();
    process.exit(0);
  }, 6000);
});

client.on("error", (e) => {
  console.error("error:", e?.message ?? e);
  process.exit(1);
});

setTimeout(() => {
  console.error("タイムアウト");
  process.exit(1);
}, 25000);
