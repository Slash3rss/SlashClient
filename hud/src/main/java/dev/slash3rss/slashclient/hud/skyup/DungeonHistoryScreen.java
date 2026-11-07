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
 * the rooms, spawners, loot, ores and mobs, and the items got. Scrolls with the wheel.
 */
public class DungeonHistoryScreen extends Screen {
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private static final int ROW_H = 64;
	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private int px, py, pw, ph, scroll, maxScroll;

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
		if (list.isEmpty()) {
			Ui.wrapped(g, Ui.tr("slashclient-hud.dungeon.history.empty"), px + 14, top + 10, pw - 28, Ui.MUTED);
		} else {
			maxScroll = Math.max(0, list.size() * (ROW_H + 4) - (bottom - top));
			scroll = Math.min(scroll, maxScroll);
			g.enableScissor(px + 1, top, px + pw - 1, bottom);
			SimpleDateFormat when = new SimpleDateFormat("d.MM.yyyy HH:mm");
			for (int i = 0; i < list.size(); i++) {
				int y = top + i * (ROW_H + 4) - scroll;
				if (y + ROW_H < top || y > bottom) continue;
				row(g, list.get(i), px + 8, y, pw - 16, when);
			}
			g.disableScissor();
		}
		Ui.end();
		super.extractRenderState(g, mx, my, delta);
	}

	private void row(GuiGraphicsExtractor g, DungeonRun.Summary s, int x, int y, int w, SimpleDateFormat when) {
		Ui.round(g, x, y, w, ROW_H, 5, Ui.CARD);
		Ui.draw(g, DungeonRun.title(s, false), x + 8, y + 6, 0xFFFFA94D);
		Component date = Ui.text(when.format(new Date(s.at())) + " · " + DungeonRun.time(s.ms()));
		Ui.draw(g, date, x + w - 8 - Ui.width(date), y + 6, Ui.MUTED);
		// the numbers on one line: rooms, spawners, loot, ores, mobs (the time is by the date)
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
