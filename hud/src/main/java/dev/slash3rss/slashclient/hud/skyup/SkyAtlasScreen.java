// SkyUp's fishing is played on 26.3: the fish atlas is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Scrollbar;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * The fish atlas: every SkyUp species on the left (caught ones with how many, the rest grey), with a
 * filter (all, caught, missing) and a search; the chosen one on the right: how many were caught, the
 * weight record against the species' highest weight, the price record and its fun fact (SkyAtlas).
 */
public class SkyAtlasScreen extends Screen {
	private static final int ROW_H = 16, LIST_W = 150;
	private static final String[] FILTERS = { "all", "caught", "missing" };

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final Scrollbar bar = new Scrollbar();
	private EditBox search;
	private String filter = "all", chosen;
	private int scroll, maxScroll, px, py, pw, ph, listX;

	public SkyAtlasScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.skyAtlas.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 16, 520);
		ph = Math.min(height - 16, 340);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		String before = search == null ? "" : search.getValue();
		search = new EditBox(font, px + 12 + 14, py + 50, LIST_W - 16, 14, Ui.tr("slashclient-hud.skyAtlas.search"));
		search.setHint(Ui.tr("slashclient-hud.skyAtlas.search"));
		search.setMaxLength(40);
		search.setValue(before);
		search.setResponder(v -> scroll = 0);
		addRenderableWidget(search);
	}

	private List<SkyAtlas.Fish> shown() {
		String q = search == null ? "" : SkyAtlas.key(search.getValue());
		List<SkyAtlas.Fish> out = new ArrayList<>();
		for (SkyAtlas.Fish f : SkyAtlas.all()) {
			if ("caught".equals(filter) && f.caught <= 0) continue;
			if ("missing".equals(filter) && f.caught > 0) continue;
			if (!q.isEmpty() && !SkyAtlas.key(f.name).contains(q)) continue;
			out.add(f);
		}
		return out;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		bar.hide();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("skyatlas", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		Ui.draw(g, Ui.trBold("slashclient-hud.skyAtlas.title"), x, y, Ui.TEXT);
		List<SkyAtlas.Fish> all = SkyAtlas.all();
		long caught = all.stream().filter(f -> f.caught > 0).count();
		Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.caught", caught, all.size()), x, y + 14, Ui.MUTED);
		int bx = px + pw - 24;
		Ui.button(g, "skyatlas:close", bx, y - 4, 16, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(bx, y - 4, 16, 15, this::onClose));
		// the filter: all, caught, missing
		for (int i = FILTERS.length - 1; i >= 0; i--) {
			String f = FILTERS[i];
			Component label = Ui.tr("slashclient-hud.skyAtlas.filter." + f);
			int w = Ui.buttonWidth(label, null, 15, 2);
			bx -= w + 4;
			Ui.button(g, "skyatlas:filter:" + f, bx, y - 4, w, 15, label, f.equals(filter), mx, my);
			hits.add(new Hit(bx, y - 4, w, 15, () -> {
				filter = f;
				scroll = 0;
			}));
		}
		Ui.icon(g, "search", x, py + 52, 10, Ui.MUTED);
		super.extractRenderState(g, mx, my, delta);

		int top = py + 70, bottom = py + ph - 10;
		if (all.isEmpty()) {
			int ty = top;
			for (var line : font.split(Ui.tr("slashclient-hud.skyAtlas.empty"), pw - 24)) {
				g.text(font, line, x, ty, Ui.MUTED, false);
				ty += 10;
			}
			Ui.end();
			return;
		}
		// the species
		List<SkyAtlas.Fish> rows = shown();
		if (chosen == null && !rows.isEmpty()) chosen = rows.get(0).name;
		maxScroll = Math.max(0, rows.size() * ROW_H - (bottom - top));
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		listX = x + LIST_W;
		g.enableScissor(x, top, x + LIST_W, bottom);
		Ui.beginClip("skyatlas list", x, top, LIST_W, bottom - top);
		for (int i = 0; i < rows.size(); i++) {
			SkyAtlas.Fish f = rows.get(i);
			int ry = top + i * ROW_H - scroll;
			if (ry + ROW_H < top || ry > bottom) continue;
			boolean on = f.name.equals(chosen), over = Ui.inside(mx, my, x, ry, LIST_W - 6, ROW_H - 1) && my >= top && my < bottom;
			if (on || over) Ui.round(g, x, ry, LIST_W - 6, ROW_H - 1, 3, on ? 0x403B82F6 : 0x18FFFFFF);
			// the fish's own look from SkyUp's pack, when one was seen
			var look = SkyAtlas.look(f);
			if (look != null && !look.isEmpty()) g.item(look, x + 2, ry);
			else Ui.icon(g, Items.COD, "spark", x + 2, ry);
			// not caught yet: the fish in shadow
			if (f.caught <= 0) g.fill(x + 2, ry, x + 18, ry + 16, 0xB0141821);
			Component count = Ui.text(f.caught > 0 ? "×" + f.caught : "—");
			int cw = Ui.width(count);
			Ui.draw(g, Ui.fit(Ui.text(f.name), LIST_W - 30 - cw), x + 21, ry + 4, f.caught > 0 ? Ui.TEXT : Ui.MUTED);
			Ui.draw(g, count, x + LIST_W - 10 - cw, ry + 4, f.caught > 0 ? Ui.ACCENT_LIGHT : Ui.MUTED);
			if (ry >= top && ry + ROW_H <= bottom) hits.add(new Hit(x, ry, LIST_W - 6, ROW_H - 1, () -> chosen = f.name));
		}
		Ui.end();
		g.disableScissor();
		bar.draw(g, x + LIST_W - 3, top, bottom - top, scroll, maxScroll, mx, my);

		// the chosen one
		SkyAtlas.Fish f = all.stream().filter(a -> a.name.equals(chosen)).findFirst().orElse(null);
		int dx = x + LIST_W + 10, dw = px + pw - 12 - dx, dy = py + 50;
		g.fill(dx - 6, dy, dx - 5, bottom, 0x30FFFFFF);
		if (f == null) {
			Ui.end();
			return;
		}
		var look = SkyAtlas.look(f);
		int nameX = dx;
		if (look != null && !look.isEmpty()) {
			g.item(look, dx, dy - 4);
			nameX += 20;
		}
		Ui.draw(g, Ui.fit(Ui.bold(f.name), dw - (nameX - dx)), nameX, dy, f.caught > 0 ? Ui.TEXT : Ui.MUTED);
		dy += 16;
		dy = line(g, "slashclient-hud.skyAtlas.count", String.valueOf(f.caught), dx, dy);
		if (f.known || f.caught > 0) {
			String record = f.recordGrams > 0 ? grams(f.recordGrams) + (f.recordSize.isEmpty() ? "" : " (" + f.recordSize + ")") : "—";
			dy = line(g, "slashclient-hud.skyAtlas.recordWeight", record, dx, dy);
			// the record against the species' highest weight
			if (f.maxGrams > 0) {
				float share = (float) Math.min(1, f.recordGrams / f.maxGrams);
				Ui.round(g, dx, dy, dw, 4, 2, 0x30FFFFFF);
				if (share > 0) Ui.round(g, dx, dy, Math.max(4, Math.round(dw * share)), 4, 2, Ui.ACCENT_LIGHT);
				dy += 9;
				dy = line(g, "slashclient-hud.skyAtlas.maxWeight", grams(f.maxGrams), dx, dy);
			}
			dy = line(g, "slashclient-hud.skyAtlas.recordPrice", f.recordPrice > 0 ? String.format(Locale.ROOT, "%.2f SC", f.recordPrice).replace('.', ',') : "—", dx, dy);
		}
		if (!f.fact.isEmpty()) {
			dy += 6;
			Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.fact"), dx, dy, Ui.MUTED);
			dy += 11;
			for (var l : font.split(Ui.text(f.fact), dw)) {
				if (dy > bottom - 9) break;
				g.text(font, l, dx, dy, Ui.TEXT_2, false);
				dy += 10;
			}
		} else if (!f.known && f.caught == 0) {
			dy += 6;
			for (var l : font.split(Ui.tr("slashclient-hud.skyAtlas.notCaught"), dw)) {
				g.text(font, l, dx, dy, Ui.MUTED, false);
				dy += 10;
			}
		}
		Ui.end();
	}

	private int line(GuiGraphicsExtractor g, String key, String value, int x, int y) {
		Component label = Ui.tr(key);
		Ui.draw(g, label, x, y, Ui.MUTED);
		Ui.draw(g, Ui.text(value), x + Ui.width(label) + 6, y, Ui.TEXT);
		return y + 12;
	}

	/** "2 450 g", or "45 kg" from a thousand grams up. */
	private static String grams(double g) {
		return g >= 1000 ? String.format(Locale.ROOT, "%.2f kg", g / 1000).replace('.', ',') : Math.round(g) + " g";
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the main menu's panorama, or the game dimmed behind
		if (minecraft.level == null) extractPanorama(g, delta);
		g.fill(0, 0, width, height, minecraft.level == null ? 0x800A0D14 : 0x90000000);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT && bar.press(e.x(), e.y())) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
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
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
		if (bar.dragging()) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
		return super.mouseDragged(e, dx, dy);
	}

	@Override
	public boolean mouseReleased(MouseButtonEvent e) {
		bar.release();
		return super.mouseReleased(e);
	}

	@Override
	public boolean mouseScrolled(double x, double y, double h, double v) {
		if (x < listX) scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * ROW_H)));
		return true;
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	// ---------- for the in-game test ----------

	void choose(String name, String filter) {
		chosen = name;
		this.filter = filter;
	}
}
//#endif
