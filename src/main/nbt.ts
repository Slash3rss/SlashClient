import zlib from 'node:zlib';

/**
 * Just enough of Minecraft's NBT format to read level.dat:
 * gzip-compressed, big-endian, named tags. Returns plain JS values
 * (compounds → objects, lists/arrays → arrays, longs → bigint).
 */
export type NbtValue = number | bigint | string | NbtValue[] | { [key: string]: NbtValue } | Int8Array | Int32Array | BigInt64Array;

class Reader {
  offset = 0;
  constructor(private buf: Buffer) {}
  byte() { return this.buf.readInt8(this.offset++); }
  short() { const v = this.buf.readInt16BE(this.offset); this.offset += 2; return v; }
  int() { const v = this.buf.readInt32BE(this.offset); this.offset += 4; return v; }
  long() { const v = this.buf.readBigInt64BE(this.offset); this.offset += 8; return v; }
  float() { const v = this.buf.readFloatBE(this.offset); this.offset += 4; return v; }
  double() { const v = this.buf.readDoubleBE(this.offset); this.offset += 8; return v; }
  string() {
    const len = this.buf.readUInt16BE(this.offset);
    this.offset += 2;
    const s = this.buf.subarray(this.offset, this.offset + len).toString('utf8');
    this.offset += len;
    return s;
  }
  payload(type: number): NbtValue {
    switch (type) {
      case 1: return this.byte();
      case 2: return this.short();
      case 3: return this.int();
      case 4: return this.long();
      case 5: return this.float();
      case 6: return this.double();
      case 7: { const n = this.int(); const a = new Int8Array(this.buf.subarray(this.offset, this.offset + n)); this.offset += n; return a; }
      case 8: return this.string();
      case 9: {
        const itemType = this.byte();
        const n = this.int();
        return Array.from({ length: n }, () => this.payload(itemType));
      }
      case 10: {
        const obj: Record<string, NbtValue> = {};
        for (;;) {
          const t = this.byte();
          if (t === 0) return obj;
          const name = this.string();
          obj[name] = this.payload(t);
        }
      }
      case 11: { const n = this.int(); return Int32Array.from({ length: n }, () => this.int()); }
      case 12: { const n = this.int(); return BigInt64Array.from({ length: n }, () => this.long()); }
      default: throw new Error(`Nieznany typ NBT ${type}`);
    }
  }
}

export function readNbt(data: Buffer): Record<string, NbtValue> {
  const raw = data[0] === 0x1f && data[1] === 0x8b ? zlib.gunzipSync(data) : data;
  const r = new Reader(raw);
  const type = r.byte();
  if (type !== 10) throw new Error('level.dat nie zaczyna się od compound');
  r.string(); // root name
  return r.payload(10) as Record<string, NbtValue>;
}
