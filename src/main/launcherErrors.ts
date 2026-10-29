import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * Errors nobody caught in the launcher's main process. Without a handler Electron shows a window
 * with the stack trace, which tells the player nothing; here the details go to the launcher's log
 * (the terminal and logs/launcher.log, which the player can send us) and the launcher keeps
 * running. Only an error thrown while the launcher is still starting is shown, in plain words, since the
 * launcher then never opens.
 */

/** The log grows to this size, then it is kept as launcher.old.log and a new one starts. */
const MAX_LOG_BYTES = 1024 * 1024;

/** A line in the log: local time, where it happened and the whole error with its stack. */
export function appendLauncherLog(file: string, message: string): void {
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      if (statSync(file).size > MAX_LOG_BYTES) renameSync(file, file.replace(/\.log$/, '.old.log'));
    } catch {
      // no log yet
    }
    const d = new Date();
    const stamp = new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().replace('T', ' ').slice(0, 19);
    appendFileSync(file, `${stamp} ${message}\n`, 'utf8');
  } catch {
    // only a log
  }
}

/** The whole error for the log: its stack when there is one, the value otherwise. */
export function errorDetails(err: unknown): string {
  if (err instanceof Error) return err.stack ?? `${err.name}: ${err.message}`;
  try {
    return typeof err === 'string' ? err : JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}

export interface ErrorHandlerOptions {
  /** The launcher's log file. */
  logFile: () => string;
  /** Whether the launcher has opened its window (later errors are only logged). */
  started: () => boolean;
  /** Tells the player, in plain words, that the launcher could not start, and quits. */
  fatal: (err: unknown) => void;
  /** process, or a stand-in in tests. */
  target?: Pick<NodeJS.Process, 'on'>;
}

/** Catches what nobody else did: logs it, and only an error thrown while the launcher starts ends it. */
export function installErrorHandlers(opts: ErrorHandlerOptions): void {
  let fatalShown = false;
  const onError = (kind: string, canEnd: boolean) => (err: unknown) => {
    const details = errorDetails(err);
    console.error(`${kind}:`, details);
    appendLauncherLog(opts.logFile(), `[${kind}] ${details}`);
    if (!canEnd || opts.started() || fatalShown) return;
    fatalShown = true;
    try {
      opts.fatal(err);
    } catch (shown) {
      console.error('fatal:', errorDetails(shown));
    }
  };
  const target = opts.target ?? process;
  target.on('uncaughtException', onError('uncaughtException', true));
  // a forgotten promise (a server that did not answer…) never ends the launcher; the start's own chain has a catch of its own
  target.on('unhandledRejection', onError('unhandledRejection', false));
}
