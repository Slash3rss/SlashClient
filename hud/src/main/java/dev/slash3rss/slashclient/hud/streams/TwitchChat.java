package dev.slash3rss.slashclient.hud.streams;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Twitch chat, read anonymously: Twitch's IRC over a WebSocket, logged in as "justinfan" with
 * a random number (Twitch's read-only guest name, no password or token), joined to the
 * channel. Only PRIVMSG (messages), CLEARCHAT and CLEARMSG (deletions), PING and a few
 * notices are read; nothing is ever sent but the login, the join and PONG.
 */
public final class TwitchChat extends StreamChat {
	public static final TwitchChat INSTANCE = new TwitchChat();
	static final String URL = "wss://irc-ws.chat.twitch.tv:443";

	private TwitchChat() {
		super("Twitch");
	}

	@Override
	protected Prepared prepare(Target target) {
		return new Prepared(URL, null);
	}

	@Override
	protected void opened() {
		Target t = target();
		if (t == null) return;
		send("CAP REQ :twitch.tv/tags twitch.tv/commands");
		send("PASS SCHMOOPIIE");
		send("NICK justinfan" + (10000 + (int) (Math.random() * 89999)));
		send("JOIN #" + t.channel());
	}

	@Override
	protected long idleMillis() {
		// Twitch sends PING about every five minutes
		return 6 * 60_000;
	}

	@Override
	protected void ping() {
		send("PING :tmi.twitch.tv");
	}

	@Override
	public String receive(String frame) {
		// one frame can hold several IRC lines
		for (String raw : frame.split("\r\n")) {
			if (raw.isEmpty()) continue;
			String fail = handle(Irc.parse(raw));
			if (fail != null) return fail;
		}
		return null;
	}

	private String handle(Irc m) {
		if (m == null) return null;
		Target t = target();
		String channel = t == null ? "" : t.channel();
		switch (m.command) {
			case "PING" -> send("PONG :" + (m.trailing == null ? "tmi.twitch.tv" : m.trailing));
			// asked to come back on another server: the loop connects again
			case "RECONNECT" -> {
				return AGAIN;
			}
			case "ROOMSTATE" -> status(State.LIVE, "live", channel);
			case "JOIN" -> {
				if (m.nick() != null && m.nick().startsWith("justinfan")) status(State.LIVE, "live", channel);
			}
			case "PRIVMSG" -> {
				Line line = line(m);
				if (line != null) add(line);
			}
			case "CLEARMSG" -> {
				String id = m.tags.get("target-msg-id");
				if (id != null) remove(l -> id.equals(l.id()));
			}
			case "CLEARCHAT" -> {
				// with a name: that user was banned or timed out; without: the whole chat was cleared
				String who = m.trailing;
				if (who == null || who.isEmpty()) clear();
				else remove(l -> who.equalsIgnoreCase(l.login()));
			}
			case "NOTICE" -> {
				String id = m.tags.getOrDefault("msg-id", "");
				if (id.startsWith("msg_channel_suspended") || id.equals("msg_banned") || id.equals("tos_ban")) return "twitch.suspended";
			}
			default -> {}
		}
		return null;
	}

	/** A PRIVMSG made a chat line; public for the tests. */
	public static Line line(Irc m) {
		if (m == null || !"PRIVMSG".equals(m.command) || m.trailing == null) return null;
		String login = m.nick() == null ? "" : m.nick();
		String name = m.tags.getOrDefault("display-name", "");
		if (name.isBlank()) name = login;
		String text = m.trailing;
		boolean action = false;
		// "/me" messages come wrapped in CTCP ACTION
		if (text.startsWith("\u0001ACTION ") && text.endsWith("\u0001")) {
			text = text.substring(8, text.length() - 1);
			action = true;
		}
		String id = m.tags.getOrDefault("id", "");
		return new Line(id, name, login, parseColor(m.tags.get("color")), badges(m.tags.getOrDefault("badges", "")), text, action, System.currentTimeMillis());
	}

	/** "moderator/1,subscriber/12" → [MOD] [SUB]; badges with no tag of ours are left out. */
	static List<Badge> badges(String tag) {
		List<Badge> out = new ArrayList<>();
		if (tag == null || tag.isEmpty()) return out;
		for (String b : tag.split(",")) {
			String kind = b.contains("/") ? b.substring(0, b.indexOf('/')) : b;
			Badge badge = switch (kind) {
				case "broadcaster" -> ChatBadges.HOST;
				case "moderator" -> ChatBadges.MOD;
				case "vip" -> ChatBadges.VIP;
				case "subscriber", "founder" -> ChatBadges.SUB;
				case "staff", "admin", "global_mod" -> ChatBadges.STAFF;
				case "partner" -> ChatBadges.VERIFIED;
				default -> null;
			};
			if (badge != null && !out.contains(badge)) out.add(badge);
		}
		return out;
	}

	/** One IRC line: @tags :prefix COMMAND params :trailing (IRCv3 with Twitch's tags). */
	public static final class Irc {
		public final Map<String, String> tags = new HashMap<>();
		public String prefix;
		public String command = "";
		public final List<String> params = new ArrayList<>();
		public String trailing;

		/** The nick in ":nick!user@host", or null. */
		public String nick() {
			if (prefix == null) return null;
			int bang = prefix.indexOf('!');
			return bang > 0 ? prefix.substring(0, bang) : null;
		}

		public static Irc parse(String raw) {
			if (raw == null || raw.isEmpty()) return null;
			Irc m = new Irc();
			int i = 0;
			if (raw.startsWith("@")) {
				int sp = raw.indexOf(' ');
				if (sp < 0) return null;
				for (String kv : raw.substring(1, sp).split(";")) {
					int eq = kv.indexOf('=');
					if (eq < 0) m.tags.put(kv, "");
					else m.tags.put(kv.substring(0, eq), unescape(kv.substring(eq + 1)));
				}
				i = sp + 1;
			}
			while (i < raw.length() && raw.charAt(i) == ' ') i++;
			if (i < raw.length() && raw.charAt(i) == ':') {
				int sp = raw.indexOf(' ', i);
				if (sp < 0) return null;
				m.prefix = raw.substring(i + 1, sp);
				i = sp + 1;
			}
			int trail = raw.indexOf(" :", i - 1);
			String middle = trail >= 0 ? raw.substring(i, trail) : raw.substring(i);
			if (trail >= 0) m.trailing = raw.substring(trail + 2);
			String[] parts = middle.trim().split(" +");
			if (parts.length == 0 || parts[0].isEmpty()) return null;
			m.command = parts[0];
			for (int k = 1; k < parts.length; k++) m.params.add(parts[k]);
			return m;
		}

		/** IRCv3's escapes in tag values. */
		static String unescape(String v) {
			if (v.indexOf('\\') < 0) return v;
			StringBuilder out = new StringBuilder();
			for (int i = 0; i < v.length(); i++) {
				char c = v.charAt(i);
				if (c != '\\' || i + 1 >= v.length()) {
					if (c != '\\') out.append(c);
					continue;
				}
				char n = v.charAt(++i);
				switch (n) {
					case 's' -> out.append(' ');
					case ':' -> out.append(';');
					case 'r' -> out.append('\r');
					case 'n' -> out.append('\n');
					default -> out.append(n);
				}
			}
			return out.toString();
		}
	}
}
