/**
 * 最小限の PNG 書き出し。
 *
 * 外部パッケージを使わない。Node の zlib だけで足りるため。
 * 依存を増やすと、この道具を動かすまでの手数が増える。
 */
import { deflateSync } from "node:zlib";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * RGBA のピクセル配列を PNG にする。
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array} rgba  width*height*4
 */
export function encodePng(width, height, rgba) {
  // 各行の先頭にフィルタ種別（0 = なし）を入れるのが PNG の決まり
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw, y * (stride + 1) + 1
    );
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // ビット深度
  ihdr[9] = 6;   // カラータイプ: RGBA
  ihdr[10] = 0;  // 圧縮方式
  ihdr[11] = 0;  // フィルタ方式
  ihdr[12] = 0;  // インターレースなし

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
