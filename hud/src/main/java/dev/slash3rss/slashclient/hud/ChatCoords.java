package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Coordinates in chat lines ("123 64 -456", "x: 123 y: 64 z: -456", "X 123 Z -456", "123, 64, -456",
 * "XYZ: 12.5 / 64 / -3") underlined, with a hint on hover; a click opens a small window that saves
 * them as a waypoint of the place the player is in (ChatCoordsScreen).
 *
 * Only what looks like a place: three numbers (a height that can be one), or two when they are
 * labelled x and z. Not times (12:30), dates (12.05.2024, 12 05 2024), prices (10 20 30 zł),
 * counts (64x) or numbers inside words. The marked part keeps its look and gets an underline, a
 * hover text and, as the thing the chat finds under a click, an insertion only SlashClient reads
 * (ClickEvent's actions differ between the game's versions and none runs our code).
 */
public final class ChatCoords {
	private ChatCoords() {}

	/** What the marked text's insertion starts with: "slashclient:wp:x,y,z,name" (y "~" for none). */
	public static final String MARK = "slashclient:wp:";

	/** A place found in a line: where in the text, and its coordinates (y null when only x and z were given). */
	public record Hit(int start, int end, int x, Integer y, int z) {}

	private static final String NUM = "(-?\\d{1,8}(?:\\.\\d{1,3})?)";
	/** "XYZ: 12.5 / 64 / -3" (the debug screen's way). */
	private static final Pattern XYZ = Pattern.compile("(?i)(?<![\\w])xyz\\s*[:=]?\\s*" + NUM + "\\s*/\\s*" + NUM + "\\s*/\\s*" + NUM + "(?![\\w.])");
	/** "x: 1 y: 2 z: 3", "X 1 Z 3", "x=1, y=2, z=3". */
	private static final Pattern LABELLED = Pattern.compile("(?i)(?<![\\w])x\\s*[:=]?\\s*" + NUM + "\\s*[,;]?\\s*(?:y\\s*[:=]?\\s*" + NUM + "\\s*[,;]?\\s*)?z\\s*[:=]?\\s*" + NUM + "(?![\\w.])");
	/** Three numbers in a row, apart by spaces or commas. */
	private static final Pattern PLAIN = Pattern.compile("(?<![\\w.:/,-])" + NUM + "(?:\\s*[,;]\\s*|\\s+)" + NUM + "(?:\\s*[,;]\\s*|\\s+)" + NUM + "(?![\\w.:/%$€£-])");
	/** After a number: money or a share, not a place. */
	private static final Pattern MONEY = Pattern.compile("(?i)^\\s*(?:(?:zł|zl|pln|eur|usd|coins?|monet|kc|gr)(?!\\p{L})|[$€£%])");
	/** "<nick> text", "[rank] nick » text", "nick: text": who wrote it, for the waypoint's name. */
	private static final Pattern SENDER = Pattern.compile("^(?:<([^<>]{1,40})> |(?:\\[[^\\]]{1,24}] ?)*(\\S{1,32}) (?:»|>>|→) |(?:\\[[^\\]]{1,24}] ?)*([A-Za-z0-9_]{2,16}): )");

	private static final int MAX_XZ = 30_000_000;

	/** The places in a line of text, in order, none overlapping. */
	public static List<Hit> find(String text) {
		List<Hit> out = new ArrayList<>();
		if (text == null || text.length() > 2000) return out;
		Matcher m = XYZ.matcher(text);
		while (m.find()) add(out, m.start(), m.end(), m.group(1), m.group(2), m.group(3), true);
		m = LABELLED.matcher(text);
		while (m.find()) add(out, m.start(), m.end(), m.group(1), m.group(2), m.group(3), true);
		m = PLAIN.matcher(text);
		while (m.find()) {
			if (MONEY.matcher(text.substring(m.end())).find()) continue;
			add(out, m.start(), m.end(), m.group(1), m.group(2), m.group(3), false);
		}
		out.sort((a, b) -> Integer.compare(a.start(), b.start()));
		return out;
	}

	private static void add(List<Hit> out, int start, int end, String xs, String ys, String zs, boolean labelled) {
		for (Hit h : out) if (start < h.end() && end > h.start()) return;
		// "05": a date's or a clock's, not a coordinate
		if (!labelled && (zeroLed(xs) || zeroLed(ys) || zeroLed(zs))) return;
		try {
			int x = (int) Math.floor(Double.parseDouble(xs)), z = (int) Math.floor(Double.parseDouble(zs));
			Integer y = ys == null ? null : (int) Math.floor(Double.parseDouble(ys));
			if (Math.abs(x) > MAX_XZ || Math.abs(z) > MAX_XZ) return;
			// a height the game can have (with room to fly over the build limit)
			if (y != null && (y < -2048 || y > 4096)) return;
			// three plain numbers: the middle one must look like a height, and not all of them be tiny ("1 2 3")
			if (!labelled && (y < -128 || y > 1024 || Math.abs(x) < 10 && Math.abs(y) < 10 && Math.abs(z) < 10)) return;
			out.add(new Hit(start, end, x, y, z));
		} catch (NumberFormatException e) {
			// not numbers after all
		}
	}

