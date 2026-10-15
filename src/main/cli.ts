// Headless entry point for testing installs and launches without the GUI:
//   node dist/cli.js <version|latest-release> [nick] [server] [--fabric]
// --fabric starts the game with Fabric and SlashClient HUD, as the launcher does.
import path from 'node:path';
import { createOfflineAccount } from './auth';
import { prepareHud } from './hud';
import { newProfile, profileGameDir } from './store';
import { launch, resolveVersionId } from './launch';

async function main() {
  const args = process.argv.slice(2);
  const fabric = args.includes('--fabric');
  const [versionId = 'latest-release', nick = 'Gracz', server] = args.filter((a) => a !== '--fabric');
  const profile = newProfile({ name: 'cli', versionId, memoryMb: 2048, loader: fabric ? 'fabric' : 'vanilla' });
  if (fabric) {
    const hud = await prepareHud(path.join(__dirname, 'hud'), profileGameDir(profile), { enabled: true, loader: 'fabric', gameVersion: await resolveVersionId(versionId) });
    console.log(hud ? 'SlashClient HUD: włączony' : 'SlashClient HUD: niedostępny dla tej wersji');
  }
  let lastStage = '';
  const child = await launch({
    profile,
    account: createOfflineAccount(nick),
    onStage: (stage, done, total, stats) => {
      if (stage !== lastStage) process.stdout.write('\n');
      lastStage = stage;
      const pct = stats?.totalBytes ? ` ${((stats.bytes / stats.totalBytes) * 100).toFixed(1)}%` : '';
      const speed = stats ? ` ${(stats.speed / 1024 / 1024).toFixed(2)} MB/s` : '';
      process.stdout.write(`\r[${stage}] ${done}/${total}${pct}${speed}   `);
    },
    onLog: (line) => console.log(line),
    server,
  });
  child.on('exit', (code, signal) => {
    console.log(`Gra zakończona (kod ${code}${signal ? `, sygnał ${signal}` : ''})`);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
