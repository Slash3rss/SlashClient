package dev.slash3rss.slashclient.hud.streams;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.WebSocket;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

/**
 * A read-only live chat of one streaming channel, kept on a background thread: it connects,
 * keeps the newest lines, removes those a moderator deletes and connects again (waiting
 * longer each time) when the connection drops. Nothing is ever written to the chat and no
 * account is used. Plain Java (no game classes), so the parsers can be tried on their own.
 */
public abstract class StreamChat {
	/** One chat message, as shown: `color` is 0xRRGGBB or -1 for none, `badges` short tags (see Badge). */
	public record Line(String id, String user, String login, int color, List<Badge> badges, String text, boolean action, long time) {}

	/** A small coloured tag before the name: [MOD], [SUB], … */
	public record Badge(String label, int color) {}

	public enum State {
		/** Switched off or no channel. */
		OFF,
		CONNECTING,
		LIVE,
		/** Dropped: waiting before the next try. */
		RETRYING,
		/** Will not work without the player changing something (a wrong channel, a blocked lookup). */
		FAILED
	}

	/** How many lines are kept; the module shows at most 20 and wraps long ones. */
	static final int KEEP = 120;
	static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

	private final String name;
	private final ArrayDeque<Line> lines = new ArrayDeque<>();
	/** Grows with every change of the lines, so the module re-wraps them only then. */
	private volatile int version;
	private volatile State state = State.OFF;
	/** A translation key under slashclient-hud.streams. and its arguments, for the status line. */
	private volatile String statusKey = "off";
	private volatile Object[] statusArgs = new Object[0];

	/** What it should be connected to now (null = nothing) and what the worker is connected to. */
	private volatile Target wanted;
	private Thread worker;
	/** Bumped on every change of target, so a worker for an old channel stops by itself. */
	private volatile int generation;
	private volatile WebSocket socket;
	private volatile long lastFrame;
	private volatile boolean pinged;
	/** Tests feed frames by hand: then nothing connects. */
	private static volatile boolean offline;

	/** A channel, and for Kick the chat's number typed by hand (may be empty). */
	public record Target(String channel, String extra) {}

	protected StreamChat(String name) {
		this.name = name;
	}

	public String name() {
		return name;
	}

	// ---------- what the module reads ----------

	public State state() {
		return state;
	}

	public String statusKey() {
		return statusKey;
	}

	public Object[] statusArgs() {
		return statusArgs;
	}

	public int version() {
		return version;
	}

	/** The newest `max` lines, oldest first. */
	public List<Line> newest(int max) {
		synchronized (lines) {
			List<Line> all = new ArrayList<>(lines);
			return all.subList(Math.max(0, all.size() - max), all.size());
		}
	}

	public boolean hasLines() {
		synchronized (lines) {
			return !lines.isEmpty();
		}
	}

	// ---------- switched on and off from the game's tick ----------

	/** Connects to `target` (or disconnects for null); calling it again with the same target does nothing. */
	public synchronized void want(Target target) {
		if (target != null && target.channel().isEmpty()) target = null;
		if (java.util.Objects.equals(target, wanted)) return;
		wanted = target;
		int gen = ++generation;
		if (worker != null) worker.interrupt();
		worker = null;
		closeSocket();
		clear();
		if (target == null) {
			status(State.OFF, "off");
			return;
		}
		if (offline) {
			status(State.LIVE, "live", target.channel());
			return;
		}
		status(State.CONNECTING, "connecting", target.channel());
		Target t = target;
		worker = new Thread(() -> run(t, gen), "SlashClient " + name + " chat");
		worker.setDaemon(true);
		worker.start();
	}

	/** For the tests: no connections, frames come from `receive`. */
	public static void offline(boolean on) {
		offline = on;
	}

	private boolean current(int gen) {
		return gen == generation;
	}

	/** Connects again and again with a growing wait (2 s up to a minute) until the target changes. */
	private void run(Target target, int gen) {
		long wait = 2000;
		while (current(gen)) {
			long started = System.currentTimeMillis();
			try {
				String failure = session(target, gen);
				if (failure != null && !failure.equals(AGAIN)) {
					// the player must change something first; the next change of target starts again
					if (current(gen)) status(State.FAILED, failure, target.channel());
					return;
				}
			} catch (InterruptedException e) {
				return;
			} catch (Exception e) {
				if (current(gen)) status(State.RETRYING, "retrying", target.channel(), dev.slash3rss.slashclient.hud.ErrorText.of(e));
			}
			if (!current(gen)) return;
			// a connection that held for a while starts the waiting over
			if (System.currentTimeMillis() - started > 60_000) wait = 2000;
			if (state != State.RETRYING) status(State.RETRYING, "retrying", target.channel(), "");
			try {
				Thread.sleep(wait + (long) (Math.random() * 1000));
			} catch (InterruptedException e) {
				return;
			}
			wait = Math.min(60_000, wait * 2);
		}
	}

