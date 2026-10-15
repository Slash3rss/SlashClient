package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Catalog;
import dev.slash3rss.slashclient.hud.ui.Ui;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The HUD editor, laid out like Lunar's and Feather's but in the launcher's colours.
 *
 * Over the game: drag modules (they snap to edges and the centre lines), right-click one
 * for its settings. The button in the middle opens the settings window: categories on the
 * left, a search box, and a card per module or extra with a switch and a gear.
 */
public class HudEditScreen extends Screen {
	private static final int SNAP = 6;
	private static final int EDGE = 2;

	private HudModule dragging;
	private double grabX;
	private double grabY;
	private boolean snappedX;
	private boolean snappedY;

	private boolean window;
	private String category = "all";
	/** The entry whose settings are open, or null for the cards. */
	private Catalog.Entry settingsOf;
	private float scroll;
	private float maxScroll;
	private Component status = Component.empty();
	private EditBox search;
	private Catalog.Slider draggingSlider;
	private int sliderX;
	private int sliderW;
	private List<Catalog.Entry> entries;

	/** Clickable places of the last frame, checked from the top down. */
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final List<Hit> hits = new ArrayList<>();

	public HudEditScreen() {
		super(Component.translatable("slashclient-hud.editor"));
	}

	/** Opens straight on a module's or extra's settings. */
	public HudEditScreen(String entryId) {
		this();
		window = true;
		settingsOf = entries().stream().filter(e -> e.id().equals(entryId)).findFirst().orElse(null);
	}

	/** Straight into the settings window (from the main menu, where there is no HUD to drag). */
	public static HudEditScreen settingsWindow() {
		HudEditScreen s = new HudEditScreen();
		s.window = true;
		return s;
	}

	/** The settings window on a category ("share", "combat", …); for the screenshot test. */
	public static HudEditScreen category(String category) {
		HudEditScreen s = settingsWindow();
		s.category = category;
		return s;
	}

	private List<Catalog.Entry> entries() {
		if (entries == null) entries = Catalog.entries(() -> {
			SlashHud.config.save();
			minecraft.setScreenAndShow(new ChatTabsScreen(this));
		});
		return entries;
	}

	// ---------- window geometry ----------

	private int winW() {
		return Math.min(580, width - 24);
	}

	private int winH() {
		return Math.min(340, height - 24);
	}

	private int winX() {
		return (width - winW()) / 2;
	}

	private int winY() {
		return (height - winH()) / 2;
	}

	@Override
	protected void init() {
		entries();
		search = null;
		if (window && settingsOf == null && !category.equals("share")) {
			search = new EditBox(font, winX() + winW() - 176, winY() + 12, 132, 12, Ui.tr("slashclient-hud.ui.search"));
			search.setBordered(false);
			search.setTextColor(Ui.TEXT);
			search.setHint(Ui.tr("slashclient-hud.ui.search"));
			search.setResponder(v -> scroll = 0);
			addRenderableWidget(search);
		}
	}

	private void reopen() {
		scroll = 0;
		status = Component.empty();
		String keep = search == null ? "" : search.getValue();
		rebuildWidgets();
		if (search != null) search.setValue(keep);
	}

