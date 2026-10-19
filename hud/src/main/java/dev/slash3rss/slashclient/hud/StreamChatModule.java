package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.streams.KickChat;
import dev.slash3rss.slashclient.hud.streams.StreamChat;
import dev.slash3rss.slashclient.hud.streams.StreamChatSettings;
import dev.slash3rss.slashclient.hud.streams.TwitchChat;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.util.FormattedCharSequence;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.function.Supplier;

/**
 * "Czat Twitch" and "Czat Kick": the live chat of a stream's channel on the HUD, read only.
 * The connection lives in streams/ on its own thread; this draws what it has: the newest
 * lines wrapped to the module's width, fading like the game's chat (or staying), and a status
 * line while it connects or when something is wrong. The editor shows made-up lines until
 * real ones come.
 */
public final class StreamChatModule implements HudModule {
	static final StreamChatModule TWITCH = new StreamChatModule("twitchchat", "Twitch", TwitchChat.INSTANCE, () -> Modules.cfg.twitchChat, false);
	static final StreamChatModule KICK = new StreamChatModule("kickchat", "Kick", KickChat.INSTANCE, () -> Modules.cfg.kickChat, true);

	/** A line's place: the vanilla chat's 9 pixels and one between. */
	private static final int LINE = 10;
	/** How long a line stays before it fades (the game's chat: ten seconds). */
	private static final long SHOWN_MS = 10_000;

	private final String id, platform;
	private final StreamChat chat;
	private final Supplier<StreamChatSettings> settings;
	private final boolean kick;
	/** The channel typed, waiting a moment so typing it does not connect after every letter. */
	private StreamChat.Target pending;
	private long pendingSince;

	private StreamChatModule(String id, String platform, StreamChat chat, Supplier<StreamChatSettings> settings, boolean kick) {
		this.id = id;
		this.platform = platform;
		this.chat = chat;
		this.settings = settings;
		this.kick = kick;
	}

	public static List<HudModule> all() {
		return List.of(TWITCH, KICK);
	}

	@Override
	public String id() {
		return id;
	}

	public StreamChat chat() {
		return chat;
	}

	// ---------- the connection follows the settings ----------

	/** From the game's tick: connects to the channel set while the module is on, disconnects otherwise. */
	static void tick(Minecraft mc) {
		TWITCH.follow();
		KICK.follow();
	}

	private void follow() {
		if (Modules.cfg == null) return;
		StreamChatSettings s = settings.get();
		boolean on = Modules.cfg.placement(id).enabled;
		String channel = StreamChat.channelName(s.channel, kick);
		StreamChat.Target t = on && !channel.isEmpty() ? new StreamChat.Target(channel, kick ? s.chatroomId.trim() : "") : null;
		long now = System.currentTimeMillis();
		if (!Objects.equals(t, pending)) {
			pending = t;
			pendingSince = now;
		}
		// switching off is at once; a new channel once it has not changed for a second
		if (t == null || now - pendingSince > 1000) chat.want(t);
	}

	// ---------- the rows shown ----------

	/** One row on screen: a wrapped piece of a message (or the status), when it came, its own colour (0 = the module's), and whether a message starts on it. */
	private record Row(FormattedCharSequence text, long time, int color, boolean first) {}

	/** A message (or the status) wrapped to the width, one row per piece. */
	private static void wrap(Minecraft mc, Component c, int inner, long time, int color, List<Row> out) {
		boolean first = true;
		for (FormattedCharSequence part : mc.font.split(c, inner)) {
			out.add(new Row(part, time, color, first));
			first = false;
		}
	}

	/** The rows of the last frame, so visible, width, height and draw do the work once. */
	private List<Row> rows = List.of();
	private long rowsAt;
	private boolean rowsEditor;
	/** The wrapped messages, made again only when the chat or the settings change. */
	private List<Row> wrapped = List.of();
	private String wrappedFor = "";

