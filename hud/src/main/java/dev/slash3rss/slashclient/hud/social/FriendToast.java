package dev.slash3rss.slashclient.hud.social;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.toasts.Toast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.network.chat.Component;

/**
 * A friend's message, invite or request in SlashClient's own look: a dark panel like the friends
 * window, the friend's initial on the accent (as on the friends list) or an icon, their name in
 * bold, the text under it and a thin bar running out while it is shown.
 */
public final class FriendToast implements Toast {
	private static final long SHOW_MS = 5000;
	private static final int W = 180, H = 32;

	private final String title;
	private final String text;
	/** An icon instead of the initial, for what does not come from a person (a LAN world opened). */
	private final String icon;
	private long first = -1, age;

	FriendToast(String title, String text, String icon) {
		this.title = title;
		this.text = text;
		this.icon = icon;
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
		Ui.roundOutline(g, 0, 0, W, H, 6, 0x4060A5FA);
		// the avatar: the initial on the accent, or the icon
		Ui.accent(g, 7, 7, 18, 18, 5, 0.5f);
		if (icon != null) Ui.icon(g, icon, 11, 11, 10, 0xFFFFFFFF);
		else {
			Component initial = Ui.bold(title.isEmpty() ? "?" : title.substring(0, 1).toUpperCase());
			Ui.draw(g, initial, 16 - Ui.width(initial) / 2, 12, 0xFFFFFFFF);
		}
		int textW = W - 33 - 7;
		Ui.draw(g, Ui.fit(Ui.bold(title), textW), 33, 7, Ui.TEXT);
		Ui.draw(g, Ui.fit(Component.literal(text), textW), 33, 18, Ui.TEXT_2);
		// how long it is still shown
		float left = Math.max(0f, 1f - (float) age / SHOW_MS);
		g.fill(6, H - 3, 6 + Math.round((W - 12) * left), H - 2, Ui.ACCENT_LIGHT);
	}
}
