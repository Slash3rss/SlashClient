/**
 * The spare server's tool (deploy/failover/): run with the same environment as the server.
 *
 *   node src/failoverTool.ts lease     who holds the lease and how long ago it was renewed (JSON)
 *   node src/failoverTool.ts restore   the last copy of the database and the files put in place
 */
import path from 'node:path';
import { Leader, LEASE_TTL_MS, failoverFromEnv, restore } from './failover.ts';

const fo = failoverFromEnv();
if (!fo) {
  console.error('Brak ustawień awaryjności (FAILOVER_NODE i FAILOVER_S3_*).');
  process.exit(2);
}
const dbFile = path.resolve(process.env.DB_FILE ?? 'social.db');
const command = process.argv[2];

if (command === 'lease') {
  const { lease } = await new Leader({ node: fo.node, store: fo.store, onLost: () => {} }).read();
  const ageMs = lease ? Date.now() - lease.renewedAt : undefined;
  console.log(JSON.stringify({ me: fo.node, holder: lease?.node ?? null, term: lease?.term ?? 0, ageMs: ageMs ?? null, stale: !lease || ageMs! >= LEASE_TTL_MS }));
} else if (command === 'restore') {
  await restore({ store: fo.store, dbFile, dataDir: path.dirname(dbFile), log: (m) => console.log(m) });
} else {
  console.error('Użycie: node src/failoverTool.ts lease|restore');
  process.exit(2);
}
