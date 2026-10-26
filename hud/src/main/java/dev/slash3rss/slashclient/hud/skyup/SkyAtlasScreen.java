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
 *
 * It moves: the cards are dealt face down onto each page (from the side the page turns to) and
 * turned over as they land; a species caught since the album was last looked at is turned over slowly,
 * with sparkles and "New species!". A card under the mouse lifts, tilts toward it and its fish sways; a
 * starred card shimmers gold with a holographic gleam sweeping across it; bubbles rise behind the cards;
 * a card opened grows from where it lay into the species' view while its catches slide in.
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
	/** When the cards on show were dealt, from which side (1: from the right), and what was shown then. */
	private long dealtAt;
	private int dealFrom = 1;
	private String dealt;
	/** When a card was opened and where it lay, so it grows from there. */
	private long openedAt;
	private int openX, openY;
	/** Off for the in-game test, so its screenshots are not caught mid-move. */
	static boolean still;
	/** When each new species' card is turned over (it waits face down until then). */
	private final java.util.Map<String, Long> reveals = new java.util.HashMap<>();

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
		// another page, filter or search: the cards are dealt again
		String showing = page + "|" + filter + "|" + search.getValue();
		if (!showing.equals(dealt)) {
			int before = dealt == null ? -1 : Integer.parseInt(dealt.substring(0, dealt.indexOf('|')));
			dealFrom = page < before ? -1 : 1;
			dealt = showing;
			dealtAt = now();
		}
		bubbles(g, px + 12, top, inner, bottom);
		var pose = g.pose();
		for (int i = 0; i < per && page * per + i < cards.size(); i++) {
			SkyAtlas.Fish f = cards.get(page * per + i);
			int cx = left + (i % cols) * (CARD_W + GAP), cy = top + (i / cols) * (CARD_H + GAP);
			boolean over = Ui.inside(mx, my, cx, cy, CARD_W, CARD_H);
			// dealt one after another, face down, sliding in and dropping a little, turned over as it lands
			long dealtHere = dealtAt + i * 35L;
			float t = progress(dealtHere, 420);
			if (t <= 0) continue;
			// a new species waits face down a moment longer, then turns over slowly
			long reveal = revealAt(f, dealtHere + 520);
			float flip = reveal > 0 ? progress(reveal, 750) : t;
			double angle = (1 - smooth(flip)) * Math.PI;
			float across = (float) Math.abs(Math.cos(angle));
			boolean back = angle > Math.PI / 2;
			float lift = Ui.hover("skyatlas:card:" + f.name, over && !back);
			float grow = (1 + 0.05f * lift) * (reveal > 0 && flip < 1 ? 1 + (float) Math.sin(flip * Math.PI) * 0.15f : 1);
			pose.pushMatrix();
			pose.translate(cx + CARD_W / 2f + (1 - smooth(t)) * 26 * dealFrom, cy + CARD_H / 2f - lift * 2 - (1 - smooth(t)) * 10);
			pose.scale(across * grow, grow);
			// under the mouse it tilts toward it: the side nearer the mouse comes up
			if (lift > 0) {
				float toward = Math.max(-1, Math.min(1, (mx - (cx + CARD_W / 2f)) / (CARD_W / 2f)));
				pose.mul(new org.joml.Matrix3x2f(1 - Math.abs(toward) * 0.04f * lift, -toward * 0.06f * lift, 0, 1, 0, 0));
			}
			pose.translate(-CARD_W / 2f, -CARD_H / 2f);
			if (back) cardBack(g, 0, 0, CARD_W, CARD_H);
			else card(g, f, 0, 0, CARD_W, CARD_H, over, 2, lift);
			pose.popMatrix();
			if (reveal > 0) {
				sparkles(g, cx + CARD_W / 2f, cy + CARD_H / 2f, reveal);
				// once the sparkles are over it stays face up for good
				if (now() - reveal > 1700) SkyAtlas.revealed(f);
			}
			hits.add(new Hit(cx, cy, CARD_W, CARD_H, () -> {
				open = f.name;
				scroll = 0;
				openX = cx;
				openY = cy;
				openedAt = now();
			}));
		}
	}

	// ---------- moving ----------

	/** When a newly caught species' card turns over (0: it is not new, it lies face up). */
	private long revealAt(SkyAtlas.Fish f, long after) {
		if (still || f.caught <= 0 || f.revealed) return 0;
		return reveals.computeIfAbsent(f.name, k -> after);
	}

	/** A card face down: SkyUp blue with a frame, a pattern of waves and a fishing rod. */
	private void cardBack(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		Ui.round(g, x, y, w, h, 5, 0xFF3B82F6);
		Ui.round(g, x + 1, y + 1, w - 2, h - 2, 4, 0xFF13204A);
		g.fillGradient(x + 2, y + 2, x + w - 2, y + h - 2, 0x2060A5FA, 0x00000000);
		Ui.roundOutline(g, x + 4, y + 4, w - 8, h - 8, 3, 0x5060A5FA);
		// the waves: rows of short dashes going up and down
		for (int row = 0; row < 6; row++) {
			int wy = y + 12 + row * 12;
			for (int k = 0; k < (w - 14) / 4; k++) {
				int dy = (int) Math.round(Math.sin((k + row) * 0.9) * 1.5);
				g.fill(x + 7 + k * 4, wy + dy, x + 9 + k * 4, wy + dy + 1, 0x3093C5FD);
			}
		}
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + w / 2f - 12, y + h / 2f - 12);
		pose.scale(1.5f, 1.5f);
		g.item(new ItemStack(Items.FISHING_ROD), 0, 0);
		pose.popMatrix();
	}

	/** A new species' sparkles: gold stars flying out of the card as it turns, and "New species!" above it. */
	private void sparkles(GuiGraphicsExtractor g, float cx, float cy, long reveal) {
		long e = now() - reveal - 300;
		if (e < 0 || e > 1400) return;
		float p = e / 1400f, fade = 1 - p * p;
		int alpha = Math.round(fade * 255);
		for (int k = 0; k < 12; k++) {
			double a = k * Math.PI * 2 / 12 + 0.25;
			float r = 18 + smooth(Math.min(1, p * 1.6f)) * (34 + (k % 3) * 8);
			int sx = Math.round(cx + (float) Math.cos(a) * r), sy = Math.round(cy + (float) Math.sin(a) * r * 1.2f);
			int arm = k % 2 == 0 ? 2 : 1, color = (alpha << 24) | (k % 3 == 0 ? 0xFFFFFF : 0xFACC15);
			g.fill(sx - arm, sy, sx + arm + 1, sy + 1, color);
			g.fill(sx, sy - arm, sx + 1, sy + arm + 1, color);
		}
		// a gold tag on the card's top edge, rising a little as it fades
		if (alpha > 8) {
			Component label = Ui.trBold("slashclient-hud.skyAtlas.new");
			int lw = Ui.width(label), ly = Math.round(cy - CARD_H / 2f - 5 - p * 3);
			Ui.round(g, Math.round(cx) - lw / 2 - 4, ly - 2, lw + 8, 12, 4, (alpha << 24) | 0xFACC15);
			Ui.centered(g, label, Math.round(cx), ly, (alpha << 24) | 0x1F2937);
		}
	}

	/** Bubbles rising slowly behind the cards, each swaying, the whole page a fish tank. */
	private void bubbles(GuiGraphicsExtractor g, int x, int top, int w, int bottom) {
		if (still) return;
		long t = now();
		for (int k = 0; k < 16; k++) {
			int period = 7000 + (k * 1373) % 5000;
			float p = ((t + k * 977L) % period) / (float) period;
			float bx = x + ((k * 7919) % Math.max(1, w)) + (float) Math.sin(t / 700.0 + k) * 4;
			float by = bottom - p * (bottom - top + 10);
			int size = 2 + k % 3, alpha = Math.round((float) Math.sin(p * Math.PI) * 0x38);
			Ui.roundOutline(g, Math.round(bx), Math.round(by), size + 2, size + 2, (size + 2) / 2, (alpha << 24) | 0x93C5FD);
		}
	}

	private static long now() {
		return net.minecraft.util.Util.getMillis();
	}

	/** 0 → 1 over the time from the start (1 at once in the test). */
	private static float progress(long start, int millis) {
		if (still) return 1;
		return Math.max(0, Math.min(1, (now() - start) / (float) millis));
	}

	private static float smooth(float t) {
		float u = 1 - t;
		return 1 - u * u * u;
	}

	/** Out a touch past its size and back, as a card put down. */
	private static float backOut(float t) {
		if (t <= 0) return 0;
		float c = 1.6f, u = t - 1;
		return 1 + (c + 1) * u * u * u + c * u * u;
	}

	/** A card: the fish (dark with "?" when not caught), its name, how many, a star for a great record; `lift` 0–1 under the mouse. */
	private void card(GuiGraphicsExtractor g, SkyAtlas.Fish f, int x, int y, int w, int h, boolean over, int scale, float lift) {
		boolean has = f.caught > 0, star = has && f.maxGrams > 0 && f.recordGrams >= f.maxGrams * STAR;
		// a starred card's edge shimmers, brighter and paler in turn
		float shine = still ? 0 : (float) (Math.sin(now() / 320.0) + 1) / 2;
		int edge = !has ? 0x30FFFFFF : star ? Ui.blend(GOLD, 0xFFFFF4B8, shine * 0.7f) : Ui.blend(0x8060A5FA, Ui.ACCENT_LIGHT, lift);
		if (lift > 0 && has) Ui.round(g, x - 1, y - 1, w + 2, h + 2, 6, Ui.blend(0x00000000, star ? 0x40FACC15 : 0x4060A5FA, lift));
		Ui.round(g, x, y, w, h, 5, edge);
		Ui.round(g, x + 1, y + 1, w - 2, h - 2, 4, has ? 0xFF16213A : 0xFF0E1117);
		if (lift > 0) Ui.round(g, x + 1, y + 1, w - 2, h - 2, 4, Ui.blend(0x00FFFFFF, 0x14FFFFFF, lift));
		if (star && !still) gleam(g, f, x, y, w, h, lift);
		// the picture straight on the card
		int size = 16 * scale, ix = x + (w - size) / 2, iy = y + 8;
		// not caught yet: SkyUp's own grey picture when its pack is on, else the fish in shadow
		ItemStack grey = has ? null : SkyAtlas.hidden(f), look = grey != null ? grey : SkyAtlas.look(f);
		var pose = g.pose();
		pose.pushMatrix();
		// a caught fish under the mouse sways as if it still swam
		float sway = has && !still ? (float) Math.sin(now() / 170.0) * 0.12f * lift : 0;
		pose.translate(ix + size / 2f, iy + size / 2f);
		pose.rotate(sway);
		pose.translate(-size / 2f, -size / 2f);
		pose.scale(scale, scale);
		g.item(look != null && !look.isEmpty() ? look : new ItemStack(Items.COD), 0, 0);
		pose.popMatrix();
		if (!has && grey == null) {
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

	/**
	 * A holographic gleam: a slanted band of light sweeping across a starred card every few seconds
	 * (each card at its own moment; under the mouse it follows the mouse instead), its edges in rainbow.
	 */
	private void gleam(GuiGraphicsExtractor g, SkyAtlas.Fish f, int x, int y, int w, int h, float lift) {
		int cycle = 3600;
		float p = ((now() + (f.name.hashCode() & 0xFFFF)) % cycle) / (float) cycle;
		if (p > 0.45f && lift <= 0) return;
		float travel = lift > 0 ? 0.5f + (float) Math.sin(now() / 500.0) * 0.5f : p / 0.45f;
		float band = -24 + travel * (w + 48);
		int[] rainbow = { 0x30F472B6, 0x30FACC15, 0x3034D399, 0x3060A5FA };
		for (int row = 2; row < h - 2; row++) {
			float left = band + (h - row) * 0.4f;
			int a = Math.max(x + 2, Math.round(x + left)), b = Math.min(x + w - 2, Math.round(x + left + 10));
			if (a < b) g.fill(a, y + row, b, y + row + 1, 0x24FFF8DC);
			int edge = Math.round(x + left - 2);
			if (edge >= x + 2 && edge < x + w - 2) g.fill(edge, y + row, edge + 2, y + row + 1, rainbow[(row / 6) % rainbow.length]);
		}
	}

	/** A species' name; not caught yet, scrambled as SkyUp's own window shows it. */
	private static Component name(SkyAtlas.Fish f) {
		return f.caught > 0 ? Ui.text(f.name) : Ui.text(f.name).withStyle(s -> s.withObfuscated(true));
	}

	// ---------- one species ----------

	private void species(GuiGraphicsExtractor g, SkyAtlas.Fish f, int mx, int my) {
		int x = px + 12, top = py + 32, bottom = py + ph - 10, side = 150;
		// its card, bigger, grown from where it lay in the album; the records under it
		float grow = smooth(progress(openedAt, 280)), appear = smooth(progress(openedAt + 120, 260));
		int cardX = x + (side - 96) / 2;
		var pose = g.pose();
		pose.pushMatrix();
		float fromScale = CARD_W / 96f, s = fromScale + (1 - fromScale) * grow;
		pose.translate(openX + (cardX - openX) * grow, openY + (top - openY) * grow);
		pose.scale(s, s);
		card(g, f, 0, 0, 96, 124, false, 3, 0);
		pose.popMatrix();
		// the records and the list come in after it
		pose.pushMatrix();
		pose.translate(0, (1 - appear) * 10);
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
			pose.popMatrix();
			return;
		}
		pose.popMatrix();
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
			// the rows slide in from the right one after another
			float in = smooth(progress(openedAt + 150 + Math.min(i, 20) * 25L, 220));
			pose.pushMatrix();
			pose.translate((1 - in) * 30, 0);
			if (i % 2 == 1) g.fill(lx - 2, ry - 2, lx + lw, ry + ROW_H - 2, 0x0AFFFFFF);
			int color = c.grams() > 0 && c.grams() == best ? GOLD : Ui.TEXT_2;
			Ui.draw(g, Ui.text(WHEN.format(Instant.ofEpochMilli(c.at()))), cWhen, ry, Ui.MUTED);
			Ui.draw(g, Ui.text(c.grams() > 0 ? grams(c.grams()) : "—"), cWeight, ry, color);
			Ui.draw(g, Ui.fit(Ui.text(c.size().isEmpty() ? "—" : c.size()), 60), cSize, ry, color);
			if (lw > 260) Ui.draw(g, Ui.fit(Ui.text(c.quality().isEmpty() ? "—" : c.quality()), cPrice - cQuality - 50), cQuality, ry, color);
			Component price = Ui.text(c.price() > 0 ? money(c.price()) : "—");
			Ui.draw(g, price, cPrice - Ui.width(price), ry, color);
			pose.popMatrix();
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