	private List<Row> rows(Minecraft mc) {
		boolean editor = Compat.screen(mc) instanceof HudEditScreen;
		long now = System.currentTimeMillis();
		if (now - rowsAt < 15 && editor == rowsEditor) return rows;
		rowsAt = now;
		rowsEditor = editor;
		StreamChatSettings s = settings.get();
		int inner = s.width - Modules.PAD * 2;
		List<Row> out = new ArrayList<>();
		Component status = status();
		if (status != null) wrap(mc, status, inner, now, statusColor(), out);
		// while the chat is open (as the game's own chat) and in the editor every line shows in full
		boolean fade = s.fade && !editor && !(Compat.screen(mc) instanceof net.minecraft.client.gui.screens.ChatScreen);
		List<Row> lines = wrapped(mc, s, inner);
		if (lines.isEmpty() && editor) lines = sample(mc, s, inner, now);
		// the newest rows that fit, starting with a whole message (unless one message alone is too long)
		int start = Math.max(0, lines.size() - s.lines);
		int whole = start;
		while (whole < lines.size() && !lines.get(whole).first()) whole++;
		if (whole < lines.size()) start = whole;
		for (Row r : lines.subList(start, lines.size())) {
			if (!fade || alpha(now - r.time()) > 0.02f) out.add(r);
		}
		rows = out;
		return out;
	}

	private List<Row> wrapped(Minecraft mc, StreamChatSettings s, int inner) {
		String key = chat.version() + "/" + inner + "/" + s.badges + "/" + s.nameColors + "/" + s.lines;
		if (key.equals(wrappedFor)) return wrapped;
		List<Row> out = new ArrayList<>();
		for (StreamChat.Line l : chat.newest(s.lines)) {
			wrap(mc, message(l, s), inner, l.time(), 0, out);
		}
		wrapped = out;
		wrappedFor = key;
		return out;
	}

	/** Badges, the name in its colour, then the message in the module's text colour. */
	static MutableComponent message(StreamChat.Line l, StreamChatSettings s) {
		MutableComponent c = Component.empty();
		if (s.badges) for (StreamChat.Badge b : l.badges()) {
			c.append(Component.literal("[" + b.label() + "]").withStyle(st -> st.withColor(b.color())));
			c.append(Component.literal(" "));
		}
		int nameColor = s.nameColors ? readable(l.color() >= 0 ? l.color() : fallbackColor(l.login())) : 0xD4D4D8;
		c.append(Component.literal(l.user()).withStyle(st -> st.withColor(nameColor)));
		// "/me" lines in the name's colour, as Twitch shows them
		if (l.action()) c.append(Component.literal(" " + l.text()).withStyle(st -> st.withColor(nameColor).withItalic(true)));
		else c.append(Component.literal(": " + l.text()));
		return c;
	}

	/** Dark name colours made lighter, so they read on the HUD's dark background. */
	static int readable(int rgb) {
		int r = rgb >> 16 & 0xFF, g = rgb >> 8 & 0xFF, b = rgb & 0xFF;
		double lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
		if (lum >= 0.45) return rgb & 0xFFFFFF;
		double t = Math.min(1, (0.45 - lum) / 0.55 + 0.25);
		r += (int) ((255 - r) * t);
		g += (int) ((255 - g) * t);
		b += (int) ((255 - b) * t);
		return r << 16 | g << 8 | b;
	}

	/** Twitch's own colours for viewers who never picked one, by their name. */
	private static final int[] DEFAULT_COLORS = { 0xFF0000, 0x0000FF, 0x008000, 0xB22222, 0xFF7F50, 0x9ACD32, 0xFF4500, 0x2E8B57, 0xDAA520, 0xD2691E, 0x5F9EA0, 0x1E90FF, 0xFF69B4, 0x8A2BE2, 0x00FF7F };

	private static int fallbackColor(String login) {
		return DEFAULT_COLORS[Math.floorMod(login == null ? 0 : login.hashCode(), DEFAULT_COLORS.length)];
	}

	/** The game's chat fade: full for nine seconds, then out within one. */
	static float alpha(long age) {
		double t = Math.max(0, Math.min(1, (1 - (double) age / SHOWN_MS) * 10));
		return (float) (t * t);
	}

