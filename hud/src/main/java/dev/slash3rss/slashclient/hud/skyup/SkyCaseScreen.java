// SkyUp's cases are played on 26.3: the case counter is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * SkyUp's cases in detail: the cases on the left, the chosen one's rewards on the right, each with
 * its wins this session and all time and its share of the case's openings, also those never won
 * (0) and those the case no longer gives. Rewards can be grouped by item ("5x" and "15x Zaklęta
 * butelka" together, with how many items that was), and a case's wins reset (two clicks).
 */
public class SkyCaseScreen extends Screen {
	private static final int ROW_H = 18, LIST_W = 112;

	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private String type;
	private boolean grouped;
	/** The reset button was clicked once: a second click before this time resets. */
	private long resetArmed;
	private int scroll, maxScroll;
	/** The list of cases scrolls on its own (the wheel over it), when there are more than fit. */
	private int typeScroll, typeMax, listX;
	/** The case chosen from outside: the list scrolled to it once drawn. */
	private boolean reveal = true;
	private final dev.slash3rss.slashclient.hud.ui.Scrollbar bar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
	private int px, py, pw, ph;

	public SkyCaseScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.skyCase.screen"));
		this.parent = parent;
		String shown = SkyCase.shownType();
		List<String> types = SkyCase.types();
		type = types.contains(shown) ? shown : types.isEmpty() ? "" : types.get(0);
		grouped = SlashHud.config.skyCaseSum;
	}

	/** The case shown (for the tests). */
	void show(String type, boolean grouped) {
		this.type = type;
		this.grouped = grouped;
		reveal = true;
		scroll = 0;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 470);
		ph = Math.min(height - 24, 330);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		super.extractRenderState(g, mx, my, delta);
		hits.clear();
		bar.hide();
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("skycase", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		Ui.draw(g, Ui.trBold("slashclient-hud.skyCase.screen"), x, y, Ui.TEXT);
		// the buttons on the right: close, reset, grouped
		int bx = px + pw - 24;
		Ui.button(g, "skycase:close", bx, y - 4, 16, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(bx, y - 4, 16, 15, this::onClose));
		boolean armed = System.currentTimeMillis() < resetArmed;
		Component reset = Ui.tr(armed ? "slashclient-hud.skyCase.resetSure" : "slashclient-hud.skyCase.reset");
		int rw = Ui.buttonWidth(reset, "reset", 15, 2);
		bx -= rw + 4;
		Ui.button(g, "skycase:reset", bx, y - 4, rw, 15, "reset", reset, armed, mx, my);
		hits.add(new Hit(bx, y - 4, rw, 15, () -> {
			if (System.currentTimeMillis() < resetArmed) {
				SkyCase.reset(type);
				resetArmed = 0;
			} else resetArmed = System.currentTimeMillis() + 3000;
		}));
		// wins the counter missed, added from a part of the game's log
		Component fromLog = Ui.tr("slashclient-hud.skyCase.importButton");
		int iw = Ui.buttonWidth(fromLog, null, 15, 2);
		bx -= iw + 4;
		Ui.button(g, "skycase:import", bx, y - 4, iw, 15, fromLog, false, mx, my);
		hits.add(new Hit(bx, y - 4, iw, 15, () -> minecraft.setScreenAndShow(new SkyCaseImportScreen(this))));
		Component group = Ui.tr("slashclient-hud.skyCase.sum");
		int gw = Ui.buttonWidth(group, null, 15, 2);
		bx -= gw + 4;
		Ui.button(g, "skycase:grouped", bx, y - 4, gw, 15, group, grouped, mx, my);
		hits.add(new Hit(bx, y - 4, gw, 15, () -> {
			grouped = !grouped;
			SlashHud.config.skyCaseSum = grouped;
			SlashHud.config.save();
			scroll = 0;
		}));
		y += 16;
		SkyCase.Stats life = SkyCase.lifetime().get(type), now = SkyCase.session.get(type);
		Component summary = Ui.text(SkyCase.title(type) + " · ").append(Ui.tr("slashclient-hud.skyCase.openedCount", now.opened, life.opened));
		Ui.draw(g, Ui.fit(summary, pw - 24), x, y, Ui.MUTED);
		y += 14;

		// the cases
		int top = y, bottom = py + ph - 10;
		List<String> types = SkyCase.types();
		typeMax = Math.max(0, types.size() * (ROW_H + 2) - 2 - (bottom - top));
		if (reveal) {
			typeScroll = Math.max(0, types.indexOf(type) * (ROW_H + 2) + ROW_H - (bottom - top));
			reveal = false;
		}
		typeScroll = Math.max(0, Math.min(typeMax, typeScroll));
		g.enableScissor(x, top, x + LIST_W, bottom);
		Ui.beginClip("skycase types", x, top, LIST_W, bottom - top);
		for (int i = 0; i < types.size(); i++) {
			String t = types.get(i);
			int ry = top + i * (ROW_H + 2) - typeScroll;
			if (ry + ROW_H < top || ry > bottom) continue;
			long opened = SkyCase.lifetime().get(t).opened;
			String name = SkyCase.UNASSIGNED.equals(t) ? SkyCase.title(t) : t;
			Ui.button(g, "skycase:type:" + t, x, ry, LIST_W, ROW_H, Ui.text(name + "  " + opened), t.equals(type), mx, my);
			if (ry >= top && ry + ROW_H <= bottom) hits.add(new Hit(x, ry, LIST_W, ROW_H, () -> {
				type = t;
				scroll = 0;
				resetArmed = 0;
			}));
		}
		Ui.end();
		g.disableScissor();

		// its rewards: name, this session, all time, share
		int lx = listX = x + LIST_W + 10, lw = px + pw - 12 - lx - 6;
		Component nowLabel = Ui.tr("slashclient-hud.skyCase.session"), allLabel = Ui.tr("slashclient-hud.skyCase.lifetime");
		// the numbers as narrow as their headers, the name gets the rest
		int cPct = lx + lw, cAll = cPct - 34 - 6, cNow = cAll - Math.max(28, Ui.width(allLabel)) - 8, nameW = cNow - Math.max(28, Ui.width(nowLabel)) - 8 - (lx + 20);
		Ui.draw(g, Ui.tr("slashclient-hud.skyCase.reward"), lx, top + 2, Ui.MUTED);
		right(g, nowLabel, cNow, top + 2, Ui.MUTED);
		right(g, allLabel, cAll, top + 2, Ui.MUTED);
		right(g, Ui.text("%"), cPct, top + 2, Ui.MUTED);
		int listTop = top + 14;
		List<SkyCase.Reward> rows = SkyCase.rewards(type, grouped);
		maxScroll = Math.max(0, rows.size() * ROW_H - (bottom - listTop));
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(lx, listTop, lx + lw + 6, bottom);
		Ui.beginClip("skycase list", lx, listTop, lw + 6, bottom - listTop);
		if (rows.isEmpty()) Ui.draw(g, Ui.tr("slashclient-hud.skyCase.empty"), lx, listTop + 4, Ui.MUTED);
		for (int i = 0; i < rows.size(); i++) {
			SkyCase.Reward r = rows.get(i);
			int ry = listTop + i * ROW_H - scroll;
			if (ry + ROW_H < listTop || ry > bottom) continue;
			if (i % 2 == 1) g.fill(lx, ry, lx + lw, ry + ROW_H, 0x0AFFFFFF);
			// the reward as the preview shows it: its model and coloured name
			var look = SkyCase.look(type, r.variant());
			var item = SkyCase.item(r.item());
			if (look != null) g.item(look, lx + 1, ry + 1);
			else if (item != null) Ui.icon(g, item, "spark", lx + 1, ry + 1);
			boolean won = r.lifetime() > 0;
			Component name = Component.empty().append(SkyCase.styledName(look, r.name(), grouped));
			// summed: the columns count pieces, how many wins they came in beside the name
			if (grouped && r.amount() > r.lifetime()) name = name.copy().append(Ui.text(" · ").append(Ui.tr("slashclient-hud.skyCase.wins", r.lifetime())).withStyle(s -> s.withColor(0x9CA3AF)));
			if (r.removed()) name = name.copy().append(Ui.text(" ").append(Ui.tr("slashclient-hud.skyCase.removed")).withStyle(s -> s.withColor(0xF87171)));
			Ui.draw(g, Ui.fit(name, nameW), lx + 20, ry + 5, r.removed() ? Ui.MUTED : won ? Ui.TEXT : Ui.TEXT_2);
			int count = won ? Ui.TEXT : Ui.MUTED;
			right(g, Ui.text(String.valueOf(grouped ? r.sessionAmount() : r.session())), cNow, ry + 5, r.session() > 0 ? Ui.ACCENT_LIGHT : Ui.MUTED);
			right(g, Ui.text(String.valueOf(grouped ? r.amount() : r.lifetime())), cAll, ry + 5, count);
			right(g, Ui.text(SkyCase.percent(r.share())), cPct, ry + 5, count);
		}
		Ui.end();
		g.disableScissor();
		bar.draw(g, lx + lw + 3, listTop, bottom - listTop, scroll, maxScroll, mx, my);
		Ui.end();
	}

	private static void right(GuiGraphicsExtractor g, Component c, int rightX, int y, int color) {
		Ui.draw(g, c, rightX - Ui.width(c), y, color);
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
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return super.mouseClicked(e, doubleClick);
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
		if (x < listX) typeScroll = Math.max(0, Math.min(typeMax, typeScroll - (int) Math.round(v * ROW_H)));
		else scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * ROW_H)));
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
}
//#endif