	// ---------- drawing ----------

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		g.fill(0, 0, width, height, window ? 0xB0050710 : 0x30000000);
		if (dragging != null) {
			g.fill(width / 2, 0, width / 2 + 1, height, snappedX ? 0xAA60A5FA : 0x30FFFFFF);
			g.fill(0, height / 2, width, height / 2 + 1, snappedY ? 0xAA60A5FA : 0x30FFFFFF);
		}
		SlashHud.drawAll(g, minecraft, true);
		if (!window) drawLayout(g, mx, my);
		else drawWindow(g, mx, my);
		super.extractRenderState(g, mx, my, delta);
	}

	/**
	 * The drag view: outlines, names on hover, and a toolbar at the top (on a solid
	 * panel, so it reads well over any world) with the way into the settings.
	 */
	private void drawLayout(GuiGraphicsExtractor g, int mx, int my) {
		HudModule hovered = dragging != null ? dragging : moduleAt(mx, my);
		for (HudModule m : SlashHud.MODULES) {
			if (!SlashHud.config.placement(m.id()).enabled) continue;
			int[] b = box(m);
			boolean hot = m == hovered;
			Ui.roundOutline(g, b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, 3, hot ? Ui.ACCENT_LIGHT : 0x66FFFFFF);
			if (hot) {
				Component name = Ui.tr("slashclient-hud.module." + m.id());
				int tw = Ui.width(name) + 10;
				int ty = b[1] > 16 ? b[1] - 15 : b[1] + b[3] + 3;
				Ui.round(g, b[0] - 2, ty, tw, 13, 3, Ui.ACCENT_DARK);
				Ui.draw(g, name, b[0] + 3, ty + 3, 0xFFFFFFFF);
			}
		}
		if (dragging != null) return;
		Component open = Ui.trBold("slashclient-hud.ui.open");
		Component done = Ui.tr("gui.done");
		int openW = Ui.width(open) + 30;
		int doneW = Ui.width(done) + 20;
		int brandW = Ui.brandWidth(1f);
		int barW = 12 + brandW + 14 + openW + 6 + doneW + 10;
		int barH = 28;
		int bx = (width - barW) / 2;
		// at the top middle, where the game shows nothing but boss bars; the hotbar stays visible
		int by = 8;
		Ui.panel(g, bx, by, barW, barH);
		Ui.begin("toolbar", bx, by, barW, barH);
		Ui.brand(g, bx + 12, by + 10, 1f);
		int x = bx + 12 + brandW + 14;
		Ui.button(g, "open", x, by + 5, openW, 18, "gear", open, true, mx, my);
		hits.add(new Hit(x, by + 5, openW, 18, () -> {
			window = true;
			reopen();
		}));
		x += openW + 6;
		Ui.button(g, "done", x, by + 5, doneW, 18, done, false, mx, my);
		hits.add(new Hit(x, by + 5, doneW, 18, this::onClose));
		Ui.end();
		Component hint = Ui.tr("slashclient-hud.ui.dragHint");
		int hw = Ui.width(hint) + 16;
		Ui.round(g, (width - hw) / 2, by + barH + 4, hw, 14, 4, 0xCC0A0D14);
		Ui.centered(g, hint, width / 2, by + barH + 7, Ui.TEXT_2);
	}


	private void drawWindow(GuiGraphicsExtractor g, int mx, int my) {
		int x = winX(), y = winY(), w = winW(), h = winH();
		Ui.panel(g, x, y, w, h);
		Ui.begin("window", x, y, w, h);
		// header: brand, search, close
		Ui.brand(g, x + 14, y + 12, 1.15f);
		g.fill(x + 1, y + 32, x + w - 1, y + 33, Ui.BORDER);
		if (search != null) {
			boolean focused = search.isFocused();
			Ui.round(g, x + w - 196, y + 7, 156, 18, 4, Ui.CARD);
			Ui.roundOutline(g, x + w - 196, y + 7, 156, 18, 4, focused ? 0x993B82F6 : Ui.BORDER);
			Ui.icon(g, "search", x + w - 190, y + 11, 10, focused ? Ui.ACCENT_LIGHT : Ui.MUTED);
		}
		Ui.button(g, "close", x + w - 32, y + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(x + w - 32, y + 7, 18, 18, this::onClose));

		// sidebar with the launcher's icons
		Ui.begin("sidebar", x, y + 33, 122, h - 33);
		int sy = y + 40;
		// rows get shorter in a small window, so "Edit HUD layout" keeps its place at the bottom
		int rowH = Math.max(14, Math.min(20, (h - 40 - 34) / Catalog.CATEGORIES.length - 2));
		for (String cat : Catalog.CATEGORIES) {
			boolean active = cat.equals(category) && settingsOf == null;
			boolean over = Ui.inside(mx, my, x + 8, sy, 106, rowH);
			float t = Ui.hover("cat:" + cat, over);
			if (active) {
				Ui.round(g, x + 8, sy, 106, rowH, 4, 0xFF1B2B4D);
				g.fill(x + 8, sy + 3, x + 10, sy + rowH - 3, Ui.ACCENT_LIGHT);
			} else if (t > 0) Ui.round(g, x + 8, sy, 106, rowH, 4, Ui.blend(Ui.PANEL, Ui.CARD_HOVER, t));
			int color = active ? Ui.ACCENT_LIGHT : Ui.blend(Ui.TEXT_2, Ui.TEXT, t);
			Ui.icon(g, CATEGORY_ICONS[java.util.Arrays.asList(Catalog.CATEGORIES).indexOf(cat)], x + 16, sy + (rowH - 9) / 2, 9, color);
			Ui.draw(g, Ui.tr("slashclient-hud.cat." + cat), x + 31, sy + (rowH - 8) / 2, active ? Ui.TEXT : color);
			String target = cat;
			hits.add(new Hit(x + 8, sy, 106, rowH, () -> {
				category = target;
				settingsOf = null;
				reopen();
			}));
			sy += rowH + 2;
		}
		Ui.button(g, "layout", x + 8, y + h - 26, 106, 18, "move", Ui.tr("slashclient-hud.ui.editLayout"), false, mx, my);
		hits.add(new Hit(x + 8, y + h - 26, 106, 18, () -> {
			window = false;
			rebuildWidgets();
		}));
		Ui.end();
		g.fill(x + 122, y + 33, x + 123, y + h - 1, Ui.BORDER);

		int cx = x + 132, cy = y + 42, cw = w - 144, ch = h - 50;
		Ui.begin("content", cx, cy, cw, ch);
		if (settingsOf != null) drawSettings(g, mx, my, cx, cy, cw, ch);
		else if (category.equals("share")) drawShare(g, mx, my, cx, cy, cw);
		else drawCards(g, mx, my, cx, cy, cw, ch);
		Ui.end();
		Ui.end();
	}

	private static final String[] CATEGORY_ICONS = { "all", "info", "combat", "world", "extras", "chat", "share" };


	private void drawCards(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		String query = search == null ? "" : search.getValue().trim().toLowerCase(Locale.ROOT);
		List<Catalog.Entry> shown = new ArrayList<>();
		for (Catalog.Entry e : entries) {
			if (!category.equals("all") && !e.category().equals(category)) continue;
			if (!query.isEmpty() && !Component.translatable(e.nameKey()).getString().toLowerCase(Locale.ROOT).contains(query)) continue;
			shown.add(e);
		}
		int gap = 6;
		int cols = Math.max(1, (w + gap) / (104 + gap));
		int cardW = (w - gap * (cols - 1)) / cols;
		int cardH = 72;
		int rows = (shown.size() + cols - 1) / cols;
		maxScroll = Math.max(0, rows * (cardH + gap) - gap - h);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		if (shown.isEmpty()) Ui.centered(g, Ui.tr("slashclient-hud.ui.nothing"), x + w / 2, y + 30, Ui.MUTED);
		g.enableScissor(x, y, x + w, y + h);
		Ui.beginClip("card list", x, y, w, h);
		for (int i = 0; i < shown.size(); i++) {
			Catalog.Entry e = shown.get(i);
			int px = x + (i % cols) * (cardW + gap);
			int py = y + (i / cols) * (cardH + gap) - Math.round(scroll);
			if (py + cardH < y || py > y + h) continue;
			Ui.begin("card " + e.id(), px, py, cardW, cardH);
			drawCard(g, mx, my, e, px, py, cardW, cardH, my >= y && my < y + h);
			Ui.end();
		}
		Ui.end();
		g.disableScissor();
		if (maxScroll > 0) {
			int barH = Math.max(20, h * h / (h + Math.round(maxScroll)));
			int barY = y + Math.round((h - barH) * scroll / maxScroll);
			Ui.end();
			Ui.round(g, x + w + 4, barY, 3, barH, 1, 0x40FFFFFF);
			Ui.begin("content", x, y, w, h);
		}
	}

	private void drawCard(GuiGraphicsExtractor g, int mx, int my, Catalog.Entry e, int x, int y, int w, int h, boolean clickable) {
		boolean on = e.hasSwitch() && e.get().get();
		float t = Ui.hover("card:" + e.id(), clickable && Ui.inside(mx, my, x, y, w, h));
		Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
		Ui.roundOutline(g, x, y, w, h, 5, on ? 0xAA3B82F6 : Ui.blend(Ui.BORDER, 0x40FFFFFF, t));
		// the icon sits on a small tile, tinted blue when the module is on
		Ui.round(g, x + w / 2 - 13, y + 7, 26, 26, 5, on ? 0xFF1B2B4D : 0xFF202839);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + w / 2 - 12, y + 8);
		pose.scale(1.5f, 1.5f);
		Ui.icon(g, e.icon(), Component.translatable(e.nameKey()).getString().substring(0, 1), 0, 0);
		pose.popMatrix();
		Ui.centered(g, Ui.fit(Ui.trBold(e.nameKey()), w - 10), x + w / 2, y + 38, Ui.TEXT);
		boolean gear = !e.settings().isEmpty();
		if (e.hasSwitch()) {
			Ui.toggle(g, e.id(), x + 8, y + h - 16, on);
			Ui.draw(g, Ui.tr(on ? "slashclient-hud.ui.on" : "slashclient-hud.ui.off"), x + 32, y + h - 16, on ? Ui.ACCENT_LIGHT : Ui.MUTED);
			if (gear) {
				Ui.button(g, "gear:" + e.id(), x + w - 24, y + h - 21, 16, 16, "gear", Component.empty(), false, mx, my);
				if (clickable) hits.add(new Hit(x + w - 24, y + h - 21, 16, 16, () -> openSettings(e)));
			}
			if (clickable) hits.add(new Hit(x, y, w, h, () -> e.set().accept(!e.get().get())));
		} else {
			Component action = Ui.tr(gear ? "slashclient-hud.ui.settings" : "slashclient-hud.ui.openIt");
			int aw = Ui.width(action) + 22;
			Ui.icon(g, gear ? "gear" : "arrow", x + (w - aw) / 2, y + h - 16, 9, Ui.ACCENT_LIGHT);
			Ui.draw(g, action, x + (w - aw) / 2 + 13, y + h - 16, Ui.ACCENT_LIGHT);
			if (clickable) hits.add(new Hit(x, y, w, h, () -> {
				if (e.open() != null) e.open().run();
				else openSettings(e);
			}));
		}
	}


	private void openSettings(Catalog.Entry e) {
		settingsOf = e;
		reopen();
	}

	/** Width the controls of a setting need on one line. */
	private static int controlsWidth(Catalog.Setting s) {
		return switch (s) {
			case Catalog.Toggle tg -> 20;
			case Catalog.Slider sl -> 150;
			case Catalog.Choice ch -> {
				int total = 0;
				for (String v : ch.values()) total += Ui.width(Ui.tr(ch.valueKeyPrefix() + v)) + 16;
				yield total - 4;
			}
			case Catalog.Colors co -> co.colors().length * 16;
		};
	}

	private void drawSettings(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		Ui.button(g, "back", x, y, 70, 18, "back", Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			settingsOf = null;
			reopen();
		}));
		Ui.round(g, x + 78, y, 20, 18, 4, 0xFF1B2B4D);
		Ui.icon(g, e.icon(), Component.translatable(e.nameKey()).getString().substring(0, 1), x + 80, y + 1);
		Ui.draw(g, Ui.fit(Ui.trBold(e.nameKey()), w - 106), x + 104, y + 5, Ui.TEXT);
		List<Catalog.Setting> rows = new ArrayList<>(e.settings());
		if (e.hasSwitch()) {
			rows.add(0, new Catalog.Toggle("slashclient-hud.ui.enabled", e.get(), e.set()));
		}
		boolean isModule = SlashHud.MODULES.stream().anyMatch(m -> m.id().equals(e.id()));

		// a row is one line, or two when its controls do not fit beside the label (narrow windows)
		int[] heights = new int[rows.size()];
		int contentH = (isModule ? 28 : 0) + (rows.isEmpty() ? 14 : 0);
		for (int i = 0; i < rows.size(); i++) {
			Catalog.Setting s = rows.get(i);
			int labelW = Ui.width(Ui.tr(s.labelKey())) + 24;
			boolean oneLine = s instanceof Catalog.Toggle || labelW + controlsWidth(s) <= w - 20;
			heights[i] = oneLine ? 26 : 44;
			contentH += heights[i] + 4;
		}
		int listTop = y + 26;
		int listH = h - 26;
		maxScroll = Math.max(0, contentH - listH);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(x, listTop, x + w, listTop + listH);
		Ui.beginClip("settings list", x, listTop, w, listH);
		int ry = listTop + 2 - Math.round(scroll);
		boolean inList = my >= listTop && my < listTop + listH;
		for (int i = 0; i < rows.size(); i++) {
			Catalog.Setting s = rows.get(i);
			int rh = heights[i];
			boolean twoLines = rh > 26;
			Ui.round(g, x, ry, w, rh, 4, Ui.CARD);
			Ui.begin("row " + s.labelKey(), x, ry, w, rh);
			Component label = Ui.fit(Ui.tr(s.labelKey()), w - 20);
			Ui.draw(g, label, x + 10, ry + 9, Ui.TEXT);
			int labelEnd = x + 10 + Ui.width(label) + 14;
			int right = x + w - 10;
			// controls start after the label, or at the left edge of the second line
			int left = twoLines ? x + 10 : labelEnd;
			int cy = twoLines ? ry + 24 : ry + 5;
			int hitsBefore = hits.size();
			switch (s) {
				case Catalog.Toggle tg -> {
					boolean on = tg.get().get();
					Ui.toggle(g, e.id() + ":" + s.labelKey(), right - 20, ry + 8, on);
					hits.add(new Hit(x, ry, w, rh, () -> tg.set().accept(!tg.get().get())));
				}
				case Catalog.Slider sl -> {
					float value = sl.get().get();
					Component shownValue = Ui.text(String.format(Locale.ROOT, sl.format(), value));
					int vw = Ui.width(shownValue) + 10;
					int sx = twoLines ? left + 4 : Math.max(left, right - 196);
					int sw = Math.max(30, right - vw - 12 - sx);
					Ui.slider(g, sx, cy + 3, sw, (value - sl.min()) / (sl.max() - sl.min()));
					Ui.round(g, right - vw, cy + 1, vw, 14, 4, 0xFF202839);
					Ui.draw(g, shownValue, right - vw + 5, cy + 4, Ui.TEXT);
					hits.add(new Hit(sx - 4, cy - 1, sw + 8, 18, () -> {
						draggingSlider = sl;
						sliderX = sx;
						sliderW = sw;
					}));
				}
				case Catalog.Choice ch -> {
					if (controlsWidth(s) <= right - left) {
						// every option as a button, right-aligned
						int bx = right;
						for (int k = ch.values().length - 1; k >= 0; k--) {
							String v = ch.values()[k];
							Component option = Ui.tr(ch.valueKeyPrefix() + v);
							int bw = Ui.width(option) + 12;
							bx -= bw;
							boolean active = v.equals(ch.get().get());
							if (active) {
								Ui.accent(g, bx, cy, bw, 16, 4, 0);
								Ui.centered(g, option, bx + bw / 2, cy + 4, 0xFFFFFFFF);
							} else Ui.button(g, "choice:" + v, bx, cy, bw, 16, option, false, mx, my);
							hits.add(new Hit(bx, cy, bw, 16, () -> ch.set().accept(v)));
							bx -= 4;
						}
					} else {
						// too narrow even for its own line: one button that steps through the options
						List<String> values = List.of(ch.values());
						String current = values.contains(ch.get().get()) ? ch.get().get() : values.get(0);
						Component option = Ui.text("‹  ").append(Ui.tr(ch.valueKeyPrefix() + current)).append(Ui.text("  ›"));
						Ui.button(g, "choice:" + s.labelKey(), left, cy, right - left, 16, option, true, mx, my);
						hits.add(new Hit(left, cy, right - left, 16, () -> ch.set().accept(values.get((values.indexOf(current) + 1) % values.size()))));
					}
				}
				case Catalog.Colors co -> {
					int bx = twoLines ? left : right - co.colors().length * 16 + 4;
					for (int c : co.colors()) {
						boolean active = c == co.get().get();
						if (active) Ui.round(g, bx - 1, cy + 1, 14, 14, 4, 0xFFFFFFFF);
						Ui.round(g, bx, cy + 2, 12, 12, 3, c);
						hits.add(new Hit(bx, cy + 2, 12, 12, () -> co.set().accept(c)));
						bx += 16;
					}
				}
			}
			// controls on the label's line must not cover it
			if (!twoLines && !(s instanceof Catalog.Toggle)) Ui.expect(labelEnd - 14 <= right - controlsWidth(s) || s instanceof Catalog.Slider, "controls cover the label of " + s.labelKey());
			Ui.end();
			// rows scrolled out of the box cannot be clicked
			if (!inList) while (hits.size() > hitsBefore) hits.remove(hits.size() - 1);
			ry += rh + 4;
		}
		if (rows.isEmpty()) Ui.draw(g, Ui.tr("slashclient-hud.ui.noSettings"), x, ry, Ui.MUTED);
		// modules can also be moved from here
		if (isModule) {
			int bw = Math.min(150, w);
			Ui.button(g, "move", x, ry, bw, 18, "move", Ui.tr("slashclient-hud.ui.moveIt"), false, mx, my);
			if (inList) hits.add(new Hit(x, ry, bw, 18, () -> {
				window = false;
				rebuildWidgets();
			}));
		}
		Ui.end();
		g.disableScissor();
	}


	private void drawShare(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w) {
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.share.title"), w), x, y + 2, Ui.TEXT);
		int ty = Ui.wrapped(g, Ui.tr("slashclient-hud.share.help"), x, y + 16, w, Ui.TEXT_2) + 8;
		HudConfig cfg = SlashHud.config;
		// three buttons side by side, or one under another when they would be cut
		boolean stacked = w < 300;
		int bw = stacked ? w : (w - 12) / 3;
		int[][] at = stacked
			? new int[][] { { x, ty }, { x, ty + 26 }, { x, ty + 52 } }
			: new int[][] { { x, ty }, { x + bw + 6, ty }, { x + (bw + 6) * 2, ty } };
		Ui.button(g, "copy", at[0][0], at[0][1], bw, 22, "copy", Ui.tr("slashclient-hud.share.copy"), true, mx, my);
		hits.add(new Hit(at[0][0], at[0][1], bw, 22, () -> {
			minecraft.keyboardHandler.setClipboard(ShareCode.encode(cfg));
			status = Ui.tr("slashclient-hud.share.copied");
		}));
		Ui.button(g, "paste", at[1][0], at[1][1], bw, 22, "paste", Ui.tr("slashclient-hud.share.paste"), false, mx, my);
		hits.add(new Hit(at[1][0], at[1][1], bw, 22, () -> {
			HudConfig pasted = ShareCode.decode(minecraft.keyboardHandler.getClipboard());
			if (pasted == null) status = Ui.tr("slashclient-hud.share.invalid").withColor(Ui.DANGER);
			else {
				cfg.copyFrom(pasted);
				ChatTabs.changed();
				entries = null;
				entries();
				status = Ui.tr("slashclient-hud.share.pasted");
			}
		}));
		Ui.button(g, "reset", at[2][0], at[2][1], bw, 22, "reset", Ui.tr("slashclient-hud.reset"), false, mx, my);
		hits.add(new Hit(at[2][0], at[2][1], bw, 22, () -> {
			cfg.copyFrom(HudConfig.defaults());
			ChatTabs.changed();
			entries = null;
			entries();
			status = Ui.tr("slashclient-hud.share.reset");
		}));
		Ui.wrapped(g, status, x, at[2][1] + 30, w, Ui.GREEN);
	}


	// ---------- input ----------

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick)) return true;
		if (search != null) search.setFocused(false);
		if (e.button() == InputConstants.MOUSE_BUTTON_RIGHT && !window) {
			HudModule m = moduleAt(e.x(), e.y());
			if (m != null) {
				window = true;
				settingsOf = entries().stream().filter(x -> x.id().equals(m.id())).findFirst().orElse(null);
				reopen();
				return true;
			}
		}
		if (e.button() != InputConstants.MOUSE_BUTTON_LEFT) return false;
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				if (draggingSlider != null) dragSlider(e.x());
				return true;
			}
		}
		if (window) {
			// a click beside the window closes it, as in the launcher's dialogs
			if (!Ui.inside(e.x(), e.y(), winX(), winY(), winW(), winH())) {
				window = false;
				settingsOf = null;
				rebuildWidgets();
			}
			return true;
		}
		HudModule m = moduleAt(e.x(), e.y());
		if (m != null) {
			int[] b = box(m);
			dragging = m;
			grabX = e.x() - b[0];
			grabY = e.y() - b[1];
			return true;
		}
		return false;
	}

	private void dragSlider(double mouseX) {
		Catalog.Slider s = draggingSlider;
		float f = (float) Math.max(0, Math.min(1, (mouseX - sliderX) / sliderW));
		float v = s.min() + f * (s.max() - s.min());
		v = Math.round(v / s.step()) * s.step();
		s.set().accept(Math.max(s.min(), Math.min(s.max(), v)));
	}

	@Override
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
		if (draggingSlider != null) {
			dragSlider(e.x());
			return true;
		}
		if (dragging == null) return super.mouseDragged(e, dx, dy);
		int[] b = box(dragging);
		HudConfig.Placement p = SlashHud.config.placement(dragging.id());
		int x = snap((int) Math.round(e.x() - grabX), b[2], width, true);
		int y = snap((int) Math.round(e.y() - grabY), b[3], height, false);
		// keep to the third of the screen the module is in, so it stays there when the window changes
		p.ax = anchor(x + b[2] / 2.0, width);
		p.ay = anchor(y + b[3] / 2.0, height);
		p.dx = x - Math.round(p.ax * (width - b[2]));
		p.dy = y - Math.round(p.ay * (height - b[3]));
		return true;
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent e) {
		dragging = null;
		draggingSlider = null;
		snappedX = snappedY = false;
		return super.mouseReleased(e);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double h, double v) {
		if (window) {
			scroll = Math.max(0, Math.min(maxScroll, scroll - (float) v * 24));
			return true;
		}
		return super.mouseScrolled(x, y, h, v);
	}

	@Override
	public boolean keyPressed(KeyEvent e) {
		// Esc closes the window first, then the editor
		if (e.key() == InputConstants.KEY_ESCAPE && window) {
			if (settingsOf != null) settingsOf = null;
			else window = false;
			reopen();
			return true;
		}
		return super.keyPressed(e);
	}

	// ---------- module boxes ----------

	private HudModule moduleAt(double x, double y) {
		for (int i = SlashHud.MODULES.size() - 1; i >= 0; i--) {
			HudModule m = SlashHud.MODULES.get(i);
			if (!SlashHud.config.placement(m.id()).enabled) continue;
			int[] b = box(m);
			if (Ui.inside(x, y, b[0], b[1], b[2], b[3])) return m;
		}
		return null;
	}

	/** x, y, width, height of a module on screen, with its scale. */
	private int[] box(HudModule m) {
		HudConfig.Placement p = SlashHud.config.placement(m.id());
		int[] size = SlashHud.size(m, minecraft, p);
		int[] at = SlashHud.position(p, size[0], size[1], width, height);
		return new int[] { at[0], at[1], size[0], size[1] };
	}

	private static float anchor(double center, int screen) {
		return center < screen / 3.0 ? 0f : center > screen * 2 / 3.0 ? 1f : 0.5f;
	}

	/** Pulls a position onto the screen edge or the centre line when it is close. */
	private int snap(int pos, int size, int screen, boolean horizontal) {
		pos = Math.max(0, Math.min(screen - size, pos));
		boolean centre = false;
		if (pos < EDGE + SNAP) pos = EDGE;
		else if (pos > screen - size - EDGE - SNAP) pos = screen - size - EDGE;
		else if (Math.abs(pos - (screen - size) / 2) < SNAP) {
			pos = (screen - size) / 2;
			centre = true;
		}
		if (horizontal) snappedX = centre;
		else snappedY = centre;
		return pos;
	}

	/** For the screenshot test: switches every module on. */
	public static void enableAll() {
		SlashHud.MODULES.forEach(m -> SlashHud.config.placement(m.id()).enabled = true);
	}

	@Override
	public void onClose() {
		SlashHud.config.save();
		super.onClose();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the game stays visible and sharp behind the editor
	}
}
