import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Backend, ListedObject, ObjectRead } from './storage.ts';

/**
 * A small S3 client for the storage backends that are buckets (Cloudflare R2, Backblaze B2 or
 * any other S3-compatible service): put, get (with a byte range), head, delete and list, signed
 * with AWS Signature Version 4 on top of fetch. Only what storage.ts needs, so no SDK.
 */

export interface S3Config {
  /** https://<accountid>.r2.cloudflarestorage.com, https://s3.<region>.backblazeb2.com, … */
  endpoint: string;
  /** "auto" for R2, e.g. "eu-central-003" for B2. */
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Put in front of every key ("slashclient/"), so one bucket can hold other things too. */
  prefix?: string;
  /** https://endpoint/bucket/key instead of https://bucket.endpoint/key. */
  pathStyle?: boolean;
}

const sha256 = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();
export const EMPTY_SHA256 = sha256('');

/** Percent-encoding as SigV4 wants it: everything but A-Z a-z 0-9 - . _ ~ (RFC 3986). */
export const uriEncode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

export interface SignInput {
  method: string;
  url: URL;
  /** Headers to sign besides host (lowercase or not); x-amz-date is added. */
  headers: Record<string, string>;
  /** Hex SHA-256 of the body (EMPTY_SHA256 without one, or "UNSIGNED-PAYLOAD"). */
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  date: Date;
}

/**
 * Signs a request (AWS Signature Version 4): answers the headers to send, the given ones plus
 * x-amz-date and authorization. The path of `url` must already be encoded the way it is sent
 * (S3 does not encode it a second time).
 */
export function signV4(i: SignInput): Record<string, string> {
  const amzDate = i.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(i.headers)) headers[k.toLowerCase()] = String(v);
  headers['x-amz-date'] = amzDate;
  const signed: Record<string, string> = { host: i.url.host, ...headers };
  const names = Object.keys(signed).sort();
  const canonicalHeaders = names.map((n) => `${n}:${signed[n].trim().replace(/\s+/g, ' ')}\n`).join('');
  const query = [...i.url.searchParams].map(([k, v]) => [uriEncode(k), uriEncode(v)]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('&');
  const canonical = [i.method, i.url.pathname || '/', query, canonicalHeaders, names.join(';'), i.payloadHash].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${i.secretAccessKey}`, day), i.region), i.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

/**
 * An endpoint as typed in the panel ("https://host[:port]"), or undefined: https only, plain http
 * just to this machine and only when `localHttp` allows it (tests with a fake S3).
 */
export function cleanEndpoint(raw: string, localHttp = false): string | undefined {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return undefined;
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local && localHttp)) return undefined;
  if (url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) return undefined;
  return `${url.protocol}//${url.host}`;
}

/** The text of the first <tag> in an S3 XML answer. */
const xmlText = (xml: string, tag: string) => {
  const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m ? m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&') : undefined;
};

export class S3Error extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message?: string) {
    super(`S3 ${status} ${code}${message ? `: ${message}` : ''}`);
    this.status = status;
    this.code = code;
  }
}

export class S3Backend implements Backend {
  readonly kind = 's3';
  private readonly cfg: S3Config;
  private readonly endpoint: URL;
  private readonly prefix: string;

  constructor(cfg: S3Config) {
    this.cfg = cfg;
    this.endpoint = new URL(cfg.endpoint);
    this.prefix = cfg.prefix ?? '';
  }

