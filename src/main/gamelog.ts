/**
 * Mojang's log4j config (versions 1.7+) prints events as XML on stdout. This
 * turns that stream into readable lines like the official launcher:
 *   [12:34:56] [Render thread/INFO]: Setting user: Steve
 * Anything that isn't a log4j event (e.g. pre-1.7 plain output) passes through.
 */
export function createLogParser(onLine: (line: string) => void): (chunk: string) => void {
  let buffer = '';

  const cdata = (xml: string, tag: string) => {
    const m = xml.match(new RegExp(`<log4j:${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></log4j:${tag}>`));
    return m?.[1];
  };
  const attr = (xml: string, name: string) => xml.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';

  const emitEvent = (xml: string) => {
    const time = new Date(Number(attr(xml, 'timestamp'))).toLocaleTimeString('pl-PL', { hour12: false });
    const head = `[${time}] [${attr(xml, 'thread')}/${attr(xml, 'level')}]: `;
    const message = cdata(xml, 'Message') ?? '';
    const throwable = cdata(xml, 'Throwable');
    for (const line of `${message}${throwable ? `\n${throwable}` : ''}`.split(/\r?\n/)) {
      if (line) onLine(head + line);
    }
  };

  return (chunk) => {
    buffer += chunk;
    for (;;) {
      const start = buffer.indexOf('<log4j:Event');
      // Flush complete plain-text lines that come before the next event.
      const plainEnd = start === -1 ? buffer.lastIndexOf('\n') : buffer.lastIndexOf('\n', start);
      if (plainEnd >= 0) {
        buffer.slice(0, plainEnd).split(/\r?\n/).filter((l) => l.trim()).forEach(onLine);
        buffer = buffer.slice(plainEnd + 1);
        continue;
      }
      if (start === -1) return;
      const end = buffer.indexOf('</log4j:Event>', start);
      if (end === -1) return; // wait for the rest of the event
      emitEvent(buffer.slice(start, end));
      buffer = buffer.slice(end + '</log4j:Event>'.length);
    }
  };
}

/**
 * Game log lines for the launcher window, sent together every `delayMs`: a big modpack prints
 * thousands of lines in a few seconds, and one message (and one page update) per line made the
 * launcher stutter. `flush()` sends what is waiting at once (before "the game closed").
 */
export function createLineBatcher(send: (lines: string[]) => void, delayMs = 50) {
  let lines: string[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!lines.length) return;
    const batch = lines;
    lines = [];
    send(batch);
  };
  return {
    push(line: string) {
      lines.push(line);
      timer ??= setTimeout(flush, delayMs);
    },
    flush,
  };
}
