// SkyUp's bottling is played on 26.3: the calculator is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.XpCalcScreen;
import dev.slash3rss.slashclient.hud.XpMath;

/**
 * The XP calculator of slash3rss.dev, SkyUp edition: the mending assistant (what a bottle should
 * hold for a pickaxe by 8 or 16 generators with Unbreaking III–VI), bottling with SkyUp's 50% tax
 * (from the player's level, or a number of bottles), the "/schowajexp" command, how long the AFK
 * session lasts by the clock between throws, and its countdown (kept on the HUD).
 */
public class SkyXpScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private static final int[] LEVELS = { 30, 40, 50, 70, 100 }, BOTTLES = { 30, 42, 52, 68, 102 }, CLOCKS = { 10, 12, 15, 20, 30 };

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private EditBox level, qty, bottle, clock;
	private int px, py, pw, ph;
	/** When the command was copied (ms), for "Copied". */
	private long copiedAt;

	public SkyXpScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.skyXp.title"));
		this.parent = parent;
	}

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 16, 500);
		ph = Math.min(height - 16, 262);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
		int x2 = right(), fy = py + 52;
		level = box(x2 + 58, fy + 6, 34, 5, String.valueOf(cfg().skyXpLevel), v -> cfg().skyXpLevel = v);
		qty = box(x2 + 58, fy + 6, 34, 5, String.valueOf(cfg().skyXpBottles), v -> cfg().skyXpBottles = Math.max(1, v));
		bottle = box(x2 + 58, fy + 30, 34, 5, String.valueOf(cfg().skyXpBottle), v -> cfg().skyXpBottle = Math.max(1, v));
		clock = box(x2 + 58, fy + 54, 34, 5, String.valueOf(cfg().skyXpInterval), v -> cfg().skyXpInterval = Math.max(1, v));
	}

	private int colW() {
		return (pw - 30) / 2;
	}

	private int right() {
		return px + 20 + colW();
	}

	private EditBox box(int x, int y, int w, int max, String value, java.util.function.IntConsumer set) {
		EditBox b = new EditBox(font, x, y, w, 12, Component.empty());
		b.setBordered(false);
		b.setTextColor(Ui.TEXT);
		b.setMaxLength(max);
		b.setValue(value);
		b.setResponder(s -> {
			// only digits stay
			if (!s.matches("\\d*")) b.setValue(s.replaceAll("\\D", ""));
			else if (!s.isEmpty()) set.accept(XpCalcScreen.number(b));
		});
		addRenderableWidget(b);
		return b;
	}

	/** How many bottles: from the level, or as typed. */
	private int bottles() {
		return cfg().skyXpFromLevel ? XpMath.bottling(cfg().skyXpLevel, cfg().skyXpBottle).bottles() : Math.max(1, cfg().skyXpBottles);
	}

	public String command() {
		return "/schowajexp " + Math.max(1, cfg().skyXpBottle) + " " + bottles();
	}

	private long session() {
		return (long) bottles() * Math.max(1, cfg().skyXpInterval);
	}

	@Override
	public void onClose() {
		cfg().save();
		minecraft.setScreenAndShow(parent);
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		hits.clear();
		HudConfig c = cfg();
		level.visible = c.skyXpFromLevel;
		qty.visible = !c.skyXpFromLevel;
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("skyxp", px, py, pw, ph);
		Ui.icon(g, "m-skyxpcalc", px + 14, py + 11, 10, Ui.GREEN);
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.skyXp.title"), pw - 70), px + 30, py + 12, Ui.TEXT);
		Ui.button(g, "skyxp:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		g.fill(px + 1, py + 31, px + pw - 1, py + 32, Ui.BORDER);
		int x1 = px + 10, x2 = right(), cw = colW();

		// ---- the mending assistant ----
		int y = py + 38;
		Ui.draw(g, Ui.trBold("slashclient-hud.skyXp.mending"), x1, y, Ui.TEXT_2);
		int cx = x1;
		for (String gen : XpMath.GENERATORS) cx = chip(g, "gen:" + gen, Ui.text(gen), cx, y + 13, gen.equals(c.skyXpGenerators), x1 + cw, mx, my, () -> c.skyXpGenerators = gen);
		cx += 6;
		for (String u : XpMath.UNBREAKING) cx = chip(g, "unb:" + u, Ui.text(u), cx, y + 13, u.equals(c.skyXpUnbreaking), x1 + cw, mx, my, () -> c.skyXpUnbreaking = u);
		XpMath.Mending m = XpMath.mending(c.skyXpGenerators, c.skyXpUnbreaking);
		int sw = (cw - 6) / 3;
		// what a bottle should hold: safe, the usual range (a click takes its low end), the most
		Object[][] picks = { { "safe", m.safe(), m.safe() }, { "range", m.low(), m.low() + "–" + m.high() }, { "max", m.max(), m.max() } };
		for (int i = 0; i < 3; i++) {
			int bx = x1 + i * (sw + 3), value = (int) picks[i][1];
			String key = (String) picks[i][0];
			Component label = Ui.tr("slashclient-hud.skyXp." + key, picks[i][2]);
			Ui.button(g, "skyxp:" + key, bx, y + 34, sw, 18, label, c.skyXpBottle == value, mx, my);
			hits.add(new Hit(bx, y + 34, sw, 18, () -> bottle.setValue(String.valueOf(value))));
		}

		// ---- what it comes to ----
		y = py + 96;
		Ui.draw(g, Ui.trBold("slashclient-hud.skyXp.result"), x1, y, Ui.TEXT_2);
		int perBottle = Math.max(1, c.skyXpBottle);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.skyXp.cost", perBottle * 2), cw), x1, y + 13, Ui.TEXT);
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.skyXp.bottles", bottles()), cw), x1, y + 24, Ui.GREEN);
		if (c.skyXpFromLevel) {
			XpMath.Bottling b = XpMath.bottling(c.skyXpLevel, perBottle);
			Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.skyXp.left", b.leftLevel().level(), b.leftLevel().into(), b.leftLevel().next(), b.left()), cw), x1, y + 35, Ui.TEXT_2);
			Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.skyXp.tax", b.tax()), cw), x1, y + 46, 0xFFF87171);
		}

		// ---- the settings ----
		y = py + 38;
		Ui.draw(g, Ui.trBold("slashclient-hud.skyXp.settings"), x2, y, Ui.TEXT_2);
		Component fromLevel = Ui.tr("slashclient-hud.skyXp.fromLevel");
		int tw = Ui.width(fromLevel) + 26;
		Ui.draw(g, fromLevel, x2 + cw - tw, y, Ui.MUTED);
		Ui.toggle(g, "skyxp:fromLevel", x2 + cw - 20, y - 1, c.skyXpFromLevel);
		hits.add(new Hit(x2 + cw - tw, y - 2, tw, 12, () -> c.skyXpFromLevel = !c.skyXpFromLevel));
		int fy = py + 52;
		row(g, c.skyXpFromLevel ? "slashclient-hud.skyXp.level" : "slashclient-hud.skyXp.count", c.skyXpFromLevel ? level : qty, fy, c.skyXpFromLevel ? LEVELS : new int[0], "", mx, my);
		row(g, "slashclient-hud.skyXp.perBottle", bottle, fy + 24, BOTTLES, "", mx, my);
		row(g, "slashclient-hud.skyXp.clock", clock, fy + 48, CLOCKS, "s", mx, my);
		int interval = Math.max(1, c.skyXpInterval);
		double rate = 3600.0 / interval;
		String perHour = rate % 1 == 0 ? String.valueOf((long) rate) : String.format(Locale.ROOT, "%.1f", rate).replace('.', ',');
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.skyXp.session", XpMath.clock(session()), perHour), cw), x2, fy + 76, Ui.GREEN);

		// ---- the command, and the countdown ----
		int by = py + ph - 68;
		g.fill(px + 1, by, px + pw - 1, by + 1, Ui.BORDER);
		Component copy = Ui.tr(System.currentTimeMillis() - copiedAt < 2000 ? "slashclient-hud.skyXp.copied" : "slashclient-hud.skyXp.copy"), chat = Ui.tr("slashclient-hud.skyXp.toChat");
		int cpw = Ui.buttonWidth(copy, "copy", 18, 4), chw = Ui.buttonWidth(chat, null, 18, 4);
		int cmdW = pw - 20 - cpw - chw - 8;
		Ui.round(g, x1, by + 8, cmdW, 18, 4, Ui.CARD);
		Ui.draw(g, Ui.fit(Ui.text(command()), cmdW - 12), x1 + 6, by + 13, Ui.GREEN);
		Ui.button(g, "skyxp:copy", x1 + cmdW + 4, by + 8, cpw, 18, "copy", copy, false, mx, my);
		hits.add(new Hit(x1 + cmdW + 4, by + 8, cpw, 18, () -> {
			minecraft.keyboardHandler.setClipboard(command());
			copiedAt = System.currentTimeMillis();
		}));
		Ui.button(g, "skyxp:chat", x1 + cmdW + 8 + cpw, by + 8, chw, 18, chat, true, mx, my);
		// the command in the chat's line: the player sends it with Enter
		if (minecraft.player != null) hits.add(new Hit(x1 + cmdW + 8 + cpw, by + 8, chw, 18, () -> {
			cfg().save();
			minecraft.setScreenAndShow(new net.minecraft.client.gui.screens.ChatScreen(command(), false));
		}));

		int ty = by + 34;
		long left = SkyXp.total() > 0 ? SkyXp.left() : session();
		Ui.draw(g, Ui.trBold("slashclient-hud.skyXp.timer"), x1, ty, Ui.TEXT_2);
		Ui.draw(g, Ui.text(XpMath.clock(left)), x1, ty + 12, SkyXp.running() ? Ui.GREEN : Ui.TEXT);
		long bottlesLeft = SkyXp.total() > 0 ? SkyXp.bottles() : bottles();
		Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.skyXp.bottlesLeft", bottlesLeft), cw - 60), x1 + 56, ty + 12, Ui.MUTED);
		Component go = Ui.tr(SkyXp.running() ? "slashclient-hud.skyXp.pause" : "slashclient-hud.skyXp.start"), reset = Ui.tr("slashclient-hud.skyXp.reset");
		int gw = Ui.buttonWidth(go, SkyXp.running() ? "pause" : "play", 18, 4), rw = Ui.buttonWidth(reset, null, 18, 4);
		int bx = px + pw - 10 - 18 - 4 - rw - 4 - gw;
		Ui.button(g, "skyxp:go", bx, ty + 4, gw, 18, SkyXp.running() ? "pause" : "play", go, true, mx, my);
		hits.add(new Hit(bx, ty + 4, gw, 18, () -> {
			if (SkyXp.running()) SkyXp.pause();
			else SkyXp.start(session(), Math.max(1, cfg().skyXpInterval));
		}));
		Ui.button(g, "skyxp:reset", bx + gw + 4, ty + 4, rw, 18, reset, false, mx, my);
		hits.add(new Hit(bx + gw + 4, ty + 4, rw, 18, () -> {
			SkyXp.reset();
		}));
		int mxb = px + pw - 10 - 18;
		Ui.button(g, "skyxp:mute", mxb, ty + 4, 18, 18, c.skyXpMuted ? "bell-slash" : "bell", Component.empty(), false, mx, my);
		hits.add(new Hit(mxb, ty + 4, 18, 18, () -> c.skyXpMuted = !c.skyXpMuted));
		// how much of the session is behind
		float done = SkyXp.total() > 0 ? 1f - SkyXp.left() / (float) SkyXp.total() : 0;
		Ui.round(g, x1, ty + 24, bx - 8 - x1, 3, 1, 0xFF2A3142);
		if (done > 0) Ui.round(g, x1, ty + 24, Math.max(3, Math.round((bx - 8 - x1) * done)), 3, 1, Ui.GREEN);
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	/** A small button that picks a value; returns where the next one goes (none drawn past `limit`). */
	private int chip(GuiGraphicsExtractor g, String id, Component label, int x, int y, boolean on, int limit, int mx, int my, Runnable pick) {
		int w = Ui.width(label) + 10;
		if (x + w > limit) return x;
		Ui.button(g, "skyxp:" + id, x, y, w, 16, label, on, mx, my);
		hits.add(new Hit(x, y, w, 16, pick));
		return x + w + 3;
	}

	/** One setting: its name, its box and the presets that fit after it. */
	private void row(GuiGraphicsExtractor g, String key, EditBox box, int y, int[] presets, String unit, int mx, int my) {
		int x2 = right(), cw = colW();
		Ui.draw(g, Ui.fit(Ui.tr(key), 52), x2, y + 6, Ui.MUTED);
		XpCalcScreen.field(g, box, x2 + 54, y, 40);
		int cx = x2 + 98, now = XpCalcScreen.number(box);
		for (int p : presets) cx = chip(g, key + p, Ui.text(p + unit), cx, y + 2, now == p, x2 + cw, mx, my, () -> box.setValue(String.valueOf(p)));
	}

	@Override
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
		if (super.mouseClicked(e, doubleClick)) return true;
		for (Hit h : List.copyOf(hits)) {
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		return false;
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		if (minecraft.level == null) g.fill(0, 0, width, height, 0xF00A0D14);
		else g.fill(0, 0, width, height, 0x50000000);
	}
}
//#endif
