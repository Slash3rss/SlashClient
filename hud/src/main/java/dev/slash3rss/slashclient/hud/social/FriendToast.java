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
		ERROR(0xFFF87171, 0xFFB91C1C);

		final int light, dark;

		Kind(int light, int dark) {
			this.light = light;
			this.dark = dark;
		}

		/** A toast not from a friend, by its icon: errors red, achievements gold, communities pink, a clan's invite orange. */
		static Kind of(String icon) {
			if (icon == null) return MESSAGE;
			return switch (icon) {
				case "info" -> ERROR;
				case "m-advancements" -> ACHIEVEMENT;
				case "m-players" -> COMMUNITY;
				case "m-armor" -> INVITE;
				default -> MESSAGE;
			};
		}
	}

	private static final long SHOW_MS = 5000;
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
	private long first = -1, age;

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
		W = sparks == null ? WIDTH : Math.max(WIDTH, Math.min(WIDTH + 40, 40 + Math.max(Ui.width(Ui.bold(title)), Ui.width(Component.literal(text)))));
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
		if (first < 0) first = time;
		age = time - first;
		wanted = age < SHOW_MS ? Visibility.SHOW : Visibility.HIDE;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, net.minecraft.client.gui.Font font, long time) {
		draw(g);
	}
	//#else
	//$ @Override
	//$ public Visibility render(GuiGraphicsExtractor g, ToastManager manager, long time) {
	//$ 	if (first < 0) first = time;
	//$ 	age = time - first;
	//$ 	draw(g);
	//$ 	return age < SHOW_MS ? Visibility.SHOW : Visibility.HIDE;
	//$ }
	//#endif

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

	/** The name, the text, the Sparks' line and the bar running out. */
	private void drawText(GuiGraphicsExtractor g) {
		int textW = W - 33 - 7;
		Ui.draw(g, Ui.fit(Ui.bold(title), textW), 33, 7, Ui.TEXT);
		Ui.draw(g, Ui.fit(Component.literal(text), textW), 33, 18, Ui.TEXT_2);
		if (sparks != null) {
			dev.slash3rss.slashclient.hud.cosmetics.Sparks.icon(g, 33, 29, 8);
			Ui.draw(g, Ui.fit(Ui.bold(sparks), textW - 11), 44, 29, dev.slash3rss.slashclient.hud.cosmetics.Sparks.GOLD);
		}
		// how long it is still shown
		float left = Math.max(0f, 1f - (float) age / SHOW_MS);
		g.fill(6, H - 3, 6 + Math.round((W - 12) * left), H - 2, kind.light);
	}
}