	private static boolean zeroLed(String n) {
		String s = n.startsWith("-") ? n.substring(1) : n;
		return s.length() > 1 && s.charAt(0) == '0' && s.charAt(1) != '.';
	}

	/** The sender of a chat line, or null. */
	static String sender(String text) {
		Matcher m = SENDER.matcher(text);
		if (!m.find()) return null;
		for (int g = 1; g <= 3; g++) if (m.group(g) != null) return m.group(g);
		return null;
	}

	private record Piece(Style style, String text) {}

	/** The line with its coordinates marked (underlined, a hint, the click's data); as it was when it has none or this is off. */
	public static Component mark(Component message) {
		if (SlashHud.config == null || !SlashHud.config.chatCoords || message == null) return message;
		String plain = message.getString();
		List<Hit> hits = find(plain);
		if (hits.isEmpty()) return message;
		List<Piece> pieces = new ArrayList<>();
		message.visit((style, text) -> {
			pieces.add(new Piece(style, text));
			return Optional.empty();
		}, Style.EMPTY);
		// the text as visited must be the line as read, or the places would land elsewhere
		StringBuilder all = new StringBuilder();
		for (Piece p : pieces) all.append(p.text());
		if (!all.toString().equals(plain)) return message;
		String who = sender(plain);
		String name = (who == null ? Component.translatable("slashclient-hud.chatCoords.nameNoSender") : Component.translatable("slashclient-hud.chatCoords.name", who)).getString();
		// a part a server made clickable itself (a [Teleport] button) stays the server's
		int at = 0;
		List<Hit> keep = new ArrayList<>(hits);
		for (Piece p : pieces) {
			int s = at, e = at + p.text().length();
			if (p.style().getClickEvent() != null) keep.removeIf(h -> h.start() < e && h.end() > s);
			at = e;
		}
		if (keep.isEmpty()) return message;
		MutableComponent out = Component.empty();
		at = 0;
		for (Piece p : pieces) {
			int s = at, e = at + p.text().length();
			int i = s;
			while (i < e) {
				Hit inside = null;
				int next = e;
				for (Hit h : keep) {
					if (h.start() <= i && i < h.end()) inside = h;
					else if (h.start() > i && h.start() < next) next = h.start();
				}
				int to = inside != null ? Math.min(e, inside.end()) : next;
				String part = plain.substring(i, to);
				Style style = p.style();
				if (inside != null) style = marked(style, inside, name);
				out.append(Component.literal(part).setStyle(style));
				i = to;
			}
			at = e;
		}
		return out;
	}

	private static Style marked(Style style, Hit h, String name) {
		String data = MARK + h.x() + "," + (h.y() == null ? "~" : h.y()) + "," + h.z() + "," + name;
		Component hint = Component.translatable("slashclient-hud.chatCoords.hover");
		//#if MC >= 1.21.5
		HoverEvent hover = new HoverEvent.ShowText(hint);
		//#else
		//$ HoverEvent hover = new HoverEvent(HoverEvent.Action.SHOW_TEXT, hint);
		//#endif
		return style.withUnderlined(true).withHoverEvent(hover).withInsertion(data);
	}

	/** Whether a style is one of our marked coordinates. */
	public static boolean isMarked(Style style) {
		return style != null && style.getInsertion() != null && style.getInsertion().startsWith(MARK);
	}

	/** A click on marked coordinates: the window to save them. True when it was one. */
	public static boolean clicked(Style style) {
		if (!isMarked(style)) return false;
		String[] parts = style.getInsertion().substring(MARK.length()).split(",", 4);
		if (parts.length < 4) return false;
		Minecraft mc = Minecraft.getInstance();
		if (mc.player == null) return false;
		try {
			int x = Integer.parseInt(parts[0]), z = Integer.parseInt(parts[2]);
			int y = parts[1].equals("~") ? mc.player.getBlockY() : Integer.parseInt(parts[1]);
			var back = Compat.screen(mc);
			mc.setScreenAndShow(new ChatCoordsScreen(back, parts[3], x, y, z));
			return true;
		} catch (NumberFormatException e) {
			return false;
		}
	}
}
