import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { signV4 } from '../src/s3.ts';

/**
 * A tiny S3 for the tests (path-style only): PUT, GET with a range, HEAD, DELETE and
 * ListObjectsV2, every request's signature checked against the same signer (which is itself
 * checked against AWS's published examples in storage.test.ts).
 */

export interface FakeObject { data: Buffer; type: string; modifiedMs: number }

export interface FakeS3 {
  url: string;
  objects: Map<string, FakeObject>;
  requests: { method: string; path: string; status: number }[];
  /** Answer the next n requests with 500. */
  failNext: (n: number) => void;
  /** Keys listed per page (S3 says 1000). */
  pageSize: number;
  close: () => Promise<void>;
}

const xml = (code: string, message: string) => `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function startFakeS3(opts: { bucket: string; region: string; keys: Record<string, string> }): Promise<FakeS3> {
  const objects = new Map<string, FakeObject>();
  const requests: FakeS3['requests'] = [];
  let failing = 0;
  const fake: FakeS3 = { url: '', objects, requests, failNext: (n) => { failing = n; }, pageSize: 1000, close: async () => undefined };

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = Buffer.concat(chunks);
    const url = new URL(`http://${req.headers.host}${req.url}`);
    const answer = (status: number, text = '', headers: Record<string, string | number> = {}) => {
      requests.push({ method: req.method ?? '', path: url.pathname + url.search, status });
      res.writeHead(status, { 'Content-Type': 'application/xml', ...headers });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    if (failing > 0) {
      failing--;
      return answer(500, xml('InternalError', 'try again'));
    }

    // the signature, recomputed with the secret of the key it names
    const auth = /^AWS4-HMAC-SHA256 Credential=([^/]+)\/(\d{8})\/([^/]+)\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(req.headers.authorization ?? '');
    if (!auth) return answer(403, xml('AccessDenied', 'no signature'));
    const secret = opts.keys[auth[1]];
    if (!secret) return answer(403, xml('InvalidAccessKeyId', 'unknown key'));
    const payloadHash = String(req.headers['x-amz-content-sha256'] ?? '');
    const amzDate = String(req.headers['x-amz-date'] ?? '');
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(amzDate);
    if (!m || auth[3] !== opts.region) return answer(400, xml('AuthorizationHeaderMalformed', 'bad date or region'));
    if (payloadHash !== createHash('sha256').update(body).digest('hex')) return answer(400, xml('XAmzContentSHA256Mismatch', 'body hash'));
    const signedNames = auth[4].split(';');
    const headers: Record<string, string> = {};
    for (const n of signedNames) if (n !== 'host' && n !== 'x-amz-date') headers[n] = String(req.headers[n] ?? '');
    const expected = signV4({
      method: req.method ?? '', url, headers, payloadHash, region: opts.region, service: 's3', accessKeyId: auth[1], secretAccessKey: secret,
      date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])),
    });
    if (expected.authorization !== req.headers.authorization) return answer(403, xml('SignatureDoesNotMatch', 'signature'));

    const parts = url.pathname.split('/');
    const bucket = decodeURIComponent(parts[1] ?? '');
    if (bucket !== opts.bucket) return answer(404, xml('NoSuchBucket', 'no bucket'));
    const key = parts.slice(2).map(decodeURIComponent).join('/');

    if (!key && req.method === 'GET' && url.searchParams.get('list-type') === '2') {
      const prefix = url.searchParams.get('prefix') ?? '';
      const all = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
      const from = Number(url.searchParams.get('continuation-token') ?? 0);
      const page = all.slice(from, from + fake.pageSize);
      const more = from + page.length < all.length;
      return answer(200, `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket}</Name><Prefix>${esc(prefix)}</Prefix><KeyCount>${page.length}</KeyCount>`
        + page.map((k) => `<Contents><Key>${esc(k)}</Key><LastModified>${new Date(objects.get(k)!.modifiedMs).toISOString()}</LastModified><Size>${objects.get(k)!.data.length}</Size></Contents>`).join('')
        + `<IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${from + page.length}</NextContinuationToken>` : ''}</ListBucketResult>`);
    }
    if (!key) return answer(400, xml('InvalidRequest', 'no key'));
    const obj = objects.get(key);
    switch (req.method) {
      case 'PUT':
        objects.set(key, { data: body, type: String(req.headers['content-type'] ?? 'application/octet-stream'), modifiedMs: Date.now() });
        return answer(200, '', { ETag: '"x"' });
      case 'DELETE':
        objects.delete(key);
        return answer(204);
      case 'HEAD':
        if (!obj) return answer(404);
        return answer(200, '', { 'Content-Length': obj.data.length, 'Content-Type': obj.type });
      case 'GET': {
        if (!obj) return answer(404, xml('NoSuchKey', 'no key'));
        const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
        if (range) {
          const size = obj.data.length;
          const start = range[1] ? Number(range[1]) : size - Number(range[2]);
          const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
          if (start >= size || start > end) return answer(416, xml('InvalidRange', 'range'), { 'Content-Range': `bytes */${size}` });
          requests.push({ method: 'GET', path: url.pathname, status: 206 });
          res.writeHead(206, { 'Content-Type': obj.type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
          return res.end(obj.data.subarray(start, end + 1));
        }
        requests.push({ method: 'GET', path: url.pathname, status: 200 });
        res.writeHead(200, { 'Content-Type': obj.type, 'Content-Length': obj.data.length });
        return res.end(obj.data);
      }
      default:
        return answer(405, xml('MethodNotAllowed', 'method'));
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  fake.close = () => new Promise<void>((r) => {
    server.closeAllConnections();
    server.close(() => r());
  });
  return fake;
}
