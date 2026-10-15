// Headless entry point for testing installs and launches without the GUI:
//   node dist/cli.js <version|latest-release> [nick]
import { createOfflineAccount } from './auth';
import { launch } from './launch';
import { newProfile } from './store';

async function main() {
  const [versionId = 'latest-release', nick = 'Gracz'] = process.argv.slice(2);
  let lastStage = '';
  const child = await launch({
    profile: newProfile({ name: 'cli', versionId, memoryMb: 2048 }),
    account: createOfflineAccount(nick),
    onStage: (stage, done, total, stats) => {
      if (stage !== lastStage) process.stdout.write('\n');
      lastStage = stage;
      const pct = stats?.totalBytes ? ` ${((stats.bytes / stats.totalBytes) * 100).toFixed(1)}%` : '';
      const speed = stats ? ` ${(stats.speed / 1024 / 1024).toFixed(2)} MB/s` : '';
      process.stdout.write(`\r[${stage}] ${done}/${total}${pct}${speed}   `);
    },
    onLog: (line) => console.log(line),
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
