package dev.slash3rss.slashclient.hud.chat;

import dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.multiplayer.chat.GuiMessage;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import net.minecraft.network.chat.MutableComponent;
import net.minecraft.network.chat.Style;
import net.minecraft.network.chat.TextColor;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Chat helpers: repeated lines stack ("×3") instead of filling the chat, and a right click
 * on a line copies the whole message it belongs to (as plain text, with colour codes or as JSON,
 * with the time it came in or without the sender, as set).
 */
public final class ChatExtras {
	private ChatExtras() {}

	private static String lastText;
	private static Component lastShown;
	private static int repeats;

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	/**
	 * Called for every new chat line (`raw` is its text before any time stamp, `shown` what will
	 * be added). When it repeats the last line, that line goes and this one says how many times.
	 */
	public static Component stack(ChatComponent chat, String raw, Component shown) {
		if (cfg() == null || !cfg().chatStack) return shown;
		ChatComponentAccessor access = (ChatComponentAccessor) chat;
		List<Object> all = access.slashclient$allMessages();
		boolean same = raw.equals(lastText) && !all.isEmpty() && ((GuiMessage) all.get(0)).content() == lastShown;
		repeats = same ? repeats + 1 : 1;
		if (same) {
			all.remove(0);
			access.slashclient$refresh();
			shown = shown.copy().append(Component.literal(" ×" + repeats).withStyle(ChatFormatting.GRAY));
		}
		lastText = raw;
		lastShown = shown;
		return shown;
	}

	/** Wall-clock time of the chat's GUI tick each message came in at (chat lines keep only the tick). */
	private static final Map<Integer, Long> ARRIVED = new LinkedHashMap<>() {
		@Override
		protected boolean removeEldestEntry(Map.Entry<Integer, Long> eldest) {
			return size() > 1000;
		}
	};

	/** Called for every new chat line, before the chat stores it. */
	public static void arrived() {
		ARRIVED.putIfAbsent(Compat.guiTicks(Minecraft.getInstance()), System.currentTimeMillis());
	}

	/** What the last right click on the chat put on the clipboard (the tests read it here: a system clipboard can lag). */
	public static String lastCopied;

	public static final String[] COPY_FORMATS = { "plain", "section", "ampersand", "json" };
	public static final String[] COPY_TIMES = { "off", "hm", "hms" };
	public static final String[] COPY_NOTICES = { "off", "short", "preview" };

	/** A chat line's message: its text with the style of every char, and the GUI tick it came in at. */
	/** A message picked to copy: its text, each character's style, and when it came (the chat's GUI ticks, or the time for a window's line). */
	private record Picked(String text, List<Style> styles, int addedTime, Long at) {}

	/** "<nick> text", "[rank] nick » text", "nick: text" (a nick of the game's own letters only, as "Note: …" is no sender). */
	private static final Pattern SENDER = Pattern.compile("^(?:<[^<>]{1,40}> |(?:\\[[^\\]]{1,24}] ?)*\\S{1,32} (?:»|>>|→) |(?:\\[[^\\]]{1,24}] ?)*[A-Za-z0-9_]{2,16}: )");

	/** The whole message under the mouse in the open chat as plain text, or null. */
	public static String messageAt(double mouseX, double mouseY) {
		Picked p = pick(mouseX, mouseY);
		return p == null ? null : p.text();
	}

	/** The message under the mouse as the copy settings want it (format, time, sender), or null. */
	public static String copyAt(double mouseX, double mouseY) {
		Picked p = pick(mouseX, mouseY);
		if (p == null || p.text().isEmpty()) return null;
		HudConfig c = cfg();
		if (c != null && c.chatCopyNoSender) {
			Matcher m = SENDER.matcher(p.text());
			// only when something is left after the sender
			if (m.find() && m.end() < p.text().length()) p = cut(p, m.end(), p.text().length());
		}
		String format = c == null ? "plain" : c.chatCopyFormat;
		String text = switch (format) {
			case "section" -> codes(p, '\u00a7');
			case "ampersand" -> codes(p, '&');
			case "json" -> json(p);
			default -> p.text();
		};
		String time = c == null ? "off" : c.chatCopyTime;
		if (!time.equals("off")) {
			Long at = p.at() != null ? p.at() : ARRIVED.get(p.addedTime());
			// a message from before this was recorded: counted back from the GUI ticks (20 a second)
			long millis = at != null ? at : System.currentTimeMillis() - (Compat.guiTicks(Minecraft.getInstance()) - p.addedTime()) * 50L;
			LocalTime t = LocalTime.ofInstant(Instant.ofEpochMilli(millis), ZoneId.systemDefault());
			text = "[" + t.format(DateTimeFormatter.ofPattern(time.equals("hms") ? "HH:mm:ss" : "HH:mm")) + "] " + text;
		}
		return text;
	}

