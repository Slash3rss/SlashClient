package dev.slash3rss.slashclient.hud.social;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.network.chat.Component;

/**
 * A friend's message, invite or request in SlashClient's own look: a dark panel like the friends
 * window, the friend's face (their skin's, as on the server list), else their initial on the
 * accent (as on the friends list), or an icon, their name in
 * bold, the text under it and a thin bar running out while it is shown. An achievement's adds a
 * third line in gold: the Sparks it paid. Each kind has its colour (the rim, a stripe on the left,
 * the badge and the bar), so a friend coming online is told from an invite or an error at a glance.
 */
public final class FriendToast implements Toast {
	/** What a toast is about: its colour, light and dark (the badge's gradient). */
	public enum Kind {
		MESSAGE(Ui.ACCENT_LIGHT, Ui.ACCENT_DARK),
		ONLINE(0xFF4ADE80, 0xFF15803D),
		PLAYING(0xFF22D3EE, 0xFF0E7490),
		// live in the platforms' own colours: Twitch purple, Kick lime
		LIVE(0xFFA78BFA, 0xFF6D28D9),
		KICK(0xFF53FC18, 0xFF2F8F0C),
		INVITE(0xFFFB923C, 0xFFC2410C),
		COMMUNITY(0xFFF472B6, 0xFFBE185D),
		ACHIEVEMENT(0xFFFFC94D, 0xFFB7791F),
		ERROR(0xFFF87171, 0xFFB91C1C),
		// a clip saved, a resource pack kept, a LAN world opened…: the blue of messages, switched apart
		OTHER(Ui.ACCENT_LIGHT, Ui.ACCENT_DARK);

		final int light, dark;

		Kind(int light, int dark) {
			this.light = light;
			this.dark = dark;
		}

		/**
		 * A toast not from a friend, by its icon: errors red, achievements gold, communities pink, a clan's invite
		 * orange, a group's message and a picture sent as messages; the rest (clips, packs, LAN) other.
		 */
		static Kind of(String icon) {
			if (icon == null) return MESSAGE;
			return switch (icon) {
				case "info" -> ERROR;
				case "m-advancements" -> ACHIEVEMENT;
				case "m-players" -> COMMUNITY;
				case "m-armor" -> INVITE;
				case "m-friends", "m-screenshot" -> MESSAGE;
				default -> OTHER;
			};
		}

		/** From friends and communities, which "Nie przeszkadzać" keeps quiet (not the game's own: clips, achievements, errors…). */
		boolean social() {
			return switch (this) {
				case MESSAGE, ONLINE, PLAYING, LIVE, KICK, INVITE, COMMUNITY -> true;
				default -> false;
			};
		}

		/** Whether the player wants this kind now (each kind's switch; "Nie przeszkadzać" quiets the social ones). */
		boolean wanted() {
			var c = dev.slash3rss.slashclient.hud.SlashHud.config;
			if (c == null) return true;
			if (!c.toasts) return false;
			if (social() && c.toastDnd && Social.doNotDisturb()) return false;
			return switch (this) {
				case MESSAGE -> c.toastMessages;
				case ONLINE -> c.toastOnline;
				case PLAYING -> c.toastPlaying;
				case LIVE, KICK -> c.toastLive;
				case INVITE -> c.toastInvites;
				case COMMUNITY -> c.toastCommunities;
				case ACHIEVEMENT -> c.toastAchievements;
				case ERROR -> c.toastErrors;
				case OTHER -> c.toastOther;
			};
		}
	}

	/** Shown at least this long, longer for a long text (to read it, and for one too wide to slide through and back), at most the last. */
	private static final long MIN_MS = 5000, MAX_MS = 15000;
	// as wide as the game's own toasts, so it fits their box in the HUD editor
	private static final int WIDTH = 160;

	private final String title;
	private final String text;
	/** An icon instead of the initial, for what does not come from a person (a LAN world opened). */
	private final String icon;
	/** Sparks paid ("+50 Sparks"), on a line of its own with the spark, or null. */
	private final String sparks;
	/** The friend it is from, for their face (null: not from a friend). */
	private final String friendId;
	private final Kind kind;
	/** 32 high, 43 with the Sparks' line; with it, up to 40 wider so an achievement's name and reward show whole. */
	private final int W, H;
	/** How long this one is shown, from its text's length. */
	private final long showMs;
	private long first = -1, age, last = -1;

	FriendToast(String title, String text, String icon) {
		this(title, text, icon, null);
	}

	FriendToast(String title, String text, String icon, String sparks) {
		this(title, text, icon, sparks, null, Kind.of(icon));
	}

	FriendToast(String title, String text, String icon, String sparks, String friendId, Kind kind) {
		this.friendId = friendId;
		this.kind = kind;
		this.title = title;
		this.text = text;
		this.icon = icon;
		this.sparks = sparks;
		H = sparks == null ? 32 : 43;
		W = sparks == null ? WIDTH : Math.max(WIDTH, Math.min(WIDTH + 40, 40 + Math.max(Ui.width(Ui.bold(title)), Ui.width(Ui.text(text)))));
		showMs = showMs(title, text, W - 40);
	}

	/** For the test: how long a toast of this title and text is shown (ms). */
	public static long showMsForTest(String title, String text) {
		return showMs(title, text, WIDTH - 40);
	}

