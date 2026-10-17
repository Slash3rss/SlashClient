package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.util.FormattedCharSequence;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Chat tabs pulled out of the chat: each is a small chat window of its own, anywhere on the
 * screen, showing only that tab's lines. In the game new lines fade like the chat's; with the
 * chat open the window shows its history, can be dragged by its title and docked back.
 */
public final class ChatWindows {
	private ChatWindows() {}

	static final int WIDTH = 210, LINES = 8, TITLE = 13, LINE_H = 9;
	private static final long SHOW_MS = 10_000;
	private static final int KEEP = 100;

	private record Line(Component text, long at) {}

	/** Recent lines per tab name (names survive reordering better than indexes). */
	private static final Map<String, ArrayDeque<Line>> lines = new HashMap<>();

	/** A line as the chat shows it (with its time stamp), kept for the windows whose tab catches it. */
	public static void onLine(String plain, Component shown) {
		long now = System.currentTimeMillis();
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null || !ChatTabs.matches(tab, plain)) continue;
			ArrayDeque<Line> list = lines.computeIfAbsent(tab.name, k -> new ArrayDeque<>());
			list.addLast(new Line(shown, now));
			while (list.size() > KEEP) list.removeFirst();
		}
	}

	static int height(float scale) {
		return Math.round((TITLE + LINES * LINE_H + 5) * scale);
	}

	static int width(float scale) {
		return Math.round(WIDTH * scale);
	}

	/** Where a window is on a screen of this size: its anchor plus offset, kept inside. */
	static int[] at(HudConfig.ChatTab tab, int sw, int sh) {
		float s = tab.window.scale();
		return SlashHud.position(tab.window, width(s), height(s), sw, sh);
	}

	/** Sets the window's place from where its top left corner should go (kept relative to the screen size). */
	static void moveTo(HudConfig.ChatTab tab, int x, int y, int sw, int sh) {
		float s = tab.window.scale();
		int w = width(s), h = height(s);
		tab.window.ax = sw > w ? Math.max(0, Math.min(1, x / (float) (sw - w))) : 0;
		tab.window.ay = sh > h ? Math.max(0, Math.min(1, y / (float) (sh - h))) : 0;
		tab.window.dx = 0;
		tab.window.dy = 0;
	}

	/** Every window, from the HUD: faded lines in the game, the whole window with the chat open. */
	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		boolean open = Compat.screen(mc) instanceof ChatScreen;
		long now = System.currentTimeMillis();
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null) continue;
			int[] p = at(tab, g.guiWidth(), g.guiHeight());
			float s = tab.window.scale();
			var pose = g.pose();
			pose.pushMatrix();
			pose.translate(p[0], p[1]);
			pose.scale(s, s);
			drawWindow(g, mc, tab, open, now);
			pose.popMatrix();
		}
	}

	private static void drawWindow(GuiGraphicsExtractor g, Minecraft mc, HudConfig.ChatTab tab, boolean open, long now) {
		var font = mc.font;
		int w = WIDTH, h = TITLE + LINES * LINE_H + 5;
		// the newest lines that fit, broken to the window's width, oldest first
		List<FormattedCharSequence> shown = new ArrayList<>();
		List<Float> alpha = new ArrayList<>();
		ArrayDeque<Line> list = lines.getOrDefault(tab.name, new ArrayDeque<>());
		var it = list.descendingIterator();
		while (it.hasNext() && shown.size() < LINES) {
			Line line = it.next();
			long age = now - line.at();
			if (!open && age > SHOW_MS) break;
			float a = open ? 1f : Math.min(1f, (SHOW_MS - age) / 1000f);
			List<FormattedCharSequence> parts = font.split(line.text(), w - 10);
			for (int i = parts.size() - 1; i >= 0 && shown.size() < LINES; i--) {
				shown.add(0, parts.get(i));
				alpha.add(0, a);
			}
		}
		if (!open && shown.isEmpty()) return;

		int n = shown.size();
		int y = open ? TITLE + 2 + (LINES - n) * LINE_H : h - 3 - n * LINE_H;
		if (open) {
			Ui.round(g, 0, 0, w, h, 6, 0xC00B0F18);
			Ui.roundOutline(g, 0, 0, w, h, 6, Ui.BORDER);
			Ui.round(g, 1, 1, w - 2, TITLE - 1, 5, 0x14FFFFFF);
			Ui.icon(g, "chat", 5, 3, 7, Ui.ACCENT_LIGHT);
			Ui.draw(g, Ui.fit(Ui.bold(tab.name), w - 40), 16, 3, Ui.TEXT);
		} else {
			// in the game: only a soft backing under the visible lines, like the chat's
			Ui.round(g, 0, y - 2, w, h - y + 2, 5, 0x60000000);
		}
		for (int i = 0; i < shown.size(); i++) {
			int a = Math.round(255 * alpha.get(i));
			if (a < 8) continue;
			g.text(font, shown.get(i), 5, y + i * LINE_H, (a << 24) | 0xFFFFFF, true);
		}
		if (open && shown.isEmpty()) {
			Component empty = Ui.tr("slashclient-hud.chat.window.empty");
			Ui.centered(g, Ui.fit(empty, w - 12), w / 2, TITLE + (h - TITLE) / 2 - 4, Ui.MUTED);
		}
	}

	/** The open chat: a handle over each window's title to drag it, and a button to dock it back. */
	static void addHandles(net.minecraft.client.gui.screens.Screen screen, int sw, int sh, Runnable docked) {
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null) continue;
			int[] p = at(tab, sw, sh);
			int w = width(tab.window.scale()), th = Math.round(TITLE * tab.window.scale());
			Button dock = new ChatTabButton(p[0] + w - 15, p[1] + 1, 14, Math.max(9, th - 2), () -> Component.empty(), () -> 0, () -> false, "close", b -> {
				tab.window = null;
				lines.remove(tab.name);
				SlashHud.config.save();
				ChatTabs.changed();
				docked.run();
			});
			dock.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.translatable("slashclient-hud.chat.window.dock")));
			Handle handle = new Handle(tab, p[0], p[1], w - 16, th, dock, sw, sh);
			net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen).add(handle);
			net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen).add(dock);
		}
	}

	/** An invisible strip over a window's title: dragging it moves the window. */
	private static final class Handle extends Button {
		private final HudConfig.ChatTab tab;
		private final Button dock;
		private final int sw, sh;
		private double grabX, grabY;

		Handle(HudConfig.ChatTab tab, int x, int y, int w, int h, Button dock, int sw, int sh) {
			super(x, y, w, h, Component.literal(tab.name), b -> {}, DEFAULT_NARRATION);
			this.tab = tab;
			this.dock = dock;
			this.sw = sw;
			this.sh = sh;
		}

		@Override
		public void onClick(MouseButtonEvent e, boolean doubleClick) {
			grabX = e.x() - getX();
			grabY = e.y() - getY();
		}

		@Override
		protected void onDrag(MouseButtonEvent e, double dx, double dy) {
			moveTo(tab, (int) Math.round(e.x() - grabX), (int) Math.round(e.y() - grabY), sw, sh);
			int[] p = at(tab, sw, sh);
			setX(p[0]);
			setY(p[1]);
			dock.setX(p[0] + width(tab.window.scale()) - 15);
			dock.setY(p[1] + 1);
		}

		@Override
		public void onRelease(MouseButtonEvent e) {
			SlashHud.config.save();
		}

		@Override
		protected void extractContents(GuiGraphicsExtractor g, int mx, int my, float delta) {
			// the window draws itself (from the HUD); this only shows the hand cursor's place
			if (isHovered()) Ui.round(g, getX(), getY(), getWidth(), getHeight(), 5, 0x10FFFFFF);
		}
	}

	/** For the test. */
	public static int linesOf(String tab) {
		return lines.getOrDefault(tab, new ArrayDeque<>()).size();
	}
}
