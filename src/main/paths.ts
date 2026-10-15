import os from 'node:os';
import path from 'node:path';

function defaultRoot(): string {
  if (process.env.SLASHCLIENT_HOME) return process.env.SLASHCLIENT_HOME;
  switch (process.platform) {
    case 'darwin': return path.join(os.homedir(), 'Library', 'Application Support', 'SlashClient');
    case 'win32': return path.join(process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'), 'SlashClient');
    default: return path.join(os.homedir(), '.slashclient');
  }
}

export const ROOT = defaultRoot();

/** Shared across all profiles. */
export const paths = {
  root: ROOT,
  versions: path.join(ROOT, 'versions'),
  libraries: path.join(ROOT, 'libraries'),
  assets: path.join(ROOT, 'assets'),
  runtimes: path.join(ROOT, 'runtimes'),
  instances: path.join(ROOT, 'instances'),
  config: path.join(ROOT, 'config'),
  versionDir: (id: string) => path.join(ROOT, 'versions', id),
  versionJson: (id: string) => path.join(ROOT, 'versions', id, `${id}.json`),
  versionJar: (id: string) => path.join(ROOT, 'versions', id, `${id}.jar`),
  natives: (id: string) => path.join(ROOT, 'versions', id, 'natives'),
};
