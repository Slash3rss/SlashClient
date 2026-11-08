package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Map;

/**
 * The trips through SkyUp's dungeons kept so far (DungeonRun), newest first: each its level, when and how long,
 * the rooms, loot, ores and mobs, and the items got. Scrolls with the wheel; a trip clicked shows all of its
 * summary, every item got with its name and how many.
 */
public class DungeonHistoryScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private static final int ROW_H = 64;
	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private int px, py, pw, ph, scroll, maxScroll;
	/** The trip shown whole, or null for the list (and the list's scroll to come back to). */
	private DungeonRun.Summary open;
	private int listScroll;

	public DungeonHistoryScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.dungeon.history"));
		this.parent = parent;
	}

	@Override
	protected void init() {
		pw = Math.min(width - 24, 420);
		ph = Math.min(height - 16, 300);
		px = (width - pw) / 2;
		py = (height - ph) / 2;
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
		Ui.begin("dungeonhistory", px, py, pw, ph);
		g.item(new ItemStack(Items.SPAWNER), px + 10, py + 8);
		List<DungeonRun.Summary> list = DungeonRun.history();
		Ui.draw(g, Ui.fit(Ui.trBold("slashclient-hud.dungeon.history"), pw - 120), px + 30, py + 12, Ui.TEXT);
		if (!list.isEmpty()) Ui.draw(g, Ui.tr("slashclient-hud.dungeon.history.count", list.size()), px + 30 + Ui.width(Ui.trBold("slashclient-hud.dungeon.history")) + 8, py + 12, Ui.MUTED);
		Ui.button(g, "dh:close", px + pw - 26, py + 7, 18, 18, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - 26, py + 7, 18, 18, this::onClose));
		g.fill(px + 1, py + 31, px + pw - 1, py + 32, Ui.BORDER);

		int top = py + 36, bottom = py + ph - 6;
		if (open != null) {
			whole(g, open, top, bottom, mx, my);
		} else if (list.isEmpty()) {
			Ui.wrapped(g, Ui.tr("slashclient-hud.dungeon.history.empty"), px + 14, top + 10, pw - 28, Ui.MUTED);
		} else {
			maxScroll = Math.max(0, list.size() * (ROW_H + 4) - (bottom - top));
			scroll = Math.min(scroll, maxScroll);
			g.enableScissor(px + 1, top, px + pw - 1, bottom);
			SimpleDateFormat when = new SimpleDateFormat("d.MM.yyyy HH:mm");
			for (int i = 0; i < list.size(); i++) {
				int y = top + i * (ROW_H + 4) - scroll;
				if (y + ROW_H < top || y > bottom) continue;
				DungeonRun.Summary s = list.get(i);
				boolean over = my >= top && my < bottom && Ui.inside(mx, my, px + 8, y, pw - 16, ROW_H);
				row(g, s, px + 8, y, pw - 16, when, over);
				if (y + ROW_H > top && y < bottom) hits.add(new Hit(px + 8, Math.max(top, y), pw - 16, Math.min(bottom, y + ROW_H) - Math.max(top, y), () -> {
					open = s;
					listScroll = scroll;
					scroll = 0;
				}));
			}
			g.disableScissor();
		}
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	private void row(GuiGraphicsExtractor g, DungeonRun.Summary s, int x, int y, int w, SimpleDateFormat when, boolean over) {
		Ui.round(g, x, y, w, ROW_H, 5, over ? Ui.CARD_HOVER : Ui.CARD);
		Ui.draw(g, DungeonRun.title(s, false), x + 8, y + 6, 0xFFFFA94D);
		Component date = Ui.text(when.format(new Date(s.at())) + " · " + DungeonRun.time(s.ms()));
		Ui.draw(g, date, x + w - 8 - Ui.width(date), y + 6, Ui.MUTED);
		// the numbers on one line: rooms, spawners, loot, ores, mobs, elites, mini bosses (the time is by the date)
		List<Map.Entry<net.minecraft.world.item.Item, Component>> lines = DungeonRun.lines(s);
		int cx = x + 8;
		for (int i = 1; i < lines.size(); i++) {
			Component c = lines.get(i).getValue();
			if (cx + 12 + Ui.width(c) > x + w - 6) break;
			Ui.draw(g, c, cx, y + 20, Ui.TEXT_2);
			cx += Ui.width(c) + 12;
		}
		if (s.gains().isEmpty()) Ui.draw(g, Ui.tr("slashclient-hud.dungeon.sum.nothing"), x + 8, y + 40, Ui.MUTED);
		else DungeonRun.items(g, s.gains(), x + 8, y + 36, w - 16, false);
	}

	/** One trip whole: its numbers with their items, then every item got, its picture, how many and its name. */
	private void whole(GuiGraphicsExtractor g, DungeonRun.Summary s, int top, int bottom, int mx, int my) {
		Component back = Ui.tr("slashclient-hud.dungeon.history.back");
		int bw = Ui.buttonWidth(back, "back", 18, 4);
		Ui.button(g, "dh:back", px + 8, top, bw, 18, "back", back, false, mx, my);
		hits.add(new Hit(px + 8, top, bw, 18, () -> {
			open = null;
			scroll = listScroll;
		}));
		Component date = Ui.text(new SimpleDateFormat("d.MM.yyyy HH:mm").format(new Date(s.at())));
		Ui.draw(g, date, px + pw - 10 - Ui.width(date), top + 5, Ui.MUTED);
		int areaTop = top + 24;
		g.enableScissor(px + 1, areaTop, px + pw - 1, bottom);
		int y = areaTop - scroll;
		Ui.draw(g, DungeonRun.title(s, true), px + 12, y, 0xFFFFA94D);
		y += 14;
		var lines = DungeonRun.lines(s);
		int colW = (pw - 24) / 2;
		for (int i = 0; i < lines.size(); i++) {
			int cx = px + 12 + (i % 2) * colW, cy = y + (i / 2) * 18;
			g.item(new ItemStack(lines.get(i).getKey()), cx, cy);
			Ui.draw(g, Ui.fit(lines.get(i).getValue(), colW - 22), cx + 19, cy + 4, Ui.TEXT);
		}
		y += (lines.size() + 1) / 2 * 18 + 6;
		Ui.draw(g, Ui.trBold(s.gains().isEmpty() ? "slashclient-hud.dungeon.sum.nothing" : "slashclient-hud.dungeon.sum.gained"), px + 12, y, Ui.TEXT_2);
		y += 13;
		for (int i = 0; i < s.gains().size(); i++) {
			DungeonRun.Gain gain = s.gains().get(i);
			int cx = px + 12 + (i % 2) * colW, cy = y + (i / 2) * 19;
			ItemStack st = DungeonRun.stackOf(gain);
			if (!st.isEmpty()) g.item(st, cx, cy);
			Ui.draw(g, Ui.fit(Ui.text(gain.count() + "× " + gain.name()), colW - 24), cx + 20, cy + 4, Ui.TEXT);
		}
		y += (s.gains().size() + 1) / 2 * 19;
		g.disableScissor();
		maxScroll = Math.max(0, y + scroll - bottom + 4);
		scroll = Math.min(scroll, maxScroll);
	}

	@Override
	//#if MC >= 1.21.9
	public boolean keyPressed(net.minecraft.client.input.KeyEvent e) {
	//#else
	//$ public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
	//$ 	net.minecraft.client.input.KeyEvent e = new net.minecraft.client.input.KeyEvent(keyCode, scanCode, modifiers);
	//#endif
		// Esc in a trip goes back to the list
		if (open != null && e.key() == com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE) {
			open = null;
			scroll = listScroll;
			return true;
		}
		//#if MC >= 1.21.9
		return super.keyPressed(e);
		//#else
		//$ return super.keyPressed(e.key(), e.scancode(), e.modifiers());
		//#endif
	}

	/** For the test: the newest trip shown whole. */
	public void openNewestForTest() {
		if (!DungeonRun.history().isEmpty()) open = DungeonRun.history().get(0);
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//#endif
		scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * 24)));
		return true;
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