	/**
	 * One connection, until it drops: returns a status key when trying again would not help,
	 * null to try again, or throws on errors worth trying again after.
	 */
	private String session(Target target, int gen) throws Exception {
		Prepared p = prepare(target);
		if (p.failure() != null) return p.failure();
		if (current(gen) && state != State.RETRYING) status(State.CONNECTING, "connecting", target.channel());
		CompletableFuture<String> closed = new CompletableFuture<>();
		StringBuilder partial = new StringBuilder();
		WebSocket.Listener listener = new WebSocket.Listener() {
			@Override
			public void onOpen(WebSocket ws) {
				// before buildAsync's future completes: the first frame may come (and be answered) at once
				if (current(gen)) socket = ws;
				ws.request(1);
			}

			@Override
			public CompletionStage<?> onText(WebSocket ws, CharSequence data, boolean last) {
				partial.append(data);
				if (last) {
					String frame = partial.toString();
					partial.setLength(0);
					if (current(gen)) {
						lastFrame = System.currentTimeMillis();
						pinged = false;
						try {
							String fail = receive(frame);
							if (fail != null) closed.complete(fail);
						} catch (RuntimeException e) {
							// one odd frame must not end the chat
						}
					}
				}
				ws.request(1);
				return null;
			}

			@Override
			public CompletionStage<?> onClose(WebSocket ws, int code, String reason) {
				closed.complete(null);
				return null;
			}

			@Override
			public void onError(WebSocket ws, Throwable error) {
				closed.completeExceptionally(error);
			}
		};
		WebSocket ws = HTTP.newWebSocketBuilder()
			.header("User-Agent", USER_AGENT)
			.connectTimeout(Duration.ofSeconds(10))
			.buildAsync(URI.create(p.url()), listener)
			.get(20, TimeUnit.SECONDS);
		if (!current(gen)) {
			ws.abort();
			return null;
		}
		socket = ws;
		lastFrame = System.currentTimeMillis();
		pinged = false;
		opened();
		// watch for silence: ask the server whether it is still there, give up on it when it does not answer
		while (!closed.isDone()) {
			try {
				String fail = closed.get(5, TimeUnit.SECONDS);
				closeSocket();
				return fail;
			} catch (java.util.concurrent.TimeoutException e) {
				if (!current(gen)) {
					ws.abort();
					return null;
				}
				long quiet = System.currentTimeMillis() - lastFrame;
				if (quiet > idleMillis() && !pinged) {
					pinged = true;
					ping();
				} else if (quiet > idleMillis() + 30_000) {
					ws.abort();
					throw new java.io.IOException("timeout");
				}
			} catch (java.util.concurrent.ExecutionException e) {
				closeSocket();
				throw e.getCause() instanceof Exception ex ? ex : e;
			}
		}
		closeSocket();
		return closed.getNow(null);
	}

	private void closeSocket() {
		WebSocket ws = socket;
		socket = null;
		if (ws != null) ws.abort();
	}

	static final String USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

	// ---------- for the subclasses ----------

	/** Where to connect: a WebSocket url, or why it cannot be done (a status key). */
	protected record Prepared(String url, String failure) {}

	/** Done on the worker thread before connecting (Kick looks up the chat's number here). */
	protected abstract Prepared prepare(Target target) throws Exception;

	/** Right after the socket opened. */
	protected abstract void opened();

	/** Returned by `receive` when the server asks to connect again at once. */
	protected static final String AGAIN = "";

	/** One whole text frame; returns a status key when the chat cannot go on (it is not retried), or AGAIN. */
	public abstract String receive(String frame);

	/** After this long without a frame the server is asked whether it is still there. */
	protected abstract long idleMillis();

	protected abstract void ping();

	protected void send(String text) {
		WebSocket ws = socket;
		if (ws != null) ws.sendText(text, true);
	}

	protected Target target() {
		return wanted;
	}

	protected void status(State state, String key, Object... args) {
		this.statusKey = key;
		this.statusArgs = args;
		this.state = state;
	}

	protected void add(Line line) {
		synchronized (lines) {
			lines.addLast(line);
			while (lines.size() > KEEP) lines.removeFirst();
			version++;
		}
	}

	/** Takes away the lines a moderator deleted (a message, or all of someone's after a ban). */
	protected void remove(Predicate<Line> which) {
		synchronized (lines) {
			if (lines.removeIf(which)) version++;
		}
	}

	protected void clear() {
		synchronized (lines) {
			lines.clear();
			version++;
		}
	}

	// ---------- shared helpers ----------

	/** "#AABBCC" → 0xAABBCC, -1 when it is not a colour. */
	static int parseColor(String s) {
		if (s == null) return -1;
		s = s.trim();
		if (s.startsWith("#")) s = s.substring(1);
		if (s.length() != 6) return -1;
		try {
			return Integer.parseInt(s, 16);
		} catch (NumberFormatException e) {
			return -1;
		}
	}

	/**
	 * What the player typed, made a channel name: a pasted link, "#name" or "@name" work too.
	 * `dash` keeps "-" (Kick's slugs have it, Twitch's names do not).
	 */
	public static String channelName(String typed, boolean dash) {
		if (typed == null) return "";
		String s = typed.trim().toLowerCase(java.util.Locale.ROOT);
		int slash = s.lastIndexOf('/');
		if (s.contains("twitch.tv/") || s.contains("kick.com/")) {
			s = s.substring(s.indexOf(".tv/") >= 0 ? s.indexOf(".tv/") + 4 : s.indexOf(".com/") + 5);
			int end = s.indexOf('/');
			if (end >= 0) s = s.substring(0, end);
			int q = s.indexOf('?');
			if (q >= 0) s = s.substring(0, q);
		} else if (slash >= 0) s = s.substring(slash + 1);
		StringBuilder out = new StringBuilder();
		for (char c : s.toCharArray()) {
			if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' || (dash && c == '-')) out.append(c);
		}
		return out.length() > 40 ? out.substring(0, 40) : out.toString();
	}
}
