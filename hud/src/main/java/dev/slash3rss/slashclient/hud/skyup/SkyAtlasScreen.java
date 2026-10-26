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
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * The fish atlas as a collector's album: a card for every SkyUp species, page by page (caught ones
 * with the fish as SkyUp draws it and how many, a gold star for a record close to the species' highest
 * weight; the rest dark with a question mark), with a filter (all, caught, missing) and a search. A
 * card clicked opens its species: the records and fun fact beside the list of every fish of it caught
 * (when, weight, size, quality, price), the record one in gold (SkyAtlas).
 */
public class SkyAtlasScreen extends Screen {
	private static final int CARD_W = 62, CARD_H = 84, GAP = 6, ROW_H = 13;
	private static final String[] FILTERS = { "all", "caught", "missing" };
	private static final int GOLD = 0xFFFACC15;
	/** A record this close to the species' highest weight earns its card a star. */
	private static final double STAR = 0.8;
	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("dd.MM HH:mm").withZone(ZoneId.systemDefault());

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final Scrollbar bar = new Scrollbar();
	private EditBox search;
	private String filter = "all";
	/** The species open (null: the album). */
	private String open;
	private int page, pages, scroll, maxScroll, px, py, pw, ph;

	public SkyAtlasScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.skyAtlas.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 16, 560);
		ph = Math.min(height - 16, 360);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		String before = search == null ? "" : search.getValue();
		search = new EditBox(font, px + 12 + 14, py + 32, 130, 14, Ui.tr("slashclient-hud.skyAtlas.search"));
		search.setHint(Ui.tr("slashclient-hud.skyAtlas.search"));
		search.setMaxLength(40);
		search.setValue(before);
		search.setResponder(v -> page = 0);
		search.visible = open == null;
		addRenderableWidget(search);
	}

	private List<SkyAtlas.Fish> shown() {
		String q = search == null ? "" : SkyAtlas.key(search.getValue());
		List<SkyAtlas.Fish> out = new ArrayList<>();
		for (SkyAtlas.Fish f : SkyAtlas.all()) {
			if ("caught".equals(filter) && f.caught <= 0) continue;
			if ("missing".equals(filter) && f.caught > 0) continue;
			// the search finds caught ones only: the rest have no name to show yet
			if (!q.isEmpty() && (f.caught <= 0 || !SkyAtlas.key(f.name).contains(q))) continue;
			out.add(f);
		}
		return out;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		bar.hide();
		search.visible = open == null;
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("skyatlas", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		List<SkyAtlas.Fish> all = SkyAtlas.all();
		long caught = all.stream().filter(f -> f.caught > 0).count();
		Component title = Ui.trBold("slashclient-hud.skyAtlas.title");
		Ui.draw(g, title, x, y, Ui.TEXT);
		Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.caught", caught, all.size()), x + Ui.width(title) + 8, y, Ui.MUTED);
		int bx = px + pw - 24;
		Ui.button(g, "skyatlas:close", bx, y - 4, 16, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(bx, y - 4, 16, 15, this::onClose));
		SkyAtlas.Fish chosen = open == null ? null : all.stream().filter(f -> f.name.equals(open)).findFirst().orElse(null);
		if (chosen != null) {
			Component back = Ui.tr("slashclient-hud.skyAtlas.back");
			int w = Ui.buttonWidth(back, "back", 15, 2);
			bx -= w + 4;
			Ui.button(g, "skyatlas:back", bx, y - 4, w, 15, "back", back, false, mx, my);
			hits.add(new Hit(bx, y - 4, w, 15, () -> open = null));
			super.extractRenderState(g, mx, my, delta);
			species(g, chosen, mx, my);
			Ui.end();
			return;
		}
		// the filter: all, caught, missing
		for (int i = FILTERS.length - 1; i >= 0; i--) {
			String f = FILTERS[i];
			Component label = Ui.tr("slashclient-hud.skyAtlas.filter." + f);
			int w = Ui.buttonWidth(label, null, 15, 2);
			bx -= w + 4;
			Ui.button(g, "skyatlas:filter:" + f, bx, y - 4, w, 15, label, f.equals(filter), mx, my);
			hits.add(new Hit(bx, y - 4, w, 15, () -> {
				filter = f;
				page = 0;
			}));
		}
		Ui.icon(g, "search", x, py + 34, 10, Ui.MUTED);
		super.extractRenderState(g, mx, my, delta);
		if (all.isEmpty()) {
			int ty = py + 56;
			for (var line : font.split(Ui.tr("slashclient-hud.skyAtlas.empty"), pw - 24)) {
				g.text(font, line, x, ty, Ui.MUTED, false);
				ty += 10;
			}
			Ui.end();
			return;
		}
		album(g, shown(), mx, my);
		Ui.end();
	}

	// ---------- the album ----------

	private void album(GuiGraphicsExtractor g, List<SkyAtlas.Fish> cards, int mx, int my) {
		int top = py + 54, bottom = py + ph - 10, inner = pw - 24;
		int cols = Math.max(1, (inner + GAP) / (CARD_W + GAP)), rows = Math.max(1, (bottom - top + GAP) / (CARD_H + GAP));
		int per = cols * rows;
		pages = Math.max(1, (cards.size() + per - 1) / per);
		page = Math.max(0, Math.min(pages - 1, page));
		// the page and its arrows, on the search's row
		int ay = py + 31;
		Component label = Ui.tr("slashclient-hud.skyAtlas.page", page + 1, pages);
		int right = px + pw - 12, lw = Ui.width(label);
		Ui.button(g, "skyatlas:next", right - 16, ay, 16, 15, "arrow", Component.empty(), false, mx, my);
		hits.add(new Hit(right - 16, ay, 16, 15, () -> page = Math.min(pages - 1, page + 1)));
		Ui.draw(g, label, right - 22 - lw, ay + 4, Ui.MUTED);
		Ui.button(g, "skyatlas:prev", right - 44 - lw, ay, 16, 15, "back", Component.empty(), false, mx, my);
		hits.add(new Hit(right - 44 - lw, ay, 16, 15, () -> page = Math.max(0, page - 1)));
		int left = px + 12 + (inner - (cols * (CARD_W + GAP) - GAP)) / 2;
		for (int i = 0; i < per && page * per + i < cards.size(); i++) {
			SkyAtlas.Fish f = cards.get(page * per + i);
			int cx = left + (i % cols) * (CARD_W + GAP), cy = top + (i / cols) * (CARD_H + GAP);
			boolean over = Ui.inside(mx, my, cx, cy, CARD_W, CARD_H);
			card(g, f, cx, cy, CARD_W, CARD_H, over, 2);
			hits.add(new Hit(cx, cy, CARD_W, CARD_H, () -> {
				open = f.name;
				scroll = 0;
			}));
		}
	}

	/** A card: the fish (dark with "?" when not caught), its name, how many, a star for a great record. */
	private void card(GuiGraphicsExtractor g, SkyAtlas.Fish f, int x, int y, int w, int h, boolean over, int scale) {
		boolean has = f.caught > 0, star = has && f.maxGrams > 0 && f.recordGrams >= f.maxGrams * STAR;
		int edge = !has ? 0x30FFFFFF : star ? GOLD : over ? Ui.ACCENT_LIGHT : 0x8060A5FA;
		Ui.round(g, x, y, w, h, 5, edge);
		Ui.round(g, x + 1, y + 1, w - 2, h - 2, 4, has ? 0xFF16213A : 0xFF0E1117);
		if (over) Ui.round(g, x + 1, y + 1, w - 2, h - 2, 4, 0x14FFFFFF);
		// the picture's own window on the card
		int size = 16 * scale, ix = x + (w - size) / 2, iy = y + 8;
		g.fill(ix - 3, iy - 3, ix + size + 3, iy + size + 3, has ? 0x30000000 : 0x40000000);
		ItemStack look = SkyAtlas.look(f);
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(ix, iy);
		pose.scale(scale, scale);
		g.item(look != null && !look.isEmpty() ? look : new ItemStack(Items.COD), 0, 0);
		pose.popMatrix();
		if (!has) {
			// not caught yet: a shadow and a question mark
			g.fill(ix - 3, iy - 3, ix + size + 3, iy + size + 3, 0xE00E1117);
			Ui.centered(g, Ui.bold("?"), x + w / 2, iy + size / 2 - 4, 0xFF9CA3AF);
		}
		// the name, on up to two lines; not caught yet, scrambled as SkyUp shows it
		int ty = iy + size + 7;
		var lines = font.split(name(f), w - 6);
		for (int i = 0; i < Math.min(2, lines.size()); i++) {
			int lw = font.width(lines.get(i));
			g.text(font, lines.get(i), x + (w - lw) / 2, ty + i * 9, has ? Ui.TEXT : Ui.MUTED, false);
		}
		Component count = Ui.text(has ? "×" + f.caught : "—");
		Ui.draw(g, count, x + w - 5 - Ui.width(count), y + h - 12, has ? Ui.ACCENT_LIGHT : 0xFF4B5563);
		if (star) Ui.draw(g, Ui.text("★"), x + 5, y + h - 12, GOLD);
	}

	/** A species' name; not caught yet, scrambled as SkyUp's own window shows it. */
	private static Component name(SkyAtlas.Fish f) {
		return f.caught > 0 ? Ui.text(f.name) : Ui.text(f.name).withStyle(s -> s.withObfuscated(true));
	}

	// ---------- one species ----------

	private void species(GuiGraphicsExtractor g, SkyAtlas.Fish f, int mx, int my) {
		int x = px + 12, top = py + 32, bottom = py + ph - 10, side = 150;
		// its card, bigger, and the records under it
		card(g, f, x + (side - 96) / 2, top, 96, 124, false, 3);
		int y = top + 132;
		y = line(g, "slashclient-hud.skyAtlas.count", String.valueOf(f.caught), x, y);
		if (f.known || f.caught > 0) {
			y = line(g, "slashclient-hud.skyAtlas.recordWeight", f.recordGrams > 0 ? grams(f.recordGrams) + (f.recordSize.isEmpty() ? "" : " (" + f.recordSize + ")") : "—", x, y);
			if (f.maxGrams > 0) {
				float share = (float) Math.min(1, f.recordGrams / f.maxGrams);
				Ui.round(g, x, y, side, 4, 2, 0x30FFFFFF);
				if (share > 0) Ui.round(g, x, y, Math.max(4, Math.round(side * share)), 4, 2, share >= STAR ? GOLD : Ui.ACCENT_LIGHT);
				y += 9;
				y = line(g, "slashclient-hud.skyAtlas.maxWeight", grams(f.maxGrams), x, y);
			}
			y = line(g, "slashclient-hud.skyAtlas.recordPrice", f.recordPrice > 0 ? money(f.recordPrice) : "—", x, y);
		}
		if (!f.fact.isEmpty()) {
			y += 4;
			for (var l : font.split(Ui.text(f.fact), side)) {
				if (y > bottom - 9) break;
				g.text(font, l, x, y, Ui.TEXT_2, false);
				y += 10;
			}
		}
		// every fish of it caught
		int lx = x + side + 14, lw = px + pw - 12 - lx - 6;
		g.fill(lx - 8, top, lx - 7, bottom, 0x30FFFFFF);
		List<SkyAtlas.Catch> list = new ArrayList<>(f.catches());
		Ui.draw(g, Ui.trBold("slashclient-hud.skyAtlas.catches", list.size()), lx, top, Ui.TEXT);
		int listTop = top + 26;
		int cWhen = lx, cWeight = lx + 62, cSize = lx + 132, cQuality = lx + 196, cPrice = lx + lw;
		Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.col.when"), cWhen, top + 13, Ui.MUTED);
		Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.col.weight"), cWeight, top + 13, Ui.MUTED);
		Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.col.size"), cSize, top + 13, Ui.MUTED);
		if (lw > 260) Ui.draw(g, Ui.tr("slashclient-hud.skyAtlas.col.quality"), cQuality, top + 13, Ui.MUTED);
		Component priceHead = Ui.tr("slashclient-hud.skyAtlas.col.price");
		Ui.draw(g, priceHead, cPrice - Ui.width(priceHead), top + 13, Ui.MUTED);
		if (list.isEmpty()) {
			int ty = listTop + 4;
			for (var l : font.split(Ui.tr("slashclient-hud.skyAtlas.noCatches"), lw)) {
				g.text(font, l, lx, ty, Ui.MUTED, false);
				ty += 10;
			}
			return;
		}
		// newest first; the heaviest in gold
		list.sort(Comparator.comparingLong(SkyAtlas.Catch::at).reversed());
		double best = list.stream().mapToDouble(SkyAtlas.Catch::grams).max().orElse(0);
		maxScroll = Math.max(0, list.size() * ROW_H - (bottom - listTop));
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(lx - 2, listTop - 2, lx + lw + 6, bottom);
		Ui.beginClip("skyatlas catches", lx - 2, listTop - 2, lw + 8, bottom - listTop + 2);
		for (int i = 0; i < list.size(); i++) {
			SkyAtlas.Catch c = list.get(i);
			int ry = listTop + i * ROW_H - scroll;
			if (ry + ROW_H < listTop || ry > bottom) continue;
			if (i % 2 == 1) g.fill(lx - 2, ry - 2, lx + lw, ry + ROW_H - 2, 0x0AFFFFFF);
			int color = c.grams() > 0 && c.grams() == best ? GOLD : Ui.TEXT_2;
			Ui.draw(g, Ui.text(WHEN.format(Instant.ofEpochMilli(c.at()))), cWhen, ry, Ui.MUTED);
			Ui.draw(g, Ui.text(c.grams() > 0 ? grams(c.grams()) : "—"), cWeight, ry, color);
			Ui.draw(g, Ui.fit(Ui.text(c.size().isEmpty() ? "—" : c.size()), 60), cSize, ry, color);
			if (lw > 260) Ui.draw(g, Ui.fit(Ui.text(c.quality().isEmpty() ? "—" : c.quality()), cPrice - cQuality - 50), cQuality, ry, color);
			Component price = Ui.text(c.price() > 0 ? money(c.price()) : "—");
			Ui.draw(g, price, cPrice - Ui.width(price), ry, color);
		}
		Ui.end();
		g.disableScissor();
		bar.draw(g, lx + lw + 3, listTop, bottom - listTop, scroll, maxScroll, mx, my);
	}

	private int line(GuiGraphicsExtractor g, String key, String value, int x, int y) {
		Component label = Ui.tr(key);
		Ui.draw(g, label, x, y, Ui.MUTED);
		Ui.draw(g, Ui.text(value), x + Ui.width(label) + 5, y, Ui.TEXT);
		return y + 12;
	}

	/** "2 450 g", or "2,45 kg" from a thousand grams up. */
	private static String grams(double g) {
		return g >= 1000 ? String.format(Locale.ROOT, "%.2f kg", g / 1000).replace('.', ',') : Math.round(g) + " g";
	}

	private static String money(double sc) {
		return String.format(Locale.ROOT, "%.2f SC", sc).replace('.', ',');
	}

	// ---------- input ----------

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the main menu's panorama, or the game dimmed behind
		if (minecraft.level == null) extractPanorama(g, delta);
		g.fill(0, 0, width, height, minecraft.level == null ? 0x800A0D14 : 0x90000000);
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT && open != null && bar.press(e.x(), e.y())) {
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
		// the album turns its pages; a species' list scrolls
		if (open == null) page = Math.max(0, Math.min(pages - 1, page - (int) Math.signum(v)));
		else scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * ROW_H * 2)));
		return true;
	}

	@Override
	public boolean keyPressed(net.minecraft.client.input.KeyEvent e) {
		// Esc in a species goes back to the album
		if (open != null && e.key() == InputConstants.KEY_ESCAPE) {
			open = null;
			return true;
		}
		return super.keyPressed(e);
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

	/** The album (null) or a species open. */
	void choose(String species, String filter) {
		open = species;
		this.filter = filter;
	}
}
//#endif
