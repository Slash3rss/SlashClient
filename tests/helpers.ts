import zlib from 'node:zlib';

/** Writes a tiny gzip-compressed level.dat by hand. */
export function levelDat(name: string, gameType: number): Buffer {
  const str = (s: string) => { const b = Buffer.from(s); const l = Buffer.alloc(2); l.writeUInt16BE(b.length); return Buffer.concat([l, b]); };
  const tag = (type: number, name: string, payload: Buffer) => Buffer.concat([Buffer.from([type]), str(name), payload]);
  const int = (v: number) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return b; };
  const long = (v: bigint) => { const b = Buffer.alloc(8); b.writeBigInt64BE(v); return b; };
  const data = Buffer.concat([tag(8, 'LevelName', str(name)), tag(3, 'GameType', int(gameType)), tag(4, 'LastPlayed', long(1792019201727n)), Buffer.from([0])]);
  return zlib.gzipSync(tag(10, '', Buffer.concat([tag(10, 'Data', data), Buffer.from([0])])));
}

