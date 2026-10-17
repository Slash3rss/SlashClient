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
		// chat tabs are a page of this window, like any other settings
		if (entries == null) entries = Catalog.entries(() -> {
			settingsOf = entries.stream().filter(e -> e.id().equals("chatTabs")).findFirst().orElse(null);
			reopen();
		});
		return entries;
	}

	// ---------- chat tabs page ----------

	private static final int MAX_TABS = 8;
	private static final int TAB_ROW = 24;
	/** The text fields of the shown tabs: name, patterns and exclusions, three each. */
	private final List<EditBox> tabFields = new ArrayList<>();
	private int tabsTop;
	private int tabsFit;

	private boolean chatTabsPage() {
		return window && settingsOf != null && settingsOf.id().equals("chatTabs");
	}

	private void tabsChanged() {
		SlashHud.config.save();
		ChatTabs.changed();
	}

	private void initChatTabs() {
		int cx = winX() + 132, cy = winY() + 42, cw = winW() - 144, ch = winH() - 50;
		int help = font.split(Ui.tr("slashclient-hud.chat.help"), cw).size();
		tabsTop = cy + 26 + help * 11 + 4;
		tabsFit = Math.max(1, (cy + ch - 26 - tabsTop) / TAB_ROW);
		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		for (int i = 0; i < Math.min(tabs.size(), tabsFit); i++) {
			HudConfig.ChatTab tab = tabs.get(i);
			int y = tabsTop + i * TAB_ROW + 5;
			EditBox name = new EditBox(font, cx + 6, y, 62, 12, Ui.tr("slashclient-hud.chat.name"));
			name.setBordered(false);
			name.setTextColor(Ui.TEXT);
			name.setMaxLength(16);
			name.setValue(tab.name);
			name.setHint(Ui.tr("slashclient-hud.chat.name"));
			name.setResponder(v -> {
				tab.name = v;
				tabsChanged();
			});
			// "catches" takes most of the room, "but not" the rest
			int room = cw - 82 - 98, pw = Math.round((room - 10) * 0.52f);
			EditBox patterns = new EditBox(font, cx + 82, y, pw, 12, Ui.tr("slashclient-hud.chat.patterns"));
			patterns.setBordered(false);
			patterns.setTextColor(Ui.TEXT);
			patterns.setMaxLength(256);
			patterns.setValue(ChatTabsScreen.joined(tab));
			patterns.setHint(Ui.tr(tab.regex ? "slashclient-hud.chat.hint.regex" : "slashclient-hud.chat.hint.text"));
			patterns.setResponder(v -> {
				ChatTabsScreen.setPatterns(tab, v);
				tabsChanged();
			});
			EditBox excludes = new EditBox(font, cx + 82 + pw + 10, y, room - pw - 10, 12, Ui.tr("slashclient-hud.chat.excludes"));
			excludes.setBordered(false);
			excludes.setTextColor(Ui.TEXT);
			excludes.setMaxLength(256);
			excludes.setValue(ChatTabsScreen.joinedExcludes(tab));
			excludes.setHint(Ui.tr("slashclient-hud.chat.hint.excludes"));
			excludes.setResponder(v -> {
				ChatTabsScreen.setExcludes(tab, v);
				tabsChanged();
			});
			addRenderableWidget(name);
			addRenderableWidget(patterns);
			addRenderableWidget(excludes);
			tabFields.add(name);
			tabFields.add(patterns);
			tabFields.add(excludes);
		}
	}

	private void drawChatTabs(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		Ui.button(g, "back", x, y, 70, 18, "back", Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			SlashHud.config.chatTabs.removeIf(t -> t.name.isBlank());
			tabsChanged();
			settingsOf = null;
			reopen();
		}));
		Ui.round(g, x + 78, y, 20, 18, 4, 0xFF1B2B4D);
		Ui.icon(g, e.icon(), x + 82, y + 3, 12, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold(e.nameKey()), w - 106), x + 104, y + 5, Ui.TEXT);
		Ui.wrapped(g, Ui.tr("slashclient-hud.chat.help"), x, y + 26, w, Ui.TEXT_2);

		List<HudConfig.ChatTab> tabs = SlashHud.config.chatTabs;
		String error = "";
		for (int i = 0; i < tabFields.size() / 3 && i < tabs.size(); i++) {
			HudConfig.ChatTab tab = tabs.get(i);
			int ry = tabsTop + i * TAB_ROW;
			EditBox name = tabFields.get(i * 3), patterns = tabFields.get(i * 3 + 1), excludes = tabFields.get(i * 3 + 2);
			for (EditBox box : List.of(name, patterns, excludes)) {
				Ui.round(g, box.getX() - 5, ry, box.getWidth() + 10, 18, 4, Ui.CARD);
				// the exclusions field has a faint red edge: what is written there keeps lines out
				int edge = box == excludes ? 0x40F87171 : Ui.BORDER;
				Ui.roundOutline(g, box.getX() - 5, ry, box.getWidth() + 10, 18, 4, box.isFocused() ? 0x993B82F6 : edge);
			}
			int bx = x + w - 92;
			Ui.button(g, "mode:" + i, bx, ry, 64, 18, Ui.tr(tab.regex ? "slashclient-hud.chat.regex" : "slashclient-hud.chat.text"), tab.regex, mx, my);
			hits.add(new Hit(bx, ry, 64, 18, () -> {
				String current = patterns.getValue(), currentEx = excludes.getValue();
				tab.regex = !tab.regex;
				ChatTabsScreen.setPatterns(tab, current);
				ChatTabsScreen.setExcludes(tab, currentEx);
				tabsChanged();
				reopen();
			}));
			Ui.button(g, "remove:" + i, x + w - 22, ry, 22, 18, "close", Component.empty(), false, mx, my);
			hits.add(new Hit(x + w - 22, ry, 22, 18, () -> {
				tabs.remove(tab);
				tabsChanged();
				reopen();
			}));
			if (tab.regex) for (String p : java.util.stream.Stream.concat(tab.patterns.stream(), tab.excludes().stream()).toList()) {
				String problem = ChatTabs.problem(p);
				if (problem != null) error = tab.name + ": " + problem;
			}
		}
		int below = tabsTop + Math.min(tabs.size(), tabsFit) * TAB_ROW + 2;
		if (tabs.size() < Math.min(MAX_TABS, tabsFit)) {
			Component add = Ui.tr("slashclient-hud.chat.add");
			int aw = Ui.buttonWidth(add, null, 18, 6);
			Ui.button(g, "addTab", x, below, aw, 18, add, true, mx, my);
			hits.add(new Hit(x, below, aw, 18, () -> {
				tabs.add(new HudConfig.ChatTab(Component.translatable("slashclient-hud.chat.new").getString(), false));
				tabsChanged();
				reopen();
			}));
		}
		int hidden = Math.max(0, tabs.size() - tabsFit);
		if (!error.isEmpty()) Ui.draw(g, Ui.fit(Ui.text(error), w), x, y + h - 10, Ui.DANGER);
		else if (hidden > 0) Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.chat.more", hidden), w), x, y + h - 10, Ui.MUTED);
	}

	// ---------- crosshair page ----------

	/** The painting grid of the last frame: where it is and how big one of its pixels is. */
	private int gridX, gridY, gridCell;
	/** While the mouse paints the grid: true draws pixels, false erases them. */
	private Boolean painting;

	private boolean crosshairPage() {
		return window && settingsOf != null && settingsOf.id().equals("crosshair");
	}

	private Catalog.Setting crosshairSetting(String labelKey) {
		return settingsOf.settings().stream().filter(s -> s.labelKey().equals(labelKey)).findFirst().orElseThrow();
	}

	/** Presets to pick from on the right, and on the left the crosshair big, to paint pixel by pixel. */
	private void drawCrosshairPage(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		HudConfig cfg = SlashHud.config;
		Ui.button(g, "back", x, y, 70, 18, "back", Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			settingsOf = null;
			reopen();
		}));
		Ui.round(g, x + 78, y, 20, 18, 4, 0xFF1B2B4D);
		Ui.icon(g, e.icon(), x + 82, y + 3, 12, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold(e.nameKey()), w - 134), x + 104, y + 5, Ui.TEXT);
		boolean on = e.get().get();
		Ui.toggle(g, "crosshair:on", x + w - 20, y + 4, on);
		hits.add(new Hit(x + w - 26, y, 26, 18, () -> e.set().accept(!e.get().get())));

		String style = Crosshair.style();
		boolean[] shown = Crosshair.current();
		int color = cfg.crosshairColor;
		int top = y + 26, bodyH = h - 26;

		// the grid, as big as the height allows, with the clear button under it
		int cell = Math.max(3, Math.min(10, (bodyH - 30) / Crosshair.N));
		int grid = cell * Crosshair.N;
		gridX = x + 2;
		gridY = top + 2;
		gridCell = cell;
		Ui.round(g, x, top, grid + 4, grid + 4, 4, 0xFF0B0F18);
		for (int cy = 0; cy < Crosshair.N; cy++) for (int cx = 0; cx < Crosshair.N; cx++) {
			boolean middle = cx == Crosshair.MID || cy == Crosshair.MID;
			int bg = (cx + cy) % 2 == 0 ? (middle ? 0xFF182238 : 0xFF131926) : (middle ? 0xFF141D30 : 0xFF0F141F);
			g.fill(gridX + cx * cell, gridY + cy * cell, gridX + (cx + 1) * cell, gridY + (cy + 1) * cell, bg);
		}
		Crosshair.draw(g, gridX, gridY, shown, cell, on ? color : Ui.blend(color, 0xFF0F141F, 0.5f), false);
		Ui.roundOutline(g, x, top, grid + 4, grid + 4, 4, painting != null ? 0x993B82F6 : Ui.BORDER);
		int by = top + grid + 8;
		Component clear = Ui.tr("slashclient-hud.crosshair.clear");
		Ui.button(g, "crosshair:clear", x, by, grid + 4, 16, "reset", Ui.fit(clear, grid - 20), false, mx, my);
		hits.add(new Hit(x, by, grid + 4, 16, () -> {
			cfg.crosshair = Crosshair.CUSTOM;
			cfg.crosshairPattern = Crosshair.encode(new boolean[Crosshair.N * Crosshair.N]);
		}));

		// on the right, scrolled when the window is small: presets, colour, outline, size and gap
		int rx = x + grid + 16, rw = x + w - rx;
		g.enableScissor(rx, top, rx + rw, top + bodyH);
		Ui.beginClip("crosshair options", rx, top, rw, bodyH);
		int ry = top - Math.round(scroll);
		Component name = Ui.tr("slashclient-hud.crosshair." + style);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.crosshair.presets").append(Ui.text("  ")).append(name.copy().withColor(Ui.ACCENT_LIGHT)), rw), rx, ry + 2, Ui.TEXT);
		ry += 14;
		List<String> styles = new ArrayList<>(List.of(Crosshair.PRESETS));
		if (cfg.crosshairPattern != null) styles.add(Crosshair.CUSTOM);
		int tile = 27, cols = Math.max(1, (rw + 4) / (tile + 4));
		for (int i = 0; i < styles.size(); i++) {
			String st = styles.get(i);
			int tx = rx + (i % cols) * (tile + 4), ty = ry + (i / cols) * (tile + 4);
			boolean over = Ui.inside(mx, my, tx, ty, tile, tile) && my >= top && my < top + bodyH;
			boolean active = st.equals(style);
			Ui.round(g, tx, ty, tile, tile, 4, over ? 0xFF1C2435 : 0xFF0B0F18);
			Ui.roundOutline(g, tx, ty, tile, tile, 4, active ? Ui.ACCENT_LIGHT : over ? 0x40FFFFFF : Ui.BORDER);
			// each at its real size, one pixel of the grid for one of the game's
			Crosshair.draw(g, tx + 3, ty + 3, Crosshair.pixels(st), 1, color, cfg.crosshairOutline);
			if (ty >= top && ty + tile <= top + bodyH) hits.add(new Hit(tx, ty, tile, tile, () -> cfg.crosshair = st));
		}
		ry += (styles.size() + cols - 1) / cols * (tile + 4) + 6;

		// colour
		Catalog.Colors colors = (Catalog.Colors) crosshairSetting("slashclient-hud.crosshairColor");
		Ui.draw(g, Ui.fit(Ui.tr(colors.labelKey()), rw), rx, ry, Ui.TEXT_2);
		ry += 12;
		int per = Math.max(1, (rw + 4) / 16);
		for (int i = 0; i < colors.colors().length; i++) {
			int c = colors.colors()[i];
			int sx = rx + (i % per) * 16, sy = ry + (i / per) * 16;
			if (c == color) Ui.round(g, sx - 1, sy, 14, 14, 4, 0xFFFFFFFF);
			Ui.round(g, sx, sy + 1, 12, 12, 3, c);
			if (sy >= top && sy + 14 <= top + bodyH) hits.add(new Hit(sx, sy + 1, 12, 12, () -> colors.set().accept(c)));
		}
		ry += (colors.colors().length + per - 1) / per * 16 + 6;

		// outline
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.crosshair.outline"), rw - 28), rx, ry + 1, Ui.TEXT_2);
		Ui.toggle(g, "crosshair:outline", rx + rw - 20, ry, cfg.crosshairOutline);
		if (ry >= top && ry + 12 <= top + bodyH) hits.add(new Hit(rx, ry - 2, rw, 14, () -> cfg.crosshairOutline = !cfg.crosshairOutline));
		ry += 18;

		// size and gap shape the presets; a painted crosshair is what it is
		if (Crosshair.CUSTOM.equals(style)) {
			ry = Ui.wrapped(g, Ui.tr("slashclient-hud.crosshair.customHint"), rx, ry, rw, Ui.MUTED) + 4;
		} else for (String key : new String[] { "slashclient-hud.set.size", "slashclient-hud.set.gap" }) {
			Catalog.Slider sl = (Catalog.Slider) crosshairSetting(key);
			float value = sl.get().get();
			Component v = Ui.text(String.format(Locale.ROOT, sl.format(), value));
			Ui.draw(g, Ui.fit(Ui.tr(key), rw - Ui.width(v) - 6), rx, ry, Ui.TEXT_2);
			Ui.draw(g, v, rx + rw - Ui.width(v), ry, Ui.TEXT);
			ry += 12;
			int sw = rw - 4;
			Ui.slider(g, rx + 2, ry, sw, (value - sl.min()) / (sl.max() - sl.min()));
			int sx = rx + 2;
			if (ry >= top && ry + 12 <= top + bodyH) hits.add(new Hit(rx, ry - 2, rw, 14, () -> {
				draggingSlider = sl;
				sliderX = sx;
				sliderW = sw;
			}));
			ry += 18;
		}
		ry = Ui.wrapped(g, Ui.tr("slashclient-hud.crosshair.paintHint"), rx, ry, rw, Ui.MUTED);
		maxScroll = Math.max(0, ry + Math.round(scroll) - top - bodyH);
		Ui.end();
		g.disableScissor();
	}

	/** For the in-game test: the middle of one of the grid's pixels, in GUI coordinates. */
	double[] gridCellCenter(int cx, int cy) {
		return new double[] { gridX + (cx + 0.5) * gridCell, gridY + (cy + 0.5) * gridCell };
	}

	/** For the in-game test: the middle of a module's ×. */
	double[] closeCenter(String id) {
		HudModule m = SlashHud.MODULES.stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
		int[] c = closeBox(m);
		return new double[] { c[0] + c[2] / 2.0, c[1] + c[2] / 2.0 };
	}

	/** The grid's pixel painted last, so a quick drag fills the pixels it jumped over. */
	private int lastCellX = -1, lastCellY = -1;

	/** Draws or erases the grid's pixels from the last one painted to the one under the mouse. */
	private void paintAt(double mx, double my) {
		int cx = (int) Math.floor((mx - gridX) / gridCell), cy = (int) Math.floor((my - gridY) / gridCell);
		if (painting == null || cx < 0 || cy < 0 || cx >= Crosshair.N || cy >= Crosshair.N) return;
		HudConfig cfg = SlashHud.config;
		boolean[] p = Crosshair.CUSTOM.equals(cfg.crosshair) ? Crosshair.decode(cfg.crosshairPattern) : Crosshair.editable();
		int fromX = lastCellX < 0 ? cx : lastCellX, fromY = lastCellY < 0 ? cy : lastCellY;
		int steps = Math.max(Math.abs(cx - fromX), Math.abs(cy - fromY));
		for (int i = 0; i <= steps; i++) {
			int x = steps == 0 ? cx : Math.round(fromX + (cx - fromX) * (float) i / steps);
			int y = steps == 0 ? cy : Math.round(fromY + (cy - fromY) * (float) i / steps);
			p[y * Crosshair.N + x] = painting;
		}
		lastCellX = cx;
		lastCellY = cy;
		cfg.crosshairPattern = Crosshair.encode(p);
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
		tabFields.clear();
		if (chatTabsPage()) initChatTabs();
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
	 * The drag view: outlines, names on hover, and a toolbar where it covers no module (on a
	 * solid panel, so it reads well over any world) with the way into the settings.
	 */
	private void drawLayout(GuiGraphicsExtractor g, int mx, int my) {
		HudModule hovered = dragging != null ? dragging : moduleAt(mx, my);
		// the mouse on a module's × still counts as on the module, though the × sticks out of it
		if (hovered == null) for (HudModule m : SlashHud.MODULES) {
			int[] c = closeBox(m);
			if (SlashHud.config.placement(m.id()).enabled && Ui.inside(mx, my, c[0], c[1], c[2], c[2])) hovered = m;
		}
		for (HudModule m : SlashHud.MODULES) {
			HudConfig.Placement p = SlashHud.config.placement(m.id());
			if (!p.enabled) continue;
			int[] b = box(m);
			boolean hot = m == hovered;
			Ui.roundOutline(g, b[0] - 2, b[1] - 2, b[2] + 4, b[3] + 4, 3, hot ? Ui.ACCENT_LIGHT : 0x66FFFFFF);
			if (hot) {
				Component name = Ui.tr("slashclient-hud.module." + m.id());
				int tw = Ui.width(name) + 10;
				int ty = b[1] > 16 ? b[1] - 15 : b[1] + b[3] + 3;
				Ui.round(g, b[0] - 2, ty, tw, 13, 3, Ui.ACCENT_DARK);
				Ui.draw(g, name, b[0] + 3, ty + 3, 0xFFFFFFFF);
				if (dragging == null) {
					// × on the corner hides the module; it comes back from its card in the settings
					int[] c = closeBox(m);
					boolean over = Ui.inside(mx, my, c[0], c[1], c[2], c[2]);
					Ui.round(g, c[0], c[1], c[2], c[2], 3, over ? Ui.DANGER : 0xE0161C2A);
					Ui.roundOutline(g, c[0], c[1], c[2], c[2], 3, over ? Ui.DANGER : 0x66FFFFFF);
					Ui.icon(g, "close", c[0] + 2, c[1] + 2, c[2] - 4, 0xFFFFFFFF);
					hits.add(new Hit(c[0], c[1], c[2], c[2], () -> {
						p.enabled = false;
						SlashHud.config.save();
					}));
				}
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
		int by = toolbarY(bx, barW, barH + 4 + 14);
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
		if (chatTabsPage()) drawChatTabs(g, mx, my, cx, cy, cw, ch);
		else if (crosshairPage()) drawCrosshairPage(g, mx, my, cx, cy, cw, ch);
		else if (settingsOf != null) drawSettings(g, mx, my, cx, cy, cw, ch);
		else if (category.equals("share")) drawShare(g, mx, my, cx, cy, cw);
		else drawCards(g, mx, my, cx, cy, cw, ch);
		Ui.end();
		Ui.end();
	}

	private static final String[] CATEGORY_ICONS = { "all", "info", "combat", "world", "layout", "extras", "chat", "share" };


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
		// the icon sits on a small tile, blue when the module is on: the same icons as the launcher and the menu
		Ui.round(g, x + w / 2 - 13, y + 7, 26, 26, 5, on ? 0xFF1B2B4D : 0xFF202839);
		Ui.icon(g, e.icon(), x + w / 2 - 8, y + 12, 16, on ? Ui.ACCENT_LIGHT : Ui.blend(Ui.TEXT_2, Ui.TEXT, t));
		Ui.centered(g, Ui.fit(Ui.trBold(e.nameKey()), w - 10), x + w / 2, y + 38, Ui.TEXT);
		boolean gear = !e.settings().isEmpty();
		if (e.hasSwitch()) {
			Ui.toggle(g, e.id(), x + 8, y + h - 16, on);
			Ui.draw(g, Ui.tr(on ? "slashclient-hud.ui.on" : "slashclient-hud.ui.off"), x + 32, y + h - 16, on ? Ui.ACCENT_LIGHT : Ui.MUTED);
			// the whole card switches the module; the gear on it opens its settings. Clicks are matched
			// from the last added, so the gear goes in after the card or the card would take its clicks
			if (clickable) hits.add(new Hit(x, y, w, h, () -> e.set().accept(!e.get().get())));
			if (gear) {
				Ui.button(g, "gear:" + e.id(), x + w - 24, y + h - 21, 16, 16, "gear", Component.empty(), false, mx, my);
				if (clickable) hits.add(new Hit(x + w - 24, y + h - 21, 16, 16, () -> openSettings(e)));
			}
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
		Ui.icon(g, e.icon(), x + 82, y + 3, 12, Ui.ACCENT_LIGHT);
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
		int span = gridCell * Crosshair.N;
		if (crosshairPage() && Ui.inside(e.x(), e.y(), gridX, gridY, span, span)) {
			// the first pixel decides: drag from an empty one to draw, from a full one to erase
			int cx = (int) ((e.x() - gridX) / gridCell), cy = (int) ((e.y() - gridY) / gridCell);
			painting = !Crosshair.current()[cy * Crosshair.N + cx];
			if (!Crosshair.CUSTOM.equals(SlashHud.config.crosshair)) Crosshair.editable();
			paintAt(e.x(), e.y());
			return true;
		}
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
		if (painting != null) {
			paintAt(e.x(), e.y());
			return true;
		}
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
		painting = null;
		lastCellX = lastCellY = -1;
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
	/**
	 * Where the toolbar (and the hint under it) covers no module: just above the crosshair first
	 * (the middle is where the HUD usually leaves room), then under it, then the top and the
	 * bottom. While a module is dragged the bar is hidden anyway.
	 */
	private int toolbarY(int bx, int bw, int bh) {
		int[] candidates = { height / 2 - 14 - bh, height / 2 + 14, 12, height - 56 - bh };
		for (int y : candidates) {
			if (y < 4 || y + bh > height - 4) continue;
			boolean free = true;
			for (HudModule m : SlashHud.MODULES) {
				if (!SlashHud.config.placement(m.id()).enabled) continue;
				int[] b = box(m);
				if (b[0] - 4 < bx + bw && b[0] + b[2] + 4 > bx && b[1] - 4 < y + bh && b[1] + b[3] + 4 > y) {
					free = false;
					break;
				}
			}
			if (free) return y;
		}
		return candidates[0];
	}

	/** x, y and size of the × that hides a module: on its top-right corner, kept on the screen. */
	private int[] closeBox(HudModule m) {
		int[] b = box(m);
		int size = 11;
		int x = Math.max(0, Math.min(width - size, b[0] + b[2] - size + 5));
		int y = Math.max(0, Math.min(height - size, b[1] - 6));
		return new int[] { x, y, size };
	}

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
		// a tab left without a name would be an empty button above the chat
		if (SlashHud.config.chatTabs.removeIf(t -> t.name.isBlank())) ChatTabs.changed();
		SlashHud.config.save();
		super.onClose();
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// in game the world stays visible and sharp behind the editor; opened from the main menu
		// there is no world, so the menu's panorama with the launcher's blue, as in our menus
		if (minecraft.level != null) return;
		extractPanorama(g, delta);
		g.fill(0, 0, width, height, 0x800A0D14);
		g.fillGradient(0, height / 2, width, height, 0x000A0D14, 0xB00A0D14);
	}
}