	private static Picked pick(double mouseX, double mouseY) {
		Minecraft mc = Minecraft.getInstance();
		// a line in a pulled-out tab's window: the whole message it is part of
		var inWindow = ChatWindows.messageAt(mouseX, mouseY);
		if (inWindow != null) {
			StringBuilder text = new StringBuilder();
			List<Style> styles = new ArrayList<>();
			inWindow.getKey().getVisualOrderText().accept((pos, style, cp) -> {
				int before = text.length();
				text.appendCodePoint(cp);
				for (int k = before; k < text.length(); k++) styles.add(style);
				return true;
			});
			return trimmed(new Picked(text.toString(), styles, 0, inWindow.getValue()));
		}
		ChatComponent chat = Compat.chat(mc);
		ChatComponentAccessor access = (ChatComponentAccessor) chat;
		double scale = ChatLook.scale(mc);
		int lineHeight = (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
		// the chat is drawn upwards from 40 pixels above the bottom, scaled
		double bottom = Math.floor((mc.getWindow().getGuiScaledHeight() - 40) / scale);
		double y = mouseY / scale, x = mouseX / scale;
		if (x < 0 || x > ChatComponent.getWidth(mc.options.chatWidth().get()) + 8 || y > bottom) return null;
		int row = (int) Math.floor((bottom - y) / lineHeight);
		if (row < 0 || row >= chat.getLinesPerPage()) return null;
		List<Object> lines = access.slashclient$lines();
		int index = row + access.slashclient$scroll();
		if (index >= lines.size()) return null;
		// a message is its lines from the one marked as its end (the lowest) up to the next end
		int first = index;
		while (first > 0 && !((GuiMessage.Line) lines.get(first)).endOfEntry()) first--;
		int last = first;
		while (last + 1 < lines.size() && !((GuiMessage.Line) lines.get(last + 1)).endOfEntry()) last++;
		StringBuilder text = new StringBuilder();
		List<Style> styles = new ArrayList<>();
		// newest first: the message's first line has the highest index
		for (int i = last; i >= first; i--) {
			((GuiMessage.Line) lines.get(i)).content().accept((pos, style, cp) -> {
				int before = text.length();
				text.appendCodePoint(cp);
				for (int k = before; k < text.length(); k++) styles.add(style);
				return true;
			});
		}
		return trimmed(new Picked(text.toString(), styles, ((GuiMessage.Line) lines.get(first)).addedTime(), null));
	}

	/** Without our time stamp in front and the repeat count at the end. */
	private static Picked trimmed(Picked p) {
		String s = p.text();
		int start = 0, end = s.length();
		Matcher stamp = STAMP.matcher(s);
		if (stamp.find()) start = stamp.end();
		Matcher count = COUNT.matcher(s);
		if (count.find() && count.start() >= start) end = count.start();
		while (start < end && Character.isWhitespace(s.charAt(start))) start++;
		while (end > start && Character.isWhitespace(s.charAt(end - 1))) end--;
		return cut(p, start, end);
	}

	private static final Pattern STAMP = Pattern.compile("^\\[\\d{1,2}:\\d{2}] ");
	private static final Pattern COUNT = Pattern.compile(" ×\\d+$");

	private static Picked cut(Picked p, int start, int end) {
		return new Picked(p.text().substring(start, end), p.styles().subList(start, end), p.addedTime(), p.at());
	}

	/** The text in runs of one style each. */
	private static void runs(Picked p, java.util.function.BiConsumer<Style, String> out) {
		String s = p.text();
		int from = 0;
		for (int i = 1; i <= s.length(); i++) {
			if (i == s.length() || !p.styles().get(i).equals(p.styles().get(from))) {
				out.accept(p.styles().get(from), s.substring(from, i));
				from = i;
			}
		}
	}

	/** The game's named colours in the order of their codes 0-f. */
	private static final List<String> NAMED = List.of("black", "dark_blue", "dark_green", "dark_aqua", "dark_red", "dark_purple", "gold", "gray",
		"dark_gray", "blue", "green", "aqua", "red", "light_purple", "yellow", "white");

	/** With colour codes (§ or &), the way plugins and servers take them; other colours as §x§r§r§g§g§b§b / &#rrggbb. */
	private static String codes(Picked p, char mark) {
		StringBuilder out = new StringBuilder();
		String[] last = { "" };
		runs(p, (style, part) -> {
			StringBuilder code = new StringBuilder();
			TextColor color = style.getColor();
			if (color != null) {
				String name = color.serialize();
				int named = NAMED.indexOf(name);
				if (named >= 0) code.append(mark).append("0123456789abcdef".charAt(named));
				else if (mark == '&') code.append("&").append(String.format("#%06X", color.getValue() & 0xFFFFFF));
				else {
					code.append(mark).append('x');
					for (char ch : String.format("%06x", color.getValue() & 0xFFFFFF).toCharArray()) code.append(mark).append(ch);
				}
			} else if (!last[0].isEmpty()) code.append(mark).append('r');
			if (style.isBold()) code.append(mark).append('l');
			if (style.isItalic()) code.append(mark).append('o');
			if (style.isUnderlined()) code.append(mark).append('n');
			if (style.isStrikethrough()) code.append(mark).append('m');
			if (style.isObfuscated()) code.append(mark).append('k');
			if (!code.toString().equals(last[0])) out.append(code);
			last[0] = code.toString();
			out.append(part);
		});
		return out.toString();
	}

	/** As a JSON text component (with its colours, links and commands), the way /tellraw takes it. */
	private static String json(Picked p) {
		MutableComponent all = Component.empty();
		runs(p, (style, part) -> all.append(Component.literal(part).withStyle(style)));
		try {
			//#if MC >= 1.21.1
			Minecraft mc = Minecraft.getInstance();
			com.mojang.serialization.DynamicOps<com.google.gson.JsonElement> ops = mc.level != null ? mc.level.registryAccess().createSerializationContext(com.mojang.serialization.JsonOps.INSTANCE) : com.mojang.serialization.JsonOps.INSTANCE;
			return net.minecraft.network.chat.ComponentSerialization.CODEC.encodeStart(ops, all).getOrThrow().toString();
			//#else
			//$ return Component.Serializer.toJson(all);
			//#endif
		} catch (RuntimeException e) {
			return p.text();
		}
	}
}
