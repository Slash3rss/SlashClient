package dev.slash3rss.slashclient.hud.ui;

import com.mojang.realmsclient.RealmsMainScreen;
import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.gui.screens.options.LanguageSelectScreen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.util.ArrayList;
import java.util.List;

/**
 * The SlashClient main menu, laid out like the game's own (everything in the middle) in the
 * launcher's look: logo, name and greeting, the main buttons with their names, the less used
 * ones as icons (names on hover), and your skin beside them, looking at the mouse.
 * Everything sits on solid panels, so it reads well over any panorama.
 */
public class SlashTitleScreen extends Screen {
	private static final Identifier LOGO = Identifier.fromNamespaceAndPath("slashclient-hud", "icon.png");

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private record Nav(String key, String icon, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();

	private SkinPreview skin;

	public SlashTitleScreen() {
		super(Component.translatable("slashclient-hud.menu.title"));
	}

	/** The main things, with their names. */
	private List<Nav> nav() {
		return List.of(
			new Nav("menu.singleplayer", "world", () -> minecraft.setScreenAndShow(new SelectWorldScreen(this))),
			new Nav("menu.multiplayer", "server", () -> minecraft.setScreenAndShow(new JoinMultiplayerScreen(this))),
			new Nav("slashclient-hud.friends", "user", () -> minecraft.setScreenAndShow(new dev.slash3rss.slashclient.hud.social.FriendsScreen(this))),
			new Nav("slashclient-hud.editor", "sliders", () -> minecraft.setScreenAndShow(HudEditScreen.settingsWindow())),
			new Nav("menu.options", "gear", () -> minecraft.setScreenAndShow(dev.slash3rss.slashclient.hud.Compat.options(minecraft, this))));
	}

	/** Less used things: icons only, their names show on hover. Quitting is the last, in red. */
	private List<Nav> tools() {
		return List.of(
			new Nav("menu.online", "cloud", () -> minecraft.setScreenAndShow(new RealmsMainScreen(this))),
			new Nav("options.language", "language", () -> minecraft.setScreenAndShow(new LanguageSelectScreen(this, minecraft.options, minecraft.getLanguageManager()))),
			new Nav("slashclient-hud.menu.vanilla", "back", () -> {
				SlashHud.config.customMenu = false;
				SlashHud.config.save();
				minecraft.setScreenAndShow(new TitleScreen());
			}),
			new Nav("menu.quit", "power", minecraft::stop));
	}

	/** The name of the icon under the mouse, drawn last so it sits above everything. */
	private Component tooltip;
	private int tipX, tipY;

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		extractPanorama(g, delta);
		// the launcher's dark blue over the panorama, deeper towards the bottom
		g.fill(0, 0, width, height, 0x800A0D14);
		g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		super.extractRenderState(g, mx, my, delta);
		hits.clear();
		tooltip = null;
		List<Nav> items = nav();
		List<Nav> tools = tools();

		// sizes: a column in the middle like the game's own menu, rows shrinking in small windows
		int pw = Math.min(220, width - 24);
		int nh = height >= 300 ? 22 : 18, gap = height >= 300 ? 5 : 3;
		int panelH = 10 + items.size() * (nh + gap) - gap + 10 + 8 + 22 + 10;
		boolean logo = height >= 320;
		int brandH = (logo ? 42 : 0) + 22 + 14;
		int top = Math.max(6, (height - brandH - 10 - panelH) / 2);

		// logo, name and a greeting, centred above the buttons
		int y = top;
		if (logo) {
			int size = 34;
			g.blit(RenderPipelines.GUI_TEXTURED, LOGO, (width - size) / 2, y, 0, 0, size, size, size, size);
			y += 42;
		}
		Ui.brand(g, (width - Ui.brandWidth(1.6f)) / 2, y, 1.6f);
		y += 22;
		Component hello = Ui.tr("slashclient-hud.menu.hello", minecraft.getUser().getName());
		Ui.drawOnWorld(g, Ui.fit(hello, width - 20), (width - Math.min(Ui.width(hello), width - 20)) / 2, y, Ui.TEXT_2);
		y += 14 + 10;

		// the buttons on one panel
		int px = (width - pw) / 2, py = y;
		Ui.panel(g, px, py, pw, panelH);
		Ui.begin("menu buttons", px, py, pw, panelH);
		int ny = py + 10;
		boolean first = true;
		for (Nav n : items) {
			navRow(g, mx, my, px + 10, ny, pw - 20, nh, n.icon(), Ui.tr(n.key()), first, false, n.action());
			first = false;
			ny += nh + gap;
		}
		// less used things as icons in one row, their names on hover
		int iy = ny - gap + 10 + 8, ig = 6;
		g.fill(px + 12, iy - 9, px + pw - 12, iy - 8, Ui.BORDER);
		int iw = (pw - 20 - ig * (tools.size() - 1)) / tools.size();
		for (int i = 0; i < tools.size(); i++) {
			Nav n = tools.get(i);
			int ix = px + 10 + i * (iw + ig);
			iconButton(g, mx, my, ix, iy, iw, 22, n.icon(), n.icon().equals("power"), n.action());
			if (Ui.inside(mx, my, ix, iy, iw, 22)) {
				tooltip = Ui.tr(n.key());
				tipX = ix + iw / 2;
				tipY = iy - 6;
			}
		}
		Ui.end();

		// your skin beside the buttons, looking at the mouse, when there is room for it
		int free = width - (px + pw) - 12;
		if (free >= 64) {
			if (skin == null) skin = new SkinPreview(minecraft);
			// a little shorter than the panel, so the figure stays beside the buttons, not over them
			int fh = Math.min(Math.min(160, panelH - 20), (free - 12) * 2);
			int fw = fh / 2;
			int fx = px + pw + Math.max(12, (Math.min(free, 180) - fw) / 2);
			skin.draw(g, fx, py + panelH - fh, fw, fh, mx, my);
		}
		drawTooltip(g);
	}