	/**
	 * Long enough to read the title and text (a moment and 60 ms a letter), and for a line too wide for the
	 * toast to slide to its end and back once at the marquee's pace.
	 */
	private static long showMs(String title, String text, int room) {
		long read = 2000 + 60L * (title.length() + text.length());
		int over = Math.max(Ui.width(Ui.bold(title)), Ui.width(Ui.text(text))) - room;
		long slide = over <= 0 ? 0 : 3 * 700 + 2 * Math.max(600, over * 1000L / 30);
		return Math.max(MIN_MS, Math.min(MAX_MS, Math.max(read, slide)));
	}

	@Override
	public int width() {
		return W;
	}

	@Override
	public int height() {
		return H;
	}

	//#if MC >= 1.21.2
	private Visibility wanted = Visibility.SHOW;

	@Override
	public Visibility getWantedVisibility() {
		return wanted;
	}

	@Override
	public void update(ToastManager manager, long time) {
		hold(time);
		age = time - first;
		wanted = age < showMs ? Visibility.SHOW : Visibility.HIDE;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, net.minecraft.client.gui.Font font, long time) {
		draw(g);
	}
	//#else
	//$ @Override
	//$ public Visibility render(GuiGraphicsExtractor g, ToastManager manager, long time) {
	//$ 	hold(time);
	//$ 	age = time - first;
	//$ 	draw(g);
	//$ 	return age < showMs ? Visibility.SHOW : Visibility.HIDE;
	//$ }
	//#endif

	/**
	 * Its clock: it does not run while a SlashClient window holds the toasts back (or while it was not drawn at all,
	 * where the game asks only when drawing), so it is shown its whole time after.
	 */
	private void hold(long time) {
		if (first < 0) first = time;
		else if (last >= 0 && (dev.slash3rss.slashclient.hud.gamehud.GameHud.toastsHeld() || time - last > 250)) first += time - last;
		last = time;
	}

	private void draw(GuiGraphicsExtractor g) {
		Ui.round(g, 0, 0, W, H, 6, Ui.PANEL);
		Ui.roundOutline(g, 0, 0, W, H, 6, kind.light & 0x70FFFFFF);
		// the kind's stripe down the left edge
		g.fill(1, 7, 3, H - 7, kind.light);
		// the avatar: the friend's face, else the initial on the accent, or the icon
		if (icon == null && friendId != null) {
			g.fill(6, 6, 26, 26, 0xFF0A0D14);
			if (dev.slash3rss.slashclient.hud.servers.ServerFriends.drawFace(g, friendId, 7, 7, 18)) {
				drawText(g);
				return;
			}
		}
		Ui.roundGradient(g, 7, 7, 18, 18, 5, kind.light, kind.dark);
		Ui.roundOutline(g, 7, 7, 18, 18, 5, Ui.blend(kind.dark, kind.light, 0.5f));
		if (icon != null) Ui.icon(g, icon, 11, 11, 10, 0xFFFFFFFF);
		else {
			Component initial = Ui.bold(title.isEmpty() ? "?" : title.substring(0, 1).toUpperCase());
			Ui.draw(g, initial, 16 - Ui.width(initial) / 2, 12, 0xFFFFFFFF);
		}
		drawText(g);
	}

	/**
	 * The part of a line shown now: all of it when it fits, else from the letter the marquee's slide has reached
	 * (a toast is drawn moved to its place, so it is cut by letters rather than clipped).
	 */
	private String sliding(String line, boolean bold, int room) {
		java.util.function.ToIntFunction<String> width = s -> Ui.width(bold ? Ui.bold(s) : Ui.text(s));
		int over = width.applyAsInt(line) - room;
		if (over <= 0) return line;
		int shift = (int) Math.min(over, Ui.bounce(age, over, 700, Math.max(600, over * 1000L / 30)));
		int from = 0;
		while (from < line.length() - 1 && width.applyAsInt(line.substring(0, from + 1)) <= shift) from++;
		String rest = line.substring(from);
		// cut at the end by the line's own font and weight
		while (rest.length() > 1 && width.applyAsInt(rest) > room) rest = rest.substring(0, rest.length() - 1);
		return rest;
	}

	/** The name, the text, the Sparks' line and the bar running out. */
	private void drawText(GuiGraphicsExtractor g) {
		int textW = W - 33 - 7;
		// a title or text too wide slides through and back while shown, instead of being cut
		Ui.draw(g, Ui.bold(sliding(title, true, textW)), 33, 7, Ui.TEXT);
		// the text in the menus' font like the title (the game's pixel font under it looked out of place)
		Ui.draw(g, Ui.text(sliding(text, false, textW)), 33, 18, Ui.TEXT_2);
		if (sparks != null) {
			dev.slash3rss.slashclient.hud.cosmetics.Sparks.icon(g, 33, 29, 8);
			Ui.draw(g, Ui.fit(Ui.bold(sparks), textW - 11), 44, 29, dev.slash3rss.slashclient.hud.cosmetics.Sparks.GOLD);
		}
		// how long it is still shown
		float left = Math.max(0f, 1f - (float) age / showMs);
		g.fill(6, H - 3, 6 + Math.round((W - 12) * left), H - 2, kind.light);
	}
}