  /** The address of a key (or of the bucket itself with key ''). */
  private urlOf(key: string, query: Record<string, string> = {}): URL {
    const path = key ? `/${(this.prefix + key).split('/').map(uriEncode).join('/')}` : '/';
    const url = this.cfg.pathStyle === false
      ? new URL(`${this.endpoint.protocol}//${this.cfg.bucket}.${this.endpoint.host}${path}`)
      : new URL(`${this.endpoint.protocol}//${this.endpoint.host}/${uriEncode(this.cfg.bucket)}${key ? path : ''}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    return url;
  }

  private async send(method: string, url: URL, opts: { body?: Buffer; headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<Response> {
    const payloadHash = opts.body ? sha256(opts.body) : EMPTY_SHA256;
    const headers = signV4({
      method, url, payloadHash, region: this.cfg.region, service: 's3', date: new Date(),
      accessKeyId: this.cfg.accessKeyId, secretAccessKey: this.cfg.secretAccessKey,
      headers: { ...opts.headers, 'x-amz-content-sha256': payloadHash },
    });
    // the timer covers the answer's headers; a body being streamed to a player may take longer
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new Error('S3 timeout')), opts.timeoutMs ?? 30_000);
    try {
      return await fetch(url, { method, headers, body: opts.body as Uint8Array<ArrayBuffer> | undefined, signal: abort.signal, redirect: 'error' });
    } finally {
      clearTimeout(timer);
    }
  }

  private static async fail(res: Response): Promise<never> {
    const text = await res.text().catch(() => '');
    throw new S3Error(res.status, xmlText(text, 'Code') ?? res.statusText ?? 'error', xmlText(text, 'Message'));
  }

  async put(key: string, data: Buffer, type?: string): Promise<void> {
    // big uploads (a 90 MB clip) get time; fetch sets Content-Length from the buffer
    const res = await this.send('PUT', this.urlOf(key), { body: data, headers: type ? { 'content-type': type } : {}, timeoutMs: 10 * 60_000 });
    if (!res.ok) await S3Backend.fail(res);
    await res.arrayBuffer().catch(() => undefined);
  }

  async get(key: string, range?: string): Promise<ObjectRead | undefined> {
    const res = await this.send('GET', this.urlOf(key), { headers: range ? { range } : {} });
    if (res.status === 404) {
      await res.arrayBuffer().catch(() => undefined);
      return undefined;
    }
    if (res.status === 416) {
      await res.arrayBuffer().catch(() => undefined);
      const total = Number(/\/(\d+)$/.exec(res.headers.get('content-range') ?? '')?.[1]);
      return { unsatisfiable: true, total: Number.isFinite(total) ? total : 0 };
    }
    if (!res.ok || !res.body) await S3Backend.fail(res);
    const length = Number(res.headers.get('content-length'));
    const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream);
    if (res.status === 206) {
      const m = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(res.headers.get('content-range') ?? '');
      if (m) return { body, length: Number(m[2]) - Number(m[1]) + 1, total: m[3] === '*' ? undefined : Number(m[3]), range: { start: Number(m[1]), end: Number(m[2]) } };
    }
    return { body, length: Number.isFinite(length) ? length : undefined, total: Number.isFinite(length) ? length : undefined };
  }

  /** A small object read whole, with its ETag (for `putIf`); undefined when there is none. */
  async readTagged(key: string): Promise<{ data: Buffer; etag: string } | undefined> {
    const res = await this.send('GET', this.urlOf(key));
    if (res.status === 404) {
      await res.arrayBuffer().catch(() => undefined);
      return undefined;
    }
    if (!res.ok) await S3Backend.fail(res);
    return { data: Buffer.from(await res.arrayBuffer()), etag: res.headers.get('etag') ?? '' };
  }

  /**
   * Writes only if the object is still as it was read (its ETag) or, with null, is not there yet: two
   * servers cannot both take the failover lease. The new ETag, or undefined when someone else wrote first.
   */
  async putIf(key: string, data: Buffer, etag: string | null): Promise<string | undefined> {
    const res = await this.send('PUT', this.urlOf(key), { body: data, headers: { 'content-type': 'application/json', ...(etag === null ? { 'if-none-match': '*' } : { 'if-match': etag }) } });
    if (res.status === 412) {
      await res.arrayBuffer().catch(() => undefined);
      return undefined;
    }
    if (!res.ok) await S3Backend.fail(res);
    await res.arrayBuffer().catch(() => undefined);
    return res.headers.get('etag') ?? '';
  }

  async head(key: string): Promise<number | undefined> {
    const res = await this.send('HEAD', this.urlOf(key));
    if (res.status === 404) return undefined;
    if (!res.ok) throw new S3Error(res.status, res.statusText || 'error');
    return Number(res.headers.get('content-length')) || 0;
  }

  async delete(key: string): Promise<void> {
    const res = await this.send('DELETE', this.urlOf(key));
    // S3 answers 204 also for a key that was not there
    if (!res.ok && res.status !== 404) await S3Backend.fail(res);
    await res.arrayBuffer().catch(() => undefined);
  }

  async list(prefix: string): Promise<ListedObject[]> {
    const out: ListedObject[] = [];
    let token: string | undefined;
    do {
      const query: Record<string, string> = { 'list-type': '2', prefix: this.prefix + prefix };
      if (token) query['continuation-token'] = token;
      const res = await this.send('GET', this.urlOf('', query));
      if (!res.ok) await S3Backend.fail(res);
      const xml = await res.text();
      for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const key = xmlText(item, 'Key') ?? '';
        if (!key.startsWith(this.prefix)) continue;
        out.push({ key: key.slice(this.prefix.length), size: Number(xmlText(item, 'Size') ?? 0), modifiedMs: Date.parse(xmlText(item, 'LastModified') ?? '') || 0 });
      }
      token = xmlText(xml, 'IsTruncated') === 'true' ? xmlText(xml, 'NextContinuationToken') : undefined;
    } while (token);
    return out;
  }

  /** Writes, reads back and deletes a small object: the key, its rights and the bucket all work. */
  async check(): Promise<void> {
    const key = `.slashclient-test-${randomBytes(6).toString('hex')}`;
    const data = Buffer.from(`SlashClient ${new Date().toISOString()}`);
    await this.put(key, data, 'text/plain');
    try {
      const read = await this.get(key);
      if (!read || 'unsatisfiable' in read) throw new Error('zapisany plik testowy nie dał się odczytać');
      const chunks: Buffer[] = [];
      for await (const chunk of read.body) chunks.push(chunk as Buffer);
      if (!Buffer.concat(chunks).equals(data)) throw new Error('odczytany plik testowy różni się od zapisanego');
    } finally {
      await this.delete(key);
    }
  }
}
