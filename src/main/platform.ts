import os from 'node:os';

export type OsName = 'osx' | 'windows' | 'linux';

export const osName: OsName =
  process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'windows' : 'linux';

/** Architecture in the form used by Mojang's rules ("x86" means 32-bit). */
export const arch = process.arch;
export const is64 = arch === 'x64' || arch === 'arm64';

export const osVersion = os.release();

export const classpathSeparator = process.platform === 'win32' ? ';' : ':';
