// Compiles tests/*.test.ts with esbuild and runs them with Node's built-in test runner.
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';

const out = '.test-out';
rmSync(out, { recursive: true, force: true });
const entryPoints = readdirSync('tests').filter((f) => f.endsWith('.test.ts')).map((f) => `tests/${f}`);
await build({ entryPoints, outdir: out, bundle: true, platform: 'node', format: 'cjs', target: 'node20', sourcemap: 'inline', logLevel: 'warning', external: ['electron'] });
const files = readdirSync(out).filter((f) => f.endsWith('.js')).map((f) => `${out}/${f}`);
const { status } = spawnSync(process.execPath, ['--enable-source-maps', '--test', ...files], { stdio: 'inherit' });
process.exit(status ?? 1);
