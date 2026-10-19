package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * What the SlashClient menus share (main menu, pause menu): one panel with the main buttons
 * named, the first one blue, and below them a row of icon buttons whose names show on hover.
 */
public abstract class MenuScreen extends Screen {
	protected record Hit(int x, int y, int w, int h, Runnable action) {}

	/** A button: its name, one of the launcher's icons, what it does; `danger` draws it red. */
	public record Nav(Component label, String icon, Runnable action, boolean danger) {
		public Nav(Component label, String icon, Runnable action) {
			this(label, icon, action, false);
		}
	}

	protected final List<Hit> hits = new ArrayList<>();
	/** The name of the icon under the mouse, drawn last so it sits above everything. */
	private Component tooltip;
	private int tipX, tipY;

	protected MenuScreen(Component title) {
		super(title);
	}

	// lower on small screens (854×480 at GUI scale 2 is 240 high), so the icon row stays on screen
	protected int rowHeight() {
		return height >= 300 ? 22 : height >= 260 ? 18 : 16;
	}

	protected int rowGap() {
		return height >= 300 ? 5 : height >= 260 ? 3 : 2;
	}

	/** Height of a panel with `items` named buttons and the icon row. */
	protected int panelHeight(int items) {
		return 10 + items * (rowHeight() + rowGap()) - rowGap() + 10 + 8 + 22 + 10;
	}

	/** Starts a frame: no clickable places or tooltip from the last one. */
	protected void beginFrame() {
		hits.clear();
		tooltip = null;
	}

	/** The panel at (px, py), `pw` wide: the named buttons, a thin line, the icon row. */
	protected void drawMenu(GuiGraphicsExtractor g, int mx, int my, int px, int py, int pw, List<Nav> items, List<Nav> tools) {
		int nh = rowHeight(), gap = rowGap();
		int ph = panelHeight(items.size());
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("menu buttons", px, py, pw, ph);
		int ny = py + 10;
		boolean first = true;
		for (Nav n : items) {
			navRow(g, mx, my, px + 10, ny, pw - 20, nh, n.icon(), n.label(), first, n.danger(), n.action());
			first = false;
			ny += nh + gap;
		}
		int iy = ny - gap + 10 + 8, ig = 6;
		g.fill(px + 12, iy - 9, px + pw - 12, iy - 8, Ui.BORDER);
		int iw = (pw - 20 - ig * (tools.size() - 1)) / tools.size();
		for (int i = 0; i < tools.size(); i++) {
			Nav n = tools.get(i);
			int ix = px + 10 + i * (iw + ig);
			iconButton(g, mx, my, ix, iy, iw, 22, n.icon(), n.danger(), n.action());
			if (Ui.inside(mx, my, ix, iy, iw, 22)) {
				tooltip = n.label();
				tipX = ix + iw / 2;
				tipY = iy - 6;
			}
		}
		Ui.end();
	}

	/** One of the main buttons: icon and name in the middle, a light border on hover. */
	protected void navRow(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h, String icon, Component label, boolean primary, boolean danger, Runnable action) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover("nav:" + icon, over);
		if (primary) Ui.accent(g, x, y, w, h, 5, t);
		else {
			Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, danger ? 0xFF2A1720 : Ui.CARD_HOVER, t));
			Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, danger ? 0x88EF4444 : 0x883B82F6, t));
		}
		int color = primary ? 0xFFFFFFFF : danger ? 0xFFFCA5A5 : Ui.blend(Ui.TEXT_2, Ui.TEXT, t);
		// icon and name together in the middle of the button, like the game's own buttons
		Component text = Ui.fit(Ui.text(label.getString()), w - 40);
		int left = x + (w - (10 + 7 + Ui.width(text))) / 2;
		Ui.icon(g, icon, left, y + (h - 10) / 2, 10, primary ? 0xFFFFFFFF : danger ? 0xFFF87171 : Ui.blend(Ui.MUTED, Ui.ACCENT_LIGHT, t));
		Ui.draw(g, text, left + 17, y + (h - 8) / 2, color);
		hits.add(new Hit(x, y, w, h, action));
	}

	/** A square-ish button with just an icon; its name is the tooltip. */
	protected void iconButton(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h, String icon, boolean danger, Runnable action) {
		boolean over = Ui.inside(mx, my, x, y, w, h);
		float t = Ui.hover("tool:" + icon, over);
		Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, danger ? 0xFF2A1720 : Ui.CARD_HOVER, t));
		Ui.roundOutline(g, x, y, w, h, 5, Ui.blend(Ui.BORDER, danger ? 0x88EF4444 : 0x883B82F6, t));
		int color = danger ? Ui.blend(0xFFF87171, 0xFFFCA5A5, t) : Ui.blend(Ui.MUTED, Ui.ACCENT_LIGHT, t);
		Ui.icon(g, icon, x + (w - 10) / 2, y + (h - 10) / 2, 10, color);
		hits.add(new Hit(x, y, w, h, action));
	}

	/** The hovered icon's name in a small dark label above it, kept inside the screen. */
	protected void drawTooltip(GuiGraphicsExtractor g) {
		if (tooltip == null) return;
		Component text = Ui.text(tooltip.getString());
		int w = Ui.width(text) + 12, h = 15;
		int x = Math.max(4, Math.min(width - w - 4, tipX - w / 2));
		int y = tipY - h;
		Ui.layer(g);
		Ui.round(g, x, y, w, h, 4, 0xF0111622);
		Ui.roundOutline(g, x, y, w, h, 4, 0x403B82F6);
		Ui.draw(g, text, x + 6, y + 4, Ui.TEXT);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		//#if MC >= 1.21.9
		if (super.mouseClicked(e, doubleClick)) return true;
		//#else
		//$ if (super.mouseClicked(e.x(), e.y(), e.button())) return true;
		//#endif
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}
}