	/** The status line, or null when the chat is live and has lines. */
	private Component status() {
		StreamChat.State state = chat.state();
		if (state == StreamChat.State.LIVE && chat.hasLines()) return null;
		String key = state == StreamChat.State.OFF ? (StreamChat.channelName(settings.get().channel, kick).isEmpty() ? "noChannel" : "off") : chat.statusKey();
		if (state == StreamChat.State.LIVE) key = "waiting";
		Object[] args = chat.statusArgs();
		if (key.equals("retrying") && args.length > 1 && !String.valueOf(args[1]).isEmpty()) key = "retryingError";
		return Component.literal(platform + ": ").append(Component.translatable("slashclient-hud.streams." + key, args));
	}

	private int statusColor() {
		return switch (chat.state()) {
			case CONNECTING, RETRYING -> 0xFFFACC15;
			case FAILED -> 0xFFF87171;
			default -> 0xFFA1A1AA;
		};
	}

	/** Made-up lines for the editor, before real ones come. */
	private List<Row> sample(Minecraft mc, StreamChatSettings s, int inner, long now) {
		String emote = kick ? ":KEKW:" : "LUL";
		Object[][] lines = {
			{ "Slash3rss", 0x60A5FA, List.of(dev.slash3rss.slashclient.hud.streams.ChatBadges.HOST), "Witajcie na streamie!" },
			{ "Moderator", 0x00AD03, List.of(dev.slash3rss.slashclient.hud.streams.ChatBadges.MOD), "Pamiętajcie o regulaminie czatu" },
			{ "Kasia_gra", 0xFF69B4, List.of(dev.slash3rss.slashclient.hud.streams.ChatBadges.SUB), "ten build jest świetny " + emote },
			{ "Gracz_PL", 0x9146FF, List.of(dev.slash3rss.slashclient.hud.streams.ChatBadges.VIP), "gg" },
			{ "nowy_widz", -1, List.<StreamChat.Badge>of(), "na jakim serwerze grasz?" },
			{ "Piotrek", 0x1E3A8A, List.of(dev.slash3rss.slashclient.hud.streams.ChatBadges.SUB), emote + " " + emote },
		};
		List<Row> out = new ArrayList<>();
		for (Object[] o : lines) {
			@SuppressWarnings("unchecked")
			StreamChat.Line l = new StreamChat.Line("", (String) o[0], ((String) o[0]).toLowerCase(java.util.Locale.ROOT), (int) o[1], (List<StreamChat.Badge>) o[2], (String) o[3], false, now);
			wrap(mc, message(l, s), inner, now, 0, out);
		}
		return out;
	}

	// ---------- the module ----------

	@Override
	public boolean visible(Minecraft mc) {
		return !rows(mc).isEmpty();
	}

	@Override
	public int width(Minecraft mc) {
		return settings.get().width;
	}

	@Override
	public int height(Minecraft mc) {
		return Math.max(1, rows(mc).size()) * LINE - 1 + Modules.PAD * 2;
	}

	@Override
	public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		HudConfig.Placement p = Modules.drawing;
		int base = (p != null ? p.textColor(Modules.cfg) : Modules.cfg.textColor) & 0xFFFFFF;
		boolean shadow = p != null ? p.shadow(Modules.cfg) : Modules.cfg.textShadow;
		boolean fade = settings.get().fade && !(Compat.screen(mc) instanceof HudEditScreen) && !(Compat.screen(mc) instanceof net.minecraft.client.gui.screens.ChatScreen);
		long now = System.currentTimeMillis();
		int row = y + Modules.PAD;
		for (Row r : rows(mc)) {
			float a = fade && r.color() == 0 ? alpha(now - r.time()) : 1f;
			int rgb = r.color() != 0 ? r.color() & 0xFFFFFF : base;
			g.text(mc.font, r.text(), x + Modules.PAD, row, Math.round(a * 255) << 24 | rgb, shadow);
			row += LINE;
		}
	}

	// ---------- for the in-game tests ----------

	/** The rows as plain text, one per line. */
	String shownText(Minecraft mc) {
		rowsAt = 0;
		StringBuilder out = new StringBuilder();
		for (Row r : rows(mc)) {
			StringBuilder line = new StringBuilder();
			r.text().accept((index, style, cp) -> {
				line.appendCodePoint(cp);
				return true;
			});
			out.append(line).append('\n');
		}
		return out.toString();
	}
}
