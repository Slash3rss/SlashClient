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
			search = new EditBox(font, winX() + winW() - 186, winY() + 11, 140, 12, Ui.tr("slashclient-hud.ui.search"));
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
		g.fill(0, 0, width, height, window ? 0x99000000 : 0x40000000);
		if (dragging != null) {
			g.fill(width / 2, 0, width / 2 + 1, height, snappedX ? 0xAA60A5FA : 0x30FFFFFF);
			g.fill(0, height / 2, width, height / 2 + 1, snappedY ? 0xAA60A5FA : 0x30FFFFFF);
		}
		SlashHud.drawAll(g, minecraft, true);
		if (!window) drawLayout(g, mx, my);
		else drawWindow(g, mx, my);
		super.extractRenderState(g, mx, my, delta);
	}

	/** The drag view: outlines, names on hover, and the button to the settings. */
	private void drawLayout(GuiGraphicsExtractor g, int mx, int my) {
		HudModule hovered = dragging != null ? dragging : moduleAt(mx, my);
		for (HudModule m : SlashHud.MODULES) {
			if (!SlashHud.config.placement(m.id()).enabled) continue;
			int[] b = box(m);
			boolean hot = m == hovered;
			g.outline(b[0] - 1, b[1] - 1, b[2] + 2, b[3] + 2, hot ? Ui.ACCENT_LIGHT : 0x50FFFFFF);
			if (hot) {
				Component name = Ui.tr("slashclient-hud.module." + m.id());
				int tw = Ui.width(name) + 8;
				int ty = b[1] > 14 ? b[1] - 13 : b[1] + b[3] + 2;
				Ui.round(g, b[0] - 1, ty, tw, 12, 3, Ui.ACCENT_DARK);
				Ui.draw(g, name, b[0] + 3, ty + 2, 0xFFFFFFFF);
			}
		}
		if (dragging != null) return;
		Component label = Ui.trBold("slashclient-hud.ui.open");
		int bw = Ui.width(label) + 34;
		int bx = (width - bw) / 2;
		int by = height / 2 - 12;
		Ui.button(g, "open", bx, by, bw, 24, label, true, mx, my);
		hits.add(new Hit(bx, by, bw, 24, () -> {
			window = true;
			reopen();
		}));
		Ui.brand(g, (width - Ui.brandWidth(1.4f)) / 2, by - 30, 1.4f);
		Ui.centered(g, Ui.tr("slashclient-hud.ui.dragHint"), width / 2, by + 34, Ui.TEXT_2);
	}

	private void drawWindow(GuiGraphicsExtractor g, int mx, int my) {
		int x = winX(), y = winY(), w = winW(), h = winH();
		Ui.panel(g, x, y, w, h);
		// header: brand, search, close
		Ui.brand(g, x + 14, y + 11, 1.15f);
		g.fill(x + 1, y + 32, x + w - 1, y + 33, Ui.BORDER);
		if (search != null) {
			Ui.round(g, x + w - 192, y + 7, 152, 18, 4, 0x33000000);
			Ui.roundOutline(g, x + w - 192, y + 7, 152, 18, 4, search.isFocused() ? 0x663B82F6 : Ui.BORDER);
		}
		Ui.button(g, "close", x + w - 32, y + 7, 18, 18, Ui.text("✕"), false, mx, my);
		hits.add(new Hit(x + w - 32, y + 7, 18, 18, this::onClose));

		// sidebar
		int sy = y + 40;
		// rows get shorter in a small window, so "Edit HUD layout" keeps its place at the bottom
		int rowH = Math.max(14, Math.min(20, (h - 40 - 34) / Catalog.CATEGORIES.length - 2));
		for (String cat : Catalog.CATEGORIES) {
			boolean active = cat.equals(category) && settingsOf == null;
			boolean over = Ui.inside(mx, my, x + 8, sy, 104, rowH);
			float t = Ui.hover("cat:" + cat, over || active);
			if (active) {
				Ui.round(g, x + 8, sy, 104, rowH, 4, 0x2E3B82F6);
				g.fill(x + 8, sy + 3, x + 10, sy + rowH - 3, Ui.ACCENT_LIGHT);
			} else if (t > 0) Ui.round(g, x + 8, sy, 104, rowH, 4, Ui.blend(0x00FFFFFF, Ui.GLASS_HOVER, t));
			Ui.draw(g, Ui.tr("slashclient-hud.cat." + cat), x + 18, sy + (rowH - 8) / 2, active ? Ui.TEXT : Ui.TEXT_2);
			String target = cat;
			hits.add(new Hit(x + 8, sy, 104, rowH, () -> {
				category = target;
				settingsOf = null;
				reopen();
			}));
			sy += rowH + 2;
		}
		Ui.draw(g, Ui.tr("slashclient-hud.ui.editLayout"), x + 18, y + h - 22, Ui.ACCENT_LIGHT);
		hits.add(new Hit(x + 8, y + h - 28, 104, 20, () -> {
			window = false;
			rebuildWidgets();
		}));
		g.fill(x + 120, y + 33, x + 121, y + h - 1, Ui.BORDER);

		int cx = x + 130, cy = y + 42, cw = w - 140, ch = h - 50;
		if (settingsOf != null) drawSettings(g, mx, my, cx, cy, cw, ch);
		else if (category.equals("share")) drawShare(g, mx, my, cx, cy, cw);
		else drawCards(g, mx, my, cx, cy, cw, ch);
	}

	private void drawCards(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		String query = search == null ? "" : search.getValue().trim().toLowerCase(Locale.ROOT);
		List<Catalog.Entry> shown = new ArrayList<>();
		for (Catalog.Entry e : entries) {
			if (!category.equals("all") && !e.category().equals(category)) continue;
			if (!query.isEmpty() && !Component.translatable(e.nameKey()).getString().toLowerCase(Locale.ROOT).contains(query)) continue;
			shown.add(e);
		}
		int gap = 6;
		int cols = Math.max(1, (w + gap) / (96 + gap));
		int cardW = (w - gap * (cols - 1)) / cols;
		int cardH = 66;
		int rows = (shown.size() + cols - 1) / cols;
		maxScroll = Math.max(0, rows * (cardH + gap) - gap - h);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		if (shown.isEmpty()) Ui.centered(g, Ui.tr("slashclient-hud.ui.nothing"), x + w / 2, y + 30, Ui.MUTED);
		g.enableScissor(x, y, x + w, y + h);
		for (int i = 0; i < shown.size(); i++) {
			Catalog.Entry e = shown.get(i);
			int px = x + (i % cols) * (cardW + gap);
			int py = y + (i / cols) * (cardH + gap) - Math.round(scroll);
			if (py + cardH < y || py > y + h) continue;
			drawCard(g, mx, my, e, px, py, cardW, cardH, my >= y && my < y + h);
		}
		g.disableScissor();
		if (maxScroll > 0) {
			int barH = Math.max(20, h * h / (h + Math.round(maxScroll)));
			int barY = y + Math.round((h - barH) * scroll / maxScroll);
			Ui.round(g, x + w + 4, barY, 3, barH, 1, 0x40FFFFFF);
		}
	}

	private void drawCard(GuiGraphicsExtractor g, int mx, int my, Catalog.Entry e, int x, int y, int w, int h, boolean clickable) {
		boolean on = e.hasSwitch() && e.get().get();
		float t = Ui.hover("card:" + e.id(), clickable && Ui.inside(mx, my, x, y, w, h));
		Ui.round(g, x, y, w, h, 5, Ui.blend(Ui.GLASS, Ui.GLASS_HOVER, t));
		Ui.roundOutline(g, x, y, w, h, 5, on ? 0x553B82F6 : Ui.blend(Ui.BORDER, 0x33FFFFFF, t));
		Ui.icon(g, e.icon(), e.nameKey().isEmpty() ? "?" : Component.translatable(e.nameKey()).getString().substring(0, 1), x + w / 2 - 8, y + 8);
		Ui.centered(g, Ui.fit(Ui.tr(e.nameKey()), w - 8), x + w / 2, y + 29, on || !e.hasSwitch() ? Ui.TEXT : Ui.TEXT_2);
		boolean gear = !e.settings().isEmpty();
		if (e.hasSwitch()) {
			Ui.toggle(g, e.id(), x + 8, y + h - 16, on);
			if (gear) {
				Ui.button(g, "gear:" + e.id(), x + w - 24, y + h - 20, 16, 16, Ui.text("⚙"), false, mx, my);
				if (clickable) hits.add(new Hit(x + w - 24, y + h - 20, 16, 16, () -> openSettings(e)));
			}
			if (clickable) hits.add(new Hit(x, y, w, h, () -> e.set().accept(!e.get().get())));
		} else {
			Component action = Ui.tr(gear ? "slashclient-hud.ui.settings" : "slashclient-hud.ui.openIt");
			Ui.centered(g, action, x + w / 2, y + h - 15, Ui.ACCENT_LIGHT);
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

	private void drawSettings(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w, int h) {
		Catalog.Entry e = settingsOf;
		Ui.button(g, "back", x, y, 70, 18, Ui.tr("slashclient-hud.ui.back"), false, mx, my);
		hits.add(new Hit(x, y, 70, 18, () -> {
			settingsOf = null;
			reopen();
		}));
		Ui.icon(g, e.icon(), Component.translatable(e.nameKey()).getString().substring(0, 1), x + 80, y + 1);
		Ui.draw(g, Ui.trBold(e.nameKey()), x + 100, y + 5, Ui.TEXT);
		List<Catalog.Setting> rows = new ArrayList<>(e.settings());
		if (e.hasSwitch()) {
			rows.add(0, new Catalog.Toggle("slashclient-hud.ui.enabled", e.get(), e.set()));
		}
		boolean isModule = SlashHud.MODULES.stream().anyMatch(m -> m.id().equals(e.id()));
		int listTop = y + 28;
		int listH = h - 28;
		int contentH = rows.size() * 30 + (isModule ? 30 : 0) + (rows.isEmpty() ? 14 : 0);
		maxScroll = Math.max(0, contentH - listH);
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(x, listTop, x + w, listTop + listH);
		int ry = listTop + 2 - Math.round(scroll);
		boolean inList = my >= listTop && my < listTop + listH;
		for (Catalog.Setting s : rows) {
			Ui.round(g, x, ry, w, 26, 4, Ui.GLASS);
			Component label = Ui.tr(s.labelKey());
			Ui.draw(g, label, x + 10, ry + 9, Ui.TEXT);
			int labelEnd = x + 10 + Ui.width(label) + 14;
			int right = x + w - 10;
			int hitsBefore = hits.size();
			switch (s) {
				case Catalog.Toggle tg -> {
					boolean on = tg.get().get();
					Ui.toggle(g, e.id() + ":" + s.labelKey(), right - 20, ry + 8, on);
					hits.add(new Hit(x, ry, w, 26, () -> tg.set().accept(!tg.get().get())));
				}
				case Catalog.Slider sl -> {
					int sx = Math.max(labelEnd, right - 196);
					int sw = Math.max(40, right - 46 - sx);
					float value = sl.get().get();
					Ui.slider(g, sx, ry + 8, sw, (value - sl.min()) / (sl.max() - sl.min()));
					Component shownValue = Ui.text(String.format(Locale.ROOT, sl.format(), value));
					Ui.draw(g, shownValue, right - Ui.width(shownValue), ry + 9, Ui.TEXT_2);
					hits.add(new Hit(sx - 4, ry + 4, sw + 8, 18, () -> {
						draggingSlider = sl;
						sliderX = sx;
						sliderW = sw;
					}));
				}
				case Catalog.Choice ch -> {
					int bx = right;
					for (int i = ch.values().length - 1; i >= 0; i--) {
						String v = ch.values()[i];
						Component option = Ui.tr(ch.valueKeyPrefix() + v);
						int bw = Ui.width(option) + 12;
						bx -= bw;
						boolean active = v.equals(ch.get().get());
						if (active) Ui.accent(g, bx, ry + 5, bw, 16, 4, 0);
						else Ui.button(g, "choice:" + v, bx, ry + 5, bw, 16, option, false, mx, my);
						if (active) Ui.centered(g, option, bx + bw / 2, ry + 9, 0xFFFFFFFF);
						hits.add(new Hit(bx, ry + 5, bw, 16, () -> ch.set().accept(v)));
						bx -= 4;
					}
				}
				case Catalog.Colors co -> {
					int bx = right - co.colors().length * 16;
					for (int c : co.colors()) {
						boolean active = c == co.get().get();
						if (active) Ui.round(g, bx - 1, ry + 6, 14, 14, 4, 0xFFFFFFFF);
						Ui.round(g, bx, ry + 7, 12, 12, 3, c);
						hits.add(new Hit(bx, ry + 7, 12, 12, () -> co.set().accept(c)));
						bx += 16;
					}
				}
			}
			// rows scrolled out of the box cannot be clicked
			if (!inList) while (hits.size() > hitsBefore) hits.remove(hits.size() - 1);
			ry += 30;
		}
		if (rows.isEmpty()) Ui.draw(g, Ui.tr("slashclient-hud.ui.noSettings"), x, ry, Ui.MUTED);
		// modules can also be moved from here
		if (isModule) {
			Ui.button(g, "move", x, ry + 4, 150, 18, Ui.tr("slashclient-hud.ui.moveIt"), false, mx, my);
			if (inList) hits.add(new Hit(x, ry + 4, 150, 18, () -> {
				window = false;
				rebuildWidgets();
			}));
		}
		g.disableScissor();
	}

	private void drawShare(GuiGraphicsExtractor g, int mx, int my, int x, int y, int w) {
		Ui.draw(g, Ui.trBold("slashclient-hud.share.title"), x, y + 2, Ui.TEXT);
		Ui.draw(g, Ui.tr("slashclient-hud.share.help"), x, y + 16, Ui.TEXT_2);
		HudConfig cfg = SlashHud.config;
		int bw = Math.min(150, (w - 12) / 3);
		Ui.button(g, "copy", x, y + 36, bw, 22, Ui.tr("slashclient-hud.share.copy"), true, mx, my);
		hits.add(new Hit(x, y + 36, bw, 22, () -> {
			minecraft.keyboardHandler.setClipboard(ShareCode.encode(cfg));
			status = Ui.tr("slashclient-hud.share.copied");
		}));
		Ui.button(g, "paste", x + bw + 6, y + 36, bw, 22, Ui.tr("slashclient-hud.share.paste"), false, mx, my);
		hits.add(new Hit(x + bw + 6, y + 36, bw, 22, () -> {
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
		Ui.button(g, "reset", x + (bw + 6) * 2, y + 36, bw, 22, Ui.tr("slashclient-hud.reset"), false, mx, my);
		hits.add(new Hit(x + (bw + 6) * 2, y + 36, bw, 22, () -> {
			cfg.copyFrom(HudConfig.defaults());
			ChatTabs.changed();
			entries = null;
			entries();
			status = Ui.tr("slashclient-hud.share.reset");
		}));
		Ui.draw(g, status, x, y + 68, Ui.GREEN);
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
