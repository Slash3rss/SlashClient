package dev.slash3rss.slashclient.hud.world;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * The XP calculator of slash3rss.dev in the game: the points a level takes, the level some points
 * make (with how far into it), and what it costs from one level to another. "My level" fills in the
 * player's own. Everything is worked out as it is typed.
 */
public class XpCalcScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private static final int[] LEVELS = { 10, 20, 30, 50, 100 };

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private EditBox level, points, from, to;
	private int px, py, pw, ph, fromX, toX;

	public XpCalcScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.xp.title"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 360);
		ph = Math.min(height - 16, 214);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		boolean first = level == null;
		var p = minecraft.player;
		level = box(px + 16, py + 56, 40, 5, first ? String.valueOf(p != null ? p.experienceLevel : 30) : level.getValue());
		points = box(px + 16, py + 108, 64, 9, first ? String.valueOf(p != null ? XpMath.total(p.experienceLevel) + Math.round(p.experienceProgress * XpMath.toNext(p.experienceLevel)) : 1395) : points.getValue());
		// "From [ ] to [ ]": each box after its word
		fromX = px + 12 + font.width(Component.translatable("slashclient-hud.xp.from")) + 6;
		toX = fromX + 52 + 8 + font.width(Component.translatable("slashclient-hud.xp.to")) + 6;
		from = box(fromX + 4, py + 160, 40, 5, first ? "0" : from.getValue());
		to = box(toX + 4, py + 160, 40, 5, first ? String.valueOf(p != null ? Math.max(30, p.experienceLevel + 1) : 30) : to.getValue());
		setInitialFocus(level);
	}

	private EditBox box(int x, int y, int w, int max, String value) {
		EditBox b = new EditBox(font, x, y, w, 12, Component.empty());
		b.setBordered(false);
		b.setTextColor(Ui.TEXT);
		b.setMaxLength(max);
		b.setValue(value);
		// only digits stay
		b.setResponder(s -> {
			if (!s.matches("\\d*")) b.setValue(s.replaceAll("\\D", ""));
		});
		addRenderableWidget(b);
		return b;
	}

	public static int number(EditBox b) {
		try {
			return b.getValue().isEmpty() ? 0 : Integer.parseInt(b.getValue());
		} catch (NumberFormatException e) {
			return 0;
		}
	}

	/** The player's own level and points put in every box. */
	private void mine() {
		var p = minecraft.player;
		if (p == null) return;
		long have = XpMath.total(p.experienceLevel) + Math.round(p.experienceProgress * XpMath.toNext(p.experienceLevel));
		level.setValue(String.valueOf(p.experienceLevel));
		points.setValue(String.valueOf(have));
		from.setValue(String.valueOf(p.experienceLevel));
		if (number(to) <= p.experienceLevel) to.setValue(String.valueOf(p.experienceLevel + 1));
	}

	@Override
	public void onClose() {
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		hits.clear();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("xpcalc", px, py, pw, ph);
		Ui.icon(g, "m-xpcalc", px + 14, py + 11, 10, Ui.ACCENT_LIGHT);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.xp.title"), pw - 70), px + 30, py + 12, Ui.TEXT);
		Ui.button(g, "xp:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		g.fill(px + 1, py + 31, px + pw - 1, py + 32, Ui.BORDER);

		// a level: all its points, and what the next one costs
		int y = py + 38;
		Ui.draw(g, Ui.trBold("slashclient-hud.xp.levelToPoints"), px + 12, y, Ui.TEXT_2);
		field(g, level, px + 10, y + 12, 52);
		int cx = px + 70;
		for (int preset : LEVELS) {
			Component label = Ui.text(String.valueOf(preset));
			int w = Ui.width(label) + 10;
			Ui.button(g, "xp:preset:" + preset, cx, y + 14, w, 16, label, number(level) == preset, mx, my);
			hits.add(new Hit(cx, y + 14, w, 16, () -> level.setValue(String.valueOf(preset))));
			cx += w + 3;
		}
		int lv = number(level);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.xp.levelResult", XpMath.total(lv), XpMath.toNext(lv)), pw - 24), px + 12, y + 36, Ui.GREEN);

		// some points: the level they make and how far into it
		y = py + 90;
		Ui.draw(g, Ui.trBold("slashclient-hud.xp.pointsToLevel"), px + 12, y, Ui.TEXT_2);
		field(g, points, px + 10, y + 12, 76);
		XpMath.Level made = XpMath.level(Math.max(0, number(points)));
		int bx = px + 96, bw = pw - 96 - 12;
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.xp.pointsResult", made.level(), made.into(), made.next()), bw), bx, y + 14, Ui.GREEN);
		Ui.round(g, bx, y + 26, bw, 4, 2, 0xFF2A3142);
		Ui.round(g, bx, y + 26, Math.max(4, Math.round(bw * made.progress())), 4, 2, Ui.GREEN);

		// from one level to another
		y = py + 142;
		Ui.draw(g, Ui.trBold("slashclient-hud.xp.between"), px + 12, y, Ui.TEXT_2);
		Ui.draw(g, Ui.tr("slashclient-hud.xp.from"), px + 12, y + 18, Ui.MUTED);
		field(g, from, fromX, y + 12, 52);
		Ui.draw(g, Ui.tr("slashclient-hud.xp.to"), fromX + 52 + 8, y + 18, Ui.MUTED);
		field(g, to, toX, y + 12, 52);
		long cost = Math.max(0, XpMath.total(number(to)) - XpMath.total(number(from)));
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.xp.betweenResult", cost), px + pw - 12 - (toX + 60)), toX + 60, y + 18, Ui.GREEN);

		// the player's own level, in a world
		if (minecraft.player != null) {
			Component mine = Ui.tr("slashclient-hud.xp.mine");
			int mw = Ui.buttonWidth(mine, "user", 20, 4);
			Ui.button(g, "xp:mine", px + pw - 10 - mw, py + ph - 28, mw, 20, "user", mine, false, mx, my);
			hits.add(new Hit(px + pw - 10 - mw, py + ph - 28, mw, 20, this::mine));
		}
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	/** A card under an edit box, outlined blue while it has the focus. */
	public static void field(GuiGraphicsExtractor g, EditBox box, int x, int y, int w) {
		Ui.round(g, x, y, w, 20, 4, Ui.CARD);
		Ui.roundOutline(g, x, y, w, 20, 4, box.isFocused() ? Ui.withAlpha(Ui.ACCENT, 0x99) : Ui.BORDER);
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
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	/** For the test: the boxes typed in. */
	public void typeForTest(String lvl, String pts, String a, String b) {
		level.setValue(lvl);
		points.setValue(pts);
		from.setValue(a);
		to.setValue(b);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		if (minecraft.level == null) g.fill(0, 0, width, height, 0xF00A0D14);
		else g.fill(0, 0, width, height, 0x50000000);
	}
}
