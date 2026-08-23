// 使い捨ての診断。player_list に含まれる skin_data の実際の形を調べる。
// 標準出力が親シェルに届かないことがあったので、ファイルにも書く。
import { appendFileSync, writeFileSync } from "node:fs";

import bedrock from "bedrock-protocol";

const OUT = "skin-report.txt";
writeFileSync(OUT, "");

function log(...parts) {
  const line = parts.join(" ");
  appendFileSync(OUT, line + "\n");
  console.log(line);
}

const client = bedrock.createClient({
  host: "127.0.0.1",
  port: 19132,
  username: "inspector2",
  offline: true,
  conLog: () => {},
});

const done = new Set();

function describeImage(img) {
  if (!img) return "なし";
  const len = Buffer.isBuffer(img.data) ? img.data.length : typeof img.data;
  return `w=${img.width} h=${img.height} data=${len}`;
}

client.on("player_list", (p) => {
  if (p.records?.type !== "add") return;
  for (const r of p.records.records ?? []) {
    if (done.has(r.username)) continue;
    done.add(r.username);

    const s = r.skin_data ?? {};
    log(`--- ${r.username} ---`);
    log("  キー         :", Object.keys(s).join(", "));
    log("  skin_data    :", describeImage(s.skin_data));
    log("  cape_data    :", describeImage(s.cape_data));
    log("  persona:", String(s.persona), " premium:", String(s.premium), " arm:", String(s.arm_size));
  }
});

// player_list は spawn より前に届くことがあるため、
// spawn を待たずに一定時間観察する
client.on("packet", (p) => {
  const name = p?.data?.name;
  if (name !== "player_list") return;
  // 名前付きイベントで拾えなかったので、生パケットから直接読む
  const params = p?.data?.params ?? {};
  log(`[raw] player_list キー: ${Object.keys(params).join(", ")}`);
  const recs = params.records;
  log(`[raw] records の型: ${typeof recs} キー: ${recs && typeof recs === "object" ? Object.keys(recs).join(",") : "-"}`);
  const list = recs?.records ?? (Array.isArray(recs) ? recs : []);
  for (const r of list) {
    if (done.has(r.username)) continue;
    done.add(r.username);
    const s2 = r.skin_data ?? {};
    log(`--- ${r.username} ---`);
    log("  skin_data のキー:", Object.keys(s2).join(", ").slice(0, 200));
    log("  skin_data :", describeImage(s2.skin_data));
    log("  cape_data :", describeImage(s2.cape_data));
    log("  persona:", String(s2.persona), "arm:", String(s2.arm_size));
  }
});

client.on("spawn", () => log("spawn しました"));

setTimeout(() => {
  log(`観察終了。${done.size} 人ぶん記録`);
  try { client.close(); } catch {}
  process.exit(0);
}, 15000);

client.on("error", (e) => {
  log("エラー: " + (e?.message ?? String(e)));
  process.exit(1);
});

setTimeout(() => process.exit(1), 30000);
