package dev.slash3rss.slashclient.hud.wiki;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Scrollbar;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ConfirmLinkScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.KeyEvent;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;

import java.net.URI;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * A wiki in the game (the SkyUp.pl wiki, minecraft.wiki): the articles by category (or the search's hits) on the
 * left, the article on the right with its headings, lists, tables and pictures, links to other articles (followed
 * here, "back" returns) and out of the wiki (opened in the browser after asking). It reads through the launcher
 * (WikiSource); the article opened last opens again, where it was left.
 */
public class WikiScreen extends Screen {
	private static final int ROW_H = 14, HIT_H = 24, LINE_H = 10, PAD = 12;
	private static final int CODE = 0xFFFBBF24, LINE = 0x30FFFFFF;

	private record Hit(int x, int y, int w, int h, Runnable action) {}
	/** Something the article draws: text, a picture, or a filled rectangle (y from the article's top). */
	private record Op(int x, int y, int w, int h, Component text, int color, String picture, Runnable link) {}
	/** One row of the list: a category's name (no slug) or an article, or a search's hit. */
	private record Row(String label, String slug, String anchor, String note) {}

	private final WikiSource source;
	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private final Scrollbar listBar = new Scrollbar(), articleBar = new Scrollbar();
	private EditBox search;
	private List<WikiSource.Category> categories = List.of();
	private List<WikiSource.Hit> found;
	private String searched = "";
	private long searchAt;
	private WikiSource.Article article;
	/** Where to go once the article is laid out (a link to a place on it). */
	private String pendingAnchor;
	private final Deque<String> back = new ArrayDeque<>();
	/** What is wrong (an error's key or text), or null; loading shows "…". */
	private String problem;
	private boolean loadingIndex = true, loadingArticle;
	private int listScroll, listMax, scroll, maxScroll;
	private int px, py, pw, ph, ax, ay, aw, ah;
	/** The list's width: narrower in a small window, so the article keeps room. */
	private int listW;
	/** The article laid out for a width and the pictures loaded then. */
	private List<Op> ops = List.of();
	private final Map<String, Integer> anchors = new HashMap<>();
	private int laidWidth = -1, laidPictures = -1, contentH;

	public WikiScreen(WikiSource source, Screen parent) {
		super(Component.translatable(source.texts() + ".title"));
		this.source = source;
		this.parent = parent;
	}

	/** The window opened on an article (the thing in the player's hand, say), not where it was left. */
	public WikiScreen(WikiSource source, Screen parent, String slug) {
		this(source, parent);
		open(slug, null, false, 0);
	}

	/** One of the window's texts (the wiki's own: "Szukaj w wiki", "Wiki SkyUp"). */
	private Component tr(String name, Object... args) {
		return Ui.tr(source.texts() + "." + name, args);
	}

	@Override
	protected void init() {
		pw = Math.min(width - 16, 620);
		ph = Math.min(height - 16, 380);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		listW = Math.max(100, Math.min(150, pw * 3 / 10));
		String before = search == null ? "" : search.getValue();
		search = new EditBox(font, px + PAD + 14, py + 30, listW - 16, 14, tr("search"));
		search.setHint(tr("search"));
		search.setMaxLength(100);
		search.setValue(before);
		search.setResponder(v -> searchAt = System.currentTimeMillis() + 400);
		addRenderableWidget(search);
		laidWidth = -1;
		source.index(a -> {
			loadingIndex = false;
			if (a.value() != null) categories = a.value();
			else problem = a.error();
		});
		// where the player left off, or the wiki's own start page
		String first = source.lastSlug != null ? source.lastSlug : source.start();
		if (article == null && !loadingArticle && first != null) open(first, null, false, source.lastSlug != null ? source.lastScroll : 0);
		else if (article == null && !loadingArticle) loadingIndex = loadingIndex && categories.isEmpty();
	}

	/** Opens an article (and a place on it); `remember` puts the one shown now on the way back. */
	public void open(String slug, String anchor, boolean remember, int at) {
		if (slug == null || slug.isEmpty()) {
			if (anchor != null) jump(anchor);
			return;
		}
		if (article != null && slug.equals(article.slug())) {
			if (anchor != null) jump(anchor);
			return;
		}
		if (remember && article != null) back.push(article.slug());
		loadingArticle = true;
		source.article(slug, a -> {
			loadingArticle = false;
			if (a.value() == null) {
				problem = a.error();
				return;
			}
			problem = null;
			article = a.value();
			laidWidth = -1;
			scroll = at;
			pendingAnchor = anchor;
			source.lastSlug = slug;
			// the list may name the article now (minecraft.wiki's articles read lately)
			source.index(i -> {
				if (i.value() != null) categories = i.value();
			});
		});
	}

	private void jump(String anchor) {
		Integer y = anchors.get(anchor);
		if (y != null) scroll = Math.max(0, Math.min(maxScroll, y - 4));
	}

	@Override
	public void tick() {
		// the search goes out a moment after typing stops
		if (searchAt > 0 && System.currentTimeMillis() >= searchAt) {
			searchAt = 0;
			String q = search.getValue().strip();
			if (q.length() < source.minSearch()) {
				found = null;
				searched = "";
			} else if (!q.equals(searched)) {
				searched = q;
				source.search(q, a -> {
					if (!q.equals(searched)) return;
					found = a.value() != null ? a.value() : List.of();
					listScroll = 0;
				});
			}
		}
	}

	// ---------- drawing ----------

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		listBar.hide();
		articleBar.hide();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("wiki", px, py, pw, ph);
		int x = px + PAD, y = py + 10;
		Ui.draw(g, Ui.trBold(source.texts() + ".title"), x, y, Ui.TEXT);
		// the buttons on the right: close, the browser, back, the wiki's language
		int bx = px + pw - 24;
		Ui.button(g, "wiki:close", bx, y - 4, 16, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(bx, y - 4, 16, 15, this::onClose));
		if (article != null && !article.url().isEmpty()) {
			Component browser = tr("browser");
			int w = Ui.buttonWidth(browser, "world", 15, 2);
			bx -= w + 4;
			Ui.button(g, "wiki:browser", bx, y - 4, w, 15, "world", browser, false, mx, my);
			String url = article.url();
			hits.add(new Hit(bx, y - 4, w, 15, () -> openUrl(url)));
		}
		String language = source.switchLabel();
		if (language != null) {
			Component label = Ui.text(language);
			int w = Ui.buttonWidth(label, "language", 15, 2);
			bx -= w + 4;
			Ui.button(g, "wiki:language", bx, y - 4, w, 15, "language", label, false, mx, my);
			hits.add(new Hit(bx, y - 4, w, 15, this::switchOver));
		}
		if (!back.isEmpty()) {
			Component label = tr("back");
			int w = Ui.buttonWidth(label, "back", 15, 2);
			bx -= w + 4;
			Ui.button(g, "wiki:back", bx, y - 4, w, 15, "back", label, false, mx, my);
			hits.add(new Hit(bx, y - 4, w, 15, () -> open(back.pop(), null, false, 0)));
		}
		Ui.icon(g, "search", x, py + 32, 10, Ui.MUTED);
		super.extractRenderState(g, mx, my, delta);
		drawList(g, mx, my);
		drawArticle(g, mx, my);
		Ui.end();
	}

	private List<Row> rows() {
		List<Row> out = new ArrayList<>();
		if (found != null) {
			for (WikiSource.Hit h : found) out.add(new Row(h.title(), h.slug(), h.anchor(), h.article().isEmpty() ? h.snippet() : h.article() + " · " + h.snippet()));
			return out;
		}
		for (WikiSource.Category c : categories) {
			if (!c.name().isEmpty()) out.add(new Row(c.name(), null, null, null));
			for (WikiSource.Ref r : c.articles()) out.add(new Row(r.title(), r.slug(), null, null));
		}
		return out;
	}

	private void drawList(GuiGraphicsExtractor g, int mx, int my) {
		int x = px + PAD, top = py + 50, bottom = py + ph - 10, w = listW;
		List<Row> rows = rows();
		int total = 0;
		for (Row r : rows) total += height(r);
		listMax = Math.max(0, total - (bottom - top));
		listScroll = Math.max(0, Math.min(listMax, listScroll));
		if (rows.isEmpty()) {
			String key = loadingIndex ? "loading" : found != null ? "noHits" : null;
			if (key != null) Ui.draw(g, tr(key), x, top + 2, Ui.MUTED);
			return;
		}
		g.enableScissor(x, top, x + w, bottom);
		Ui.beginClip("wiki list", x, top, w, bottom - top);
		int ry = top - listScroll;
		for (Row r : rows) {
			int h = height(r);
			if (ry + h >= top && ry <= bottom) {
				if (r.slug() == null && r.anchor() == null) {
					// a category's name
					Ui.draw(g, Ui.fit(Ui.bold(r.label()), w - 6), x + 2, ry + 4, Ui.MUTED);
				} else {
					boolean open = article != null && r.slug() != null && r.slug().equals(article.slug()) && found == null;
					boolean over = Ui.inside(mx, my, x, ry, w - 6, h - 1) && my >= top && my < bottom;
					if (open || over) Ui.round(g, x, ry, w - 6, h - 1, 3, open ? Ui.withAlpha(Ui.ACCENT, 0x40) : 0x18FFFFFF);
					Ui.draw(g, Ui.fit(Ui.text(r.label()), w - 14), x + 5, ry + 3, open ? Ui.TEXT : Ui.TEXT_2);
					if (r.note() != null) Ui.draw(g, Ui.fit(Ui.text(r.note()), w - 14), x + 5, ry + 13, Ui.MUTED);
					if (ry >= top && ry + h <= bottom) {
						String slug = r.slug(), anchor = r.anchor();
						hits.add(new Hit(x, ry, w - 6, h - 1, () -> open(slug, anchor, true, 0)));
					}
				}
			}
			ry += h;
		}
		Ui.end();
		g.disableScissor();
		listBar.draw(g, x + w - 3, top, bottom - top, listScroll, listMax, mx, my);
	}

	private static int height(Row r) {
		return r.note() != null ? HIT_H : ROW_H;
	}

	private void drawArticle(GuiGraphicsExtractor g, int mx, int my) {
		ax = px + PAD + listW + 10;
		ay = py + 30;
		aw = px + pw - PAD - 6 - ax;
		ah = py + ph - 10 - ay;
		g.fill(ax - 6, ay, ax - 5, ay + ah, LINE);
		if (problem != null || article == null || loadingArticle) {
			String key = loadingArticle ? "loading" : "noLauncher".equals(problem) ? "noLauncher" : "oldLauncher".equals(problem) ? "oldLauncher"
				: problem != null ? null : "pick";
			Component text = key != null ? tr(key) : tr("error", problem);
			int ty = ay + 6;
			for (var line : font.split(text, aw - 8)) {
				g.text(font, line, ax + 4, ty, problem != null ? 0xFFF87171 : Ui.MUTED, false);
				ty += LINE_H;
			}
			return;
		}
		if (laidWidth != aw || laidPictures != source.pictureVersion) layout();
		maxScroll = Math.max(0, contentH - ah);
		if (pendingAnchor != null) {
			jump(pendingAnchor);
			pendingAnchor = null;
		}
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		source.lastScroll = scroll;
		g.enableScissor(ax, ay, ax + aw, ay + ah);
		Ui.beginClip("wiki article", ax, ay, aw, ah);
		for (Op op : ops) {
			int oy = ay + op.y() - scroll;
			if (oy + op.h() < ay || oy > ay + ah) continue;
			int ox = ax + op.x();
			if (op.text() != null) {
				g.text(font, op.text(), ox, oy, op.color(), false);
			} else if (op.picture() != null) {
				WikiSource.Picture p = source.picture(op.picture());
				if (p != null) g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, p.id(), ox, oy, 0, 0, op.w(), op.h(), p.w(), p.h(), p.w(), p.h(), 0xFFFFFFFF);
				else g.fill(ox, oy, ox + op.w(), oy + op.h(), 0x14FFFFFF);
			} else if (op.link() == null) {
				g.fill(ox, oy, ox + op.w(), oy + op.h(), op.color());
			}
			if (op.link() != null && oy >= ay && oy + op.h() <= ay + ah) hits.add(new Hit(ox, oy, op.w(), op.h(), op.link()));
		}
		Ui.end();
		g.disableScissor();
		articleBar.draw(g, ax + aw + 3, ay, ah, scroll, maxScroll, mx, my);
	}

	// ---------- laying the article out ----------

	private void layout() {
		laidWidth = aw;
		laidPictures = source.pictureVersion;
		anchors.clear();
		List<Op> out = new ArrayList<>();
		int y = 2, w = aw - 4;
		// the article's own title first (unless its first heading says the same, as the start page's does)
		JsonArray blocks = article.blocks();
		boolean titled = !blocks.isEmpty() && "h".equals(str(blocks.get(0).getAsJsonObject(), "k")) && article.title().equals(str(blocks.get(0).getAsJsonObject(), "text"));
		if (!titled) y = flow(out, List.of(piece(Ui.bold(article.title()), null)), 0, w, y, Ui.TEXT, false) + 6;
		for (JsonElement e : article.blocks()) {
			JsonObject b = e.getAsJsonObject();
			String k = str(b, "k");
			switch (k) {
				case "h" -> {
					int level = b.has("level") ? b.get("level").getAsInt() : 1;
					y += level == 1 ? 8 : 4;
					if (b.has("anchor")) anchors.put(str(b, "anchor"), y);
					int color = level == 1 ? Ui.ACCENT_LIGHT : level == 2 ? Ui.TEXT : Ui.TEXT_2;
					y = flow(out, List.of(piece(Ui.bold(str(b, "text")), null)), 0, w, y, color, false);
					if (level == 1) {
						out.add(new Op(0, y + 1, w, 1, null, LINE, null, null));
						y += 3;
					}
					y += 3;
				}
				case "p" -> {
					int indent = b.has("indent") ? b.get("indent").getAsInt() * 10 : 0;
					int top = y;
					y = flow(out, pieces(b.getAsJsonArray("spans"), false), indent, w - indent, y, Ui.TEXT_2, b.has("center"));
					// a quote's bar as tall as its text
					if (indent > 0) out.add(new Op(indent - 6, top, 2, y - top, null, 0x40FFFFFF, null, null));
					y += 5;
				}
				case "li" -> {
					int depth = Math.max(1, b.has("depth") ? b.get("depth").getAsInt() : 1);
					int indent = depth * 10;
					String mark = str(b, "mark");
					if (!mark.isEmpty()) {
						Component m = Ui.text(mark);
						out.add(new Op(indent - 2 - font.width(m), y, font.width(m), 9, m, Ui.MUTED, null, null));
					}
					y = flow(out, pieces(b.getAsJsonArray("spans"), false), indent + 2, w - indent - 2, y, Ui.TEXT_2, false) + 2;
				}
				case "table" -> y = table(out, b.getAsJsonArray("rows"), w, y) + 6;
				case "img" -> y = picture(out, b.getAsJsonObject("img"), w, y, true) + 6;
				case "hr" -> {
					out.add(new Op(0, y + 2, w, 1, null, LINE, null, null));
					y += 8;
				}
				default -> {}
			}
		}
		// where the article comes from, under it (the wiki's licence asks to name it)
		Component credit = source.credit(article);
		if (credit != null) y = flow(out, List.of(piece(Ui.text(credit.getString()).withStyle(st -> st.withItalic(true)), null)), 0, w, y + 6, Ui.MUTED, false) + 2;
		ops = out;
		contentH = y + 4;
	}

	/** A block picture: as wide as it is (at most the article's width), in the middle. */
	private int picture(List<Op> out, JsonObject img, int w, int y, boolean center) {
		String id = str(img, "id");
		int[] size = pictureSize(img, w, false);
		int x = center ? (w - size[0]) / 2 : 0;
		out.add(new Op(x, y, size[0], size[1], null, 0, id, null));
		source.picture(id);
		return y + size[1];
	}

	/** A picture's size in the article: the wiki's (or the picture's) halved, never wider than `max`; in a line, as tall as the text. */
	private int[] pictureSize(JsonObject img, int max, boolean inline) {
		WikiSource.Picture p = source.picture(str(img, "id"));
		int w = img.has("w") ? img.get("w").getAsInt() : 0, h = img.has("h") ? img.get("h").getAsInt() : 0;
		if ((w == 0 || h == 0) && p != null) {
			w = p.w();
			h = p.h();
		}
		if (inline) {
			if (w == 0 || h == 0) return new int[] { 9, 9 };
			// an icon as tall as the text; a bigger picture (a recipe in a table) halved, at most 64 tall
			int tall = h <= 24 ? 9 : Math.min(64, h / 2);
			return new int[] { Math.max(1, Math.round((float) tall * w / h)), tall };
		}
		if (w == 0 || h == 0) return new int[] { Math.min(max, 64), 36 };
		float scale = Math.min(0.5f, max / (float) w);
		return new int[] { Math.max(8, Math.round(w * scale)), Math.max(8, Math.round(h * scale)) };
	}

	/** A table: columns as wide as their text wants (narrowed to fit), header cells on a darker row. */
	private int table(List<Op> out, JsonArray rows, int w, int y) {
		int cols = 0;
		for (JsonElement r : rows) {
			int n = 0;
			for (JsonElement c : r.getAsJsonArray()) n += cells(c);
			cols = Math.max(cols, n);
		}
		if (cols == 0) return y;
		// what each column wants (its text on one line) and needs (its longest word or picture)
		int[] want = new int[cols], need = new int[cols];
		for (JsonElement r : rows) {
			int col = 0;
			for (JsonElement c : r.getAsJsonArray()) {
				if (col >= cols) break;
				if (cells(c) == 1) {
					JsonObject cell = c.getAsJsonObject();
					want[col] = Math.max(want[col], Math.min(w / 2, natural(cell) + 8));
					for (Piece p : pieces(cell.getAsJsonArray("spans"), cell.has("head"))) need[col] = Math.max(need[col], width(p) + 8);
				}
				col += cells(c);
			}
		}
		int sum = 0, needed = 0;
		for (int i = 0; i < cols; i++) {
			need[i] = Math.max(20, need[i]);
			sum += want[i] = Math.max(need[i], want[i]);
			needed += need[i];
		}
		// too wide: every column keeps what it needs, the rest is shared by what they want beyond it;
		// narrower still (a small window), all of them narrowed alike and long words cut
		int[] colW = new int[cols];
		for (int i = 0; i < cols; i++)
			colW[i] = sum <= w ? want[i] : needed > w ? Math.max(16, need[i] * w / needed)
				: need[i] + (sum == needed ? 0 : (w - needed) * (want[i] - need[i]) / (sum - needed));
		int tableW = 0;
		for (int c : colW) tableW += c;
		int top = y;
		List<Op> cellsOut = new ArrayList<>(), back = new ArrayList<>();
		for (JsonElement r : rows) {
			int col = 0, x = 0, rowH = 0;
			List<int[]> heads = new ArrayList<>();
			for (JsonElement c : r.getAsJsonArray()) {
				if (col >= cols) break;
				int span = Math.min(cells(c), cols - col), cw = 0;
				for (int i = 0; i < span; i++) cw += colW[col + i];
				JsonObject cell = c.getAsJsonObject();
				boolean head = cell.has("head");
				int bottom = flow(cellsOut, pieces(cell.getAsJsonArray("spans"), head), x + 4, cw - 8, y + 3, head ? Ui.TEXT : Ui.TEXT_2, head);
				rowH = Math.max(rowH, bottom - y + 3);
				if (head) heads.add(new int[] { x, cw });
				x += cw;
				col += span;
			}
			rowH = Math.max(rowH, 14);
			for (int[] h : heads) back.add(new Op(h[0], y, h[1], rowH, null, Ui.withAlpha(Ui.ACCENT, 0x28), null, null));
			back.add(new Op(0, y + rowH, tableW, 1, null, LINE, null, null));
			y += rowH;
		}
		out.add(new Op(0, top, tableW, 1, null, LINE, null, null));
		out.addAll(back);
		// the columns' lines
		int x = 0;
		for (int i = 0; i <= cols; i++) {
			out.add(new Op(Math.min(x, tableW - 1), top, 1, y - top + 1, null, LINE, null, null));
			if (i < cols) x += colW[i];
		}
		out.addAll(cellsOut);
		return y + 1;
	}

	private static int cells(JsonElement c) {
		JsonObject o = c.getAsJsonObject();
		return o.has("cols") ? Math.max(1, o.get("cols").getAsInt()) : 1;
	}

	/** A cell's text on one line. */
	private int natural(JsonObject cell) {
		int line = 0, best = 0;
		for (Piece p : pieces(cell.getAsJsonArray("spans"), cell.has("head"))) {
			if (p.br) {
				best = Math.max(best, line);
				line = 0;
			} else line += width(p);
		}
		return Math.max(best, line);
	}

	/** A word (with its space), a picture in the line, or a line break, and where a click on it goes. */
	private record Piece(Component text, JsonObject img, boolean br, Runnable link) {}

	private int width(Piece p) {
		return p.text != null ? font.width(p.text) : p.img != null ? pictureSize(p.img, 0, true)[0] + 1 : 0;
	}

	private static Piece piece(Component text, Runnable link) {
		return new Piece(text, null, false, link);
	}

	/** The spans as words in their style; links followed here or in the browser. */
	private List<Piece> pieces(JsonArray spans, boolean bold) {
		List<Piece> out = new ArrayList<>();
		if (spans == null) return out;
		for (JsonElement e : spans) {
			JsonObject s = e.getAsJsonObject();
			if (s.has("br")) {
				out.add(new Piece(null, null, true, null));
				continue;
			}
			Runnable link = link(s);
			if (s.has("img")) {
				out.add(new Piece(null, s.getAsJsonObject("img"), false, link));
				continue;
			}
			String text = str(s, "t");
			// words with the space after them, so a line breaks between words
			for (String word : text.split("(?<= )")) {
				if (word.isEmpty()) continue;
				MutableComponent c = bold || s.has("b") ? Ui.bold(word) : Ui.text(word);
				boolean italic = s.has("i"), under = s.has("u") || link != null, strike = s.has("s"), code = s.has("code");
				int color = link != null ? Ui.ACCENT_LIGHT : code ? CODE : -1;
				c = c.withStyle(st -> st.withItalic(italic).withUnderlined(under).withStrikethrough(strike));
				if (color != -1) c = c.withStyle(st -> st.withColor(color & 0xFFFFFF));
				out.add(piece(c, link));
			}
		}
		return out;
	}

	private Runnable link(JsonObject s) {
		String wiki = str(s, "wiki"), anchor = str(s, "anchor"), url = str(s, "url");
		if (!wiki.isEmpty()) {
			String slug = source.linked(article, wiki);
			return () -> open(slug, anchor.isEmpty() ? null : anchor, true, 0);
		}
		if (!anchor.isEmpty()) return () -> jump(anchor);
		if (!url.isEmpty()) return () -> openUrl(url);
		return null;
	}

	/** Words and pictures in lines `w` wide from (x, y); returns the y under the last line. */
	private int flow(List<Op> out, List<Piece> pieces, int x, int w, int y, int color, boolean center) {
		List<Piece> line = new ArrayList<>();
		int lineW = 0;
		for (Piece p : split(pieces, w)) {
			if (p.br) {
				y = emit(out, line, lineW, x, w, y, color, center);
				line.clear();
				lineW = 0;
				continue;
			}
			int pw = width(p);
			if (!line.isEmpty() && lineW + pw > w) {
				y = emit(out, line, lineW, x, w, y, color, center);
				line.clear();
				lineW = 0;
				// a space that started the new line is not drawn
				if (p.text != null && p.text.getString().isBlank()) continue;
			}
			line.add(p);
			lineW += pw;
		}
		return line.isEmpty() ? y : emit(out, line, lineW, x, w, y, color, center);
	}

	/** Words wider than the line cut into pieces that fit (a narrow table's column). */
	private List<Piece> split(List<Piece> pieces, int w) {
		List<Piece> out = new ArrayList<>();
		for (Piece p : pieces) {
			if (p.text == null || font.width(p.text) <= w || w < 8) {
				out.add(p);
				continue;
			}
			String s = p.text.getString();
			var style = p.text.getStyle();
			int from = 0;
			while (from < s.length()) {
				int to = from + 1;
				while (to < s.length() && font.width(Component.literal(s.substring(from, to + 1)).withStyle(style)) <= w) to++;
				out.add(new Piece(Component.literal(s.substring(from, to)).withStyle(style), null, false, p.link));
				from = to;
			}
		}
		return out;
	}

	private int emit(List<Op> out, List<Piece> line, int lineW, int x, int w, int y, int color, boolean center) {
		int cx = x + (center ? Math.max(0, (w - lineW) / 2) : 0);
		// a line as tall as its tallest picture; the text in its middle
		int lineH = LINE_H;
		for (Piece p : line) if (p.img != null) lineH = Math.max(lineH, pictureSize(p.img, 0, true)[1] + 1);
		int textY = y + (lineH - LINE_H) / 2;
		for (Piece p : line) {
			int pw = width(p);
			if (p.text != null) out.add(new Op(cx, textY, pw, 9, p.text, color, null, null));
			else if (p.img != null) {
				int[] size = pictureSize(p.img, 0, true);
				out.add(new Op(cx, y + (lineH - 1 - size[1]) / 2, size[0], size[1], null, 0, str(p.img, "id"), null));
				source.picture(str(p.img, "id"));
			}
			if (p.link != null) out.add(new Op(cx, y - 1, pw, lineH, null, 0, null, p.link));
			cx += pw;
		}
		return y + lineH;
	}

	private static String str(JsonObject o, String key) {
		JsonElement v = o.get(key);
		return v == null || v.isJsonNull() ? "" : v.getAsString();
	}

	private void openUrl(String url) {
		try {
			URI uri = URI.create(url);
			if (!"https".equals(uri.getScheme())) return;
			//#if MC >= 1.21.1
			ConfirmLinkScreen.confirmLinkNow(this, uri);
			//#else
			//$ minecraft.setScreenAndShow(new ConfirmLinkScreen(yes -> {
			//$ 	if (yes) net.minecraft.Util.getPlatform().openUri(url);
			//$ 	minecraft.setScreenAndShow(this);
			//$ }, url, true));
			//#endif
		} catch (IllegalArgumentException ignored) {
		}
	}

	/** The wiki in the other language (minecraft.wiki in English or the game's): the search asked again there. */
	private void switchOver() {
		source.switchOver();
		found = null;
		searched = "";
		searchAt = search.getValue().strip().isEmpty() ? 0 : 1;
		source.index(a -> {
			if (a.value() != null) categories = a.value();
		});
	}

	// ---------- input ----------

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		// the main menu's panorama, or the game dimmed behind
		if (minecraft.level == null) extractPanorama(g, delta);
		g.fill(0, 0, width, height, minecraft.level == null ? 0x800A0D14 : 0x90000000);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (e.button() == InputConstants.MOUSE_BUTTON_LEFT) {
			if (listBar.press(e.x(), e.y())) {
				listScroll = Math.round(listBar.drag(e.y()));
				return true;
			}
			if (articleBar.press(e.x(), e.y())) {
				scroll = Math.round(articleBar.drag(e.y()));
				return true;
			}
		}
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

	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (listBar.dragging()) {
			listScroll = Math.round(listBar.drag(e.y()));
			return true;
		}
		if (articleBar.dragging()) {
			scroll = Math.round(articleBar.drag(e.y()));
			return true;
		}
		//#if MC >= 1.21.9
		return super.mouseDragged(e, dx, dy);
		//#else
		//$ return super.mouseDragged(e.x(), e.y(), e.button(), dx, dy);
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		listBar.release();
		articleBar.release();
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	KeyEvent e = new KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		// Backspace outside the search goes back, as in a browser
		if (e.key() == InputConstants.KEY_BACKSPACE && !search.isFocused() && !back.isEmpty()) {
			goBack();
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//#endif
		if (x < ax - 6) listScroll = Math.max(0, Math.min(listMax, listScroll - (int) Math.round(v * ROW_H * 2)));
		else scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * LINE_H * 3)));
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

	/** What the screen shows: the list's labels, the article's title, how tall it is laid out, its links. */
	public String state() {
		StringBuilder s = new StringBuilder();
		for (Row r : rows()) s.append(r.slug() == null && r.anchor() == null ? "#" : "").append(r.label()).append('|');
		s.append(" article=").append(article == null ? "" : article.slug()).append(" height=").append(contentH).append(" back=").append(back.size());
		s.append(" problem=").append(problem);
		return s.toString();
	}

	/** Follows the article's first link to another article. */
	public boolean followFirstLink() {
		for (JsonElement e : article.blocks()) {
			JsonObject b = e.getAsJsonObject();
			if (!b.has("spans")) continue;
			for (JsonElement s : b.getAsJsonArray("spans")) {
				if (!str(s.getAsJsonObject(), "wiki").isEmpty()) {
					link(s.getAsJsonObject()).run();
					return true;
				}
			}
		}
		return false;
	}

	/** Follows the article's link to another article, in its text or its tables (the infobox). */
	public boolean followLink(String wiki) {
		for (JsonElement e : article.blocks()) {
			JsonObject b = e.getAsJsonObject();
			List<JsonElement> spans = new ArrayList<>();
			if (b.has("spans")) b.getAsJsonArray("spans").forEach(spans::add);
			if (b.has("rows")) for (JsonElement r : b.getAsJsonArray("rows")) for (JsonElement c : r.getAsJsonArray()) c.getAsJsonObject().getAsJsonArray("spans").forEach(spans::add);
			for (JsonElement s : spans) {
				if (wiki.equals(str(s.getAsJsonObject(), "wiki"))) {
					link(s.getAsJsonObject()).run();
					return true;
				}
			}
		}
		return false;
	}

	public void jumpTo(String anchor) {
		jump(anchor);
	}

	public void goBack() {
		if (!back.isEmpty()) open(back.pop(), null, false, 0);
	}

	public void typeSearch(String q) {
		search.setValue(q);
		searchAt = 1;
	}
}
