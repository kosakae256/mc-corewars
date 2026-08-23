/**
 * .mcstructure（リトルエンディアン・非圧縮 NBT）を読む。
 *
 * 書き出し専用の `mcstructure.mjs` に対する**検算用**。
 * 「書いたつもり」ではなく「実際にファイルに何が入っているか」を見る。
 * 読み込めない構造物の原因を、推測ではなく中身で特定するために要る。
 */

const TAG = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11,
};

class Reader {
  constructor(buf) {
    this.b = buf;
    this.p = 0;
  }
  u8() { return this.b[this.p++]; }
  i16() { const v = this.b.readInt16LE(this.p); this.p += 2; return v; }
  i32() { const v = this.b.readInt32LE(this.p); this.p += 4; return v; }
  i64() { const v = this.b.readBigInt64LE(this.p); this.p += 8; return v; }
  f32() { const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.p); this.p += 8; return v; }
  str() {
    const n = this.b.readUInt16LE(this.p);
    this.p += 2;
    const s = this.b.toString("utf8", this.p, this.p + n);
    this.p += n;
    return s;
  }

  payload(type) {
    switch (type) {
      case TAG.BYTE: return this.u8();
      case TAG.SHORT: return this.i16();
      case TAG.INT: return this.i32();
      case TAG.LONG: return this.i64();
      case TAG.FLOAT: return this.f32();
      case TAG.DOUBLE: return this.f64();
      case TAG.BYTE_ARRAY: {
        const n = this.i32();
        const v = this.b.subarray(this.p, this.p + n);
        this.p += n;
        return v;
      }
      case TAG.STRING: return this.str();
      case TAG.LIST: {
        const et = this.u8();
        const n = this.i32();
        const out = [];
        for (let i = 0; i < n; i++) out.push(this.payload(et));
        out.__elemType = et;
        return out;
      }
      case TAG.COMPOUND: {
        const out = {};
        for (;;) {
          const t = this.u8();
          if (t === TAG.END) break;
          const name = this.str();
          out[name] = this.payload(t);
          if (out.__types === undefined) Object.defineProperty(out, "__types", { value: {}, enumerable: false });
          out.__types[name] = t;
        }
        return out;
      }
      case TAG.INT_ARRAY: {
        const n = this.i32();
        const out = new Int32Array(n);
        for (let i = 0; i < n; i++) out[i] = this.i32();
        return out;
      }
      default:
        throw new Error(`未知のタグ ${type} （位置 ${this.p}）`);
    }
  }
}

/** ファイル全体を読んで、ルートの compound を返す。 */
export function readNbt(buf) {
  const r = new Reader(buf);
  const t = r.u8();
  if (t !== TAG.COMPOUND) throw new Error(`ルートが compound ではない: ${t}`);
  r.str();
  const root = r.payload(TAG.COMPOUND);
  return { root, consumed: r.p, total: buf.length };
}
