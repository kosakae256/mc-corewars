/**
 * 参加中のプレイヤーのスキンを抜き出して PNG で保存する。
 *
 *   node tools/bots/dump-skins.mjs [保存先フォルダ]
 *
 * 仕組み: ボットを1体繋ぎ、`player_list` / `player_skin` パケットに
 * 含まれるスキン画像（生の RGBA ピクセル配列）を PNG に変換して書き出す。
 *
 * PNG は zlib だけで作れるので、画像ライブラリは使わない。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

import bedrock from "bedrock-protocol";

const outDir = process.argv[2] ?? join(process.env.USERPROFILE ?? ".", "Downloads", "mc-skins");

// ---------------------------------------------------------------- PNG 書き出し

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** RGBA の生ピクセルから PNG を作る */
function toPng(width, height, rgba) {
  // 各行の先頭にフィルタ種別（0 = None）を入れる必要がある
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ 抽出

const safe = (s) => String(s).replace(/[^A-Za-z0-9_\-.]/g, "_").slice(0, 40) || "unknown";
const saved = new Set();

function saveImage(label, kind, image) {
  if (!image || !image.data || !image.width || !image.height) return false;
  const data = Buffer.isBuffer(image.data) ? image.data : Buffer.from(image.data);
  // 幅×高さ×4 に満たないものは壊れているので捨てる
  if (data.length < image.width * image.height * 4) return false;

  const key = `${label}/${kind}/${createHash("md5").update(data).digest("hex").slice(0, 8)}`;
  if (saved.has(key)) return false;
  saved.add(key);

  const file = join(outDir, `${safe(label)}_${kind}_${image.width}x${image.height}.png`);
  writeFileSync(file, toPng(image.width, image.height, data));
  console.log(`  保存: ${file}`);
  return true;
}

function handleSkin(label, skin) {
  if (!skin) return;
  let n = 0;
  if (saveImage(label, "skin", skin.skin_data)) n++;
  if (saveImage(label, "cape", skin.cape_data)) n++;
  if (n > 0) {
    console.log(
      `  ${label}: skin_id=${skin.skin_id ?? "?"} arm=${skin.arm_size ?? "?"} persona=${skin.persona ?? "?"}`
    );
  }
}

// ------------------------------------------------------------------ 接続

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
console.log(`保存先: ${outDir}\n`);

const client = bedrock.createClient({
  host: "127.0.0.1",
  port: 19132,
  username: "skindump",
  offline: true,
  conLog: () => {},
});

// 生パケットから読む。
// 名前付きイベント（client.on("player_list")）は発火しなかったため。
// また `records` は配列ではなくキーが 0,1,2... のオブジェクトで届く。
client.on("packet", (p) => {
  if (p?.data?.name !== "player_list") return;
  const recs = p.data.params?.records;
  if (!recs) return;
  const list = Array.isArray(recs) ? recs : Object.values(recs.records ?? recs);

  for (const rec of list) {
    if (!rec || typeof rec !== "object") continue;
    handleSkin(rec.username ?? rec.xbox_user_id ?? "unknown", rec.skin_data);
  }
});

client.on("spawn", () => {
  console.log("接続しました。スキン情報を収集中...\n");
  setTimeout(() => {
    console.log(`\n完了。${saved.size} 件を保存しました。`);
    client.close();
    process.exit(0);
  }, 12000);
});

client.on("error", (e) => {
  console.error("エラー:", e?.message ?? e);
  process.exit(1);
});

setTimeout(() => {
  console.error("タイムアウト");
  process.exit(1);
}, 40000);
