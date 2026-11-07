/** Level of a game log line: errors (and stack traces), warnings, or plain info (the console's colours and filter). */
export function lineLevel(line: string): 'error' | 'warn' | '' {
  if (/\/(ERROR|FATAL)\]|^\s+at |Exception|^Caused by:/.test(line)) return 'error';
  if (/\/WARN\]/.test(line)) return 'warn';
  return '';
}