	/** A square-ish button with just an icon; its name is the tooltip. */
	private void iconButton(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h, String icon, boolean danger, Runnable action) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover("tool:" + icon, over);
		Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, danger ? 0xFF2A1720 : Ui.CARD_HOVER, t));
		Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, danger ? 0x88EF4444 : 0x883B82F6, t));
		int color = danger ? Ui.blend(0xFFF87171, 0xFFFCA5A5, t) : Ui.blend(Ui.MUTED, Ui.ACCENT_LIGHT, t);
		Ui.icon(g, icon, x + (w - 10) / 2, y + (h - 10) / 2, 10, color);
		hits.add(new Hit(x, y, w, h, action));
	}

	/** The hovered icon's name in a small dark label above it, kept inside the screen. */
	private void drawTooltip(GuiGraphicsExtractor g) {
		if (tooltip == null) return;
		int w = Ui.width(tooltip) + 12, h = 15;
		int x = Math.max(4, Math.min(width - w - 4, tipX - w / 2));
		int y = tipY - h;
		Ui.round(g, x, y, w, h, 4, 0xF0111622);
		Ui.roundOutline(g, x, y, w, h, 4, 0x403B82F6);
		Ui.draw(g, tooltip, x + 6, y + 4, Ui.TEXT);
	}

	/** One of the main buttons: icon and name in the middle, a light border on hover. */
	private void navRow(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h, String icon, Component label, boolean primary, boolean danger, Runnable action) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover("nav:" + icon, over);
		if (primary) Ui.accent(g, x, y, w, h, 5, t);
		else {
			Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, danger ? 0xFF2A1720 : Ui.CARD_HOVER, t));
			Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, danger ? 0x88EF4444 : 0x883B82F6, t));
		}
		int color = primary ? 0xFFFFFFFF : danger ? 0xFFFCA5A5 : Ui.blend(Ui.TEXT_2, Ui.TEXT, t);
		// icon and name together in the middle of the button, like the game's own buttons
		Component text = Ui.fit(label, w - 40);
		int left = x + (w - (10 + 7 + Ui.width(text))) / 2;
		Ui.icon(g, icon, left, y + (h - 10) / 2, 10, primary ? 0xFFFFFFFF : danger ? 0xFFF87171 : Ui.blend(Ui.MUTED, Ui.ACCENT_LIGHT, t));
		Ui.draw(g, text, left + 17, y + (h - 8) / 2, color);
		hits.add(new Hit(x, y, w, h, action));
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick)) return true;
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean shouldCloseOnEsc() {
		return false;
	}
}
