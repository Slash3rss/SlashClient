package dev.slash3rss.slashclient.hud.chat;

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
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Chat tabs pulled out of the chat: each is a small chat window of its own, anywhere on the
 * screen, showing only that tab's lines. In the game new lines fade like the chat's; with the
 * chat open the window shows its history, can be dragged by its title and docked back.
 */
public final class ChatWindows {
	private ChatWindows() {}

	static final int WIDTH = 210, LINES = 8, TITLE = 13, LINE_H = 9;
	/** How small and how large a window can be dragged by its corner. */
	static final int MIN_WIDTH = 120, MAX_WIDTH = 420, MIN_LINES = 3, MAX_LINES = 20, GRIP = 7;
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

	/**
	 * Fills a window with the tab's lines from the chat's history (oldest first), as if it had been
	 * out all along: a freshly pulled-out tab, or after a restart. They count as old, so in the game
	 * they don't flash up; with the chat open they are there.
	 */
	static void backfill(HudConfig.ChatTab tab) {
		var chat = Compat.chat(Minecraft.getInstance());
		List<Object> all = ((dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) chat).slashclient$allMessages();
		ArrayDeque<Line> list = new ArrayDeque<>();
		// the history is newest first, with our time stamp in front of the text the tab matches
		for (Object o : all) {
			if (list.size() >= KEEP) break;
			Component shown = ((net.minecraft.client.multiplayer.chat.GuiMessage) o).content();
			String plain = shown.getString().replaceFirst("^\\[[0-9:]{4,8}\\] ", "");
			if (ChatTabs.matches(tab, plain)) list.addFirst(new Line(shown, 0L));
		}
		lines.put(tab.name, list);
	}

	static int height(float scale) {
		return Math.round((TITLE + LINES * LINE_H + 5) * scale);
	}

	static int width(float scale) {
		return Math.round(WIDTH * scale);
	}

	/** The window's width before its scale (the usual one until it is resized). */
	static int cols(HudConfig.ChatTab tab) {
		return tab.windowWidth > 0 ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, tab.windowWidth)) : WIDTH;
	}

	/** How many lines the window shows. */
	static int rows(HudConfig.ChatTab tab) {
		return tab.windowLines > 0 ? Math.max(MIN_LINES, Math.min(MAX_LINES, tab.windowLines)) : LINES;
	}

	static int width(HudConfig.ChatTab tab) {
		return Math.round(cols(tab) * tab.window.scale());
	}

	static int height(HudConfig.ChatTab tab) {
		return Math.round(inner(tab) * tab.window.scale());
	}

	/** The window's height before its scale: the title, its lines and, when the tab has one, the typing line; folded, the title alone. */
	public static int inner(HudConfig.ChatTab tab) {
		if (tab.collapsed) return TITLE;
		return TITLE + rows(tab) * LINE_H + 5 + (typing(tab) ? ChatTabInput.ROW : 0);
	}

	/** Whether the window has its typing line now: the tab has one and the window is not folded. */
	static boolean typing(HudConfig.ChatTab tab) {
		return tab.input && !tab.collapsed;
	}

	/** Where a window is on a screen of this size: its anchor plus offset, kept inside. */
	public static int[] at(HudConfig.ChatTab tab, int sw, int sh) {
		return SlashHud.position(tab.window, width(tab), height(tab), sw, sh);
	}

	/** Sets the window's place from where its top left corner should go (kept relative to the screen size). */
	static void moveTo(HudConfig.ChatTab tab, int x, int y, int sw, int sh) {
		int w = width(tab), h = height(tab);
		tab.window.ax = sw > w ? Math.max(0, Math.min(1, x / (float) (sw - w))) : 0;
		tab.window.ay = sh > h ? Math.max(0, Math.min(1, y / (float) (sh - h))) : 0;
		tab.window.dx = 0;
		tab.window.dy = 0;
	}

	/** Every window, from the HUD: faded lines in the game (the open chat draws them itself). */
	public static void draw(GuiGraphicsExtractor g, Minecraft mc) {
		if (Compat.screen(mc) instanceof ChatScreen) return;
		draw(g, mc, false);
	}

	/**
	 * Every whole window, from the open chat screen: there they show with the debug screen (F3) too,
	 * which hides the HUD's layer. With the whole GUI hidden (F1) they stay hidden, × buttons included.
	 */
	static void drawOpen(GuiGraphicsExtractor g, Minecraft mc) {
		if (Compat.hudHidden(mc)) return;
		draw(g, mc, true);
	}

	private static void draw(GuiGraphicsExtractor g, Minecraft mc, boolean open) {
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

	/** The text under the mouse in an open chat window (GUI coordinates), as the chat finds it under a click; null elsewhere. */
	public static net.minecraft.network.chat.Style styleAt(double mx, double my) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config == null || Compat.hudHidden(mc)) return null;
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null) continue;
			int[] p = at(tab, sw, sh);
			float s = tab.window.scale();
			double lx = (mx - p[0]) / s, ly = (my - p[1]) / s;
			int rows = rows(tab);
			if (lx < 0 || ly < 0 || lx >= cols(tab) || ly >= inner(tab)) continue;
			List<FormattedCharSequence> shown = visible(mc, tab, true, System.currentTimeMillis(), new ArrayList<>());
			int top = TITLE + 2 + (rows - shown.size()) * LINE_H;
			int row = (int) Math.floor((ly - top) / LINE_H);
			if (row < 0 || row >= shown.size()) return null;
			return styleAtWidth(mc, shown.get(row), lx - 5);
		}
		return null;
	}

	/** How far each window is scrolled back (rows), while the chat is open; back at the newest once it closes. */
	private static final Map<String, Integer> scrolled = new HashMap<>();

	/** The wheel over a window: three rows back (up) or forward (down) a notch. True when it was over a window. */
	public static boolean scroll(double mx, double my, double amount) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config == null || Compat.hudHidden(mc) || amount == 0) return false;
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null || tab.collapsed) continue;
			int[] p = at(tab, sw, sh);
			if (mx < p[0] || my < p[1] || mx >= p[0] + width(tab) || my >= p[1] + height(tab)) continue;
			int now = scrolled.getOrDefault(tab.name, 0);
			scrolled.put(tab.name, Math.max(0, now + (amount > 0 ? 3 : -3)));
			return true;
		}
		return false;
	}

	/** The chat closed: every window back at its newest lines. */
	static void scrollToNewest() {
		scrolled.clear();
	}

	/** How far a window is scrolled back (for the test). */
	public static int scrolledForTest(String tab) {
		return scrolled.getOrDefault(tab, 0);
	}

	/** The whole message under the mouse in an open chat window (GUI coordinates), with when it came: for copying it; null elsewhere. */
	public static Map.Entry<Component, Long> messageAt(double mx, double my) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config == null || Compat.hudHidden(mc)) return null;
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null) continue;
			int[] p = at(tab, sw, sh);
			float s = tab.window.scale();
			double lx = (mx - p[0]) / s, ly = (my - p[1]) / s;
			if (lx < 0 || ly < 0 || lx >= cols(tab) || ly >= inner(tab)) continue;
			List<Line> owners = new ArrayList<>();
			List<FormattedCharSequence> shown = visible(mc, tab, true, System.currentTimeMillis(), new ArrayList<>(), owners);
			int top = TITLE + 2 + (rows(tab) - shown.size()) * LINE_H;
			int row = (int) Math.floor((ly - top) / LINE_H);
			if (row < 0 || row >= owners.size()) return null;
			Line line = owners.get(row);
			return Map.entry(line.text(), line.at());
		}
		return null;
	}

	/** The style of the character `x` pixels into a line (the game's own helper for this is gone in newer versions). */
	private static net.minecraft.network.chat.Style styleAtWidth(Minecraft mc, FormattedCharSequence line, double x) {
		if (x < 0) return null;
		double[] at = { 0 };
		net.minecraft.network.chat.Style[] found = new net.minecraft.network.chat.Style[1];
		line.accept((index, style, cp) -> {
			at[0] += mc.font.width(Component.literal(new String(Character.toChars(cp))).setStyle(style));
			if (at[0] > x) {
				found[0] = style;
				return false;
			}
			return true;
		});
		return found[0];
	}

	/** The newest lines of a window that fit, broken to its width, oldest first (with how faded each is). */
	private static List<FormattedCharSequence> visible(Minecraft mc, HudConfig.ChatTab tab, boolean open, long now, List<Float> alpha) {
		return visible(mc, tab, open, now, alpha, new ArrayList<>());
	}

	/** The same, with the message each shown row is part of (`owners`, row by row). */
	private static List<FormattedCharSequence> visible(Minecraft mc, HudConfig.ChatTab tab, boolean open, long now, List<Float> alpha, List<Line> owners) {
		var font = mc.font;
		int w = cols(tab), rows = rows(tab);
		List<FormattedCharSequence> shown = new ArrayList<>();
		// folded: no lines to show (nor to click or copy)
		if (tab.collapsed) return shown;
		// first sight of a window (the game just started): what the chat already holds for it
		if (!lines.containsKey(tab.name)) backfill(tab);
		ArrayDeque<Line> list = lines.getOrDefault(tab.name, new ArrayDeque<>());
		// scrolled back (the wheel, while the chat is open): that many of the newest rows left out
		int skip = open ? scrolled.getOrDefault(tab.name, 0) : 0, seen = 0;
		var it = list.descendingIterator();
		while (it.hasNext() && shown.size() < rows) {
			Line line = it.next();
			long age = now - line.at();
			if (!open && age > SHOW_MS) break;
			float a = open ? 1f : Math.min(1f, (SHOW_MS - age) / 1000f);
			List<FormattedCharSequence> parts = font.split(line.text(), w - 10);
			for (int i = parts.size() - 1; i >= 0 && shown.size() < rows; i--) {
				if (seen++ < skip) continue;
				shown.add(0, parts.get(i));
				alpha.add(0, a);
				owners.add(0, line);
			}
		}
		// scrolled past the oldest line: back to where the oldest fills the window
		if (skip > 0 && shown.size() < rows) scrolled.put(tab.name, Math.max(0, seen - rows));
		return shown;
	}

	private static void drawWindow(GuiGraphicsExtractor g, Minecraft mc, HudConfig.ChatTab tab, boolean open, long now) {
		var font = mc.font;
		int w = cols(tab), rows = rows(tab), h = inner(tab);
		if (tab.collapsed) {
			// folded: its title only while the chat is open, nothing in the game
			if (!open) return;
			Ui.round(g, 0, 0, w, h, 6, 0xC00B0F18);
			Ui.roundOutline(g, 0, 0, w, h, 6, Ui.BORDER);
			Ui.icon(g, "chat", 5, 3, 7, Ui.ACCENT_LIGHT);
			Ui.draw(g, Ui.fit(Ui.bold(tab.name), w - 52), 16, 3, Ui.TEXT);
			Ui.icon(g, "arrow-down", w - 28, 3, 7, Ui.MUTED);
			return;
		}
		// in the game the lines sit at the bottom, where the typing line is when the chat is open
		int bottom = h - (typing(tab) ? ChatTabInput.ROW : 0);
		List<Float> alpha = new ArrayList<>();
		List<FormattedCharSequence> shown = visible(mc, tab, open, now, alpha);
		if (!open && shown.isEmpty()) return;

		int n = shown.size();
		int y = open ? TITLE + 2 + (rows - n) * LINE_H : bottom - 3 - n * LINE_H;
		if (open) {
			Ui.round(g, 0, 0, w, h, 6, 0xC00B0F18);
			Ui.roundOutline(g, 0, 0, w, h, 6, Ui.BORDER);
			Ui.round(g, 1, 1, w - 2, TITLE - 1, 5, 0x14FFFFFF);
			Ui.icon(g, "chat", 5, 3, 7, Ui.ACCENT_LIGHT);
			Ui.draw(g, Ui.fit(Ui.bold(tab.name), w - 40), 16, 3, Ui.TEXT);
			// scrolled back: an arrow saying newer lines are below
			if (scrolled.getOrDefault(tab.name, 0) > 0) Ui.icon(g, "arrow-down", w - 28, 3, 7, Ui.ACCENT_LIGHT);
		} else {
			// in the game: only a soft backing under the visible lines, like the chat's
			Ui.round(g, 0, y - 2, w, bottom - y + 2, 5, 0x60000000);
		}
		for (int i = 0; i < shown.size(); i++) {
			int a = Math.round(255 * alpha.get(i));
			if (a < 8) continue;
			g.text(font, shown.get(i), 5, y + i * LINE_H, (a << 24) | 0xFFFFFF, true);
		}
		if (open && shown.isEmpty()) {
			Component empty = Ui.tr("slashclient-hud.chat.window.empty");
			Ui.centered(g, Ui.fit(empty, w - 12), w / 2, TITLE + (bottom - TITLE) / 2 - 4, Ui.MUTED);
		}
		if (open && typing(tab)) ChatTabInput.drawRow(g, tab, w, h, ChatTabInput.focused(tab));
		if (open) {
			// the corner to drag for another size: three short diagonal steps
			int c = 0x99FFFFFF;
			for (int i = 0; i < 3; i++) g.fill(w - 3 - i * 2, h - 3, w - 2, h - 2 - i * 2, c);
		}
	}

	/** The open chat: a handle over each window's title to drag it, and a button to dock it back. */
	static void addHandles(net.minecraft.client.gui.screens.Screen screen, int sw, int sh, Runnable docked) {
		if (Compat.hudHidden(Minecraft.getInstance())) return;
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (tab.window == null) continue;
			int[] p = at(tab, sw, sh);
			int w = width(tab), th = Math.round(TITLE * tab.window.scale());
			Button dock = new ChatTabButton(p[0] + w - 15, p[1] + 1, 14, Math.max(9, th - 2), () -> Component.empty(), () -> 0, () -> false, "close", b -> {
				tab.window = null;
				lines.remove(tab.name);
				SlashHud.config.save();
				ChatTabs.changed();
				docked.run();
			});
			dock.setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.translatable("slashclient-hud.chat.window.dock")));
			Handle handle = new Handle(tab, p[0], p[1], w - 16, th, dock, sw, sh, docked);
			net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen).add(handle);
			net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen).add(dock);
			// a folded window has no corner to size it by
			if (tab.collapsed) continue;
			int grip = Math.max(6, Math.round(GRIP * tab.window.scale()));
			Resize resize = new Resize(tab, p[0] + w - grip, p[1] + height(tab) - grip, grip, handle, dock, sw, sh);
			handle.resize = resize;
			net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen).add(resize);
		}
	}

	/** An invisible strip over a window's title: dragging it moves the window, a click folds it to the title (and back). */
	private static final class Handle extends Button {
		private final HudConfig.ChatTab tab;
		private final Button dock;
		private final int sw, sh;
		/** The widgets made anew for the window's new size. */
		private final Runnable changed;
		private double grabX, grabY, pressX, pressY;
		/** Dragged further than a click's wobble: a move, not a fold. */
		private boolean moved;
		/** The corner grip, moved along with the window. */
		Resize resize;

		Handle(HudConfig.ChatTab tab, int x, int y, int w, int h, Button dock, int sw, int sh, Runnable changed) {
			super(x, y, w, h, Component.literal(tab.name), b -> {}, DEFAULT_NARRATION);
			this.tab = tab;
			this.dock = dock;
			this.sw = sw;
			this.sh = sh;
			this.changed = changed;
			setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.translatable(tab.collapsed ? "slashclient-hud.chat.window.unfold" : "slashclient-hud.chat.window.fold")));
		}

		/** Only the mouse moves it: the arrow keys stay with the chat's history. */
		@Override
		public net.minecraft.client.gui.ComponentPath nextFocusPath(net.minecraft.client.gui.navigation.FocusNavigationEvent event) {
			return null;
		}

		@Override
		//#if MC >= 1.21.9
		public void onClick(MouseButtonEvent e, boolean doubleClick) {
		//#else
		//$ public void onClick(double mouseX, double mouseY) {
		//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
		//$ 	boolean doubleClick = false;
		//#endif
			grabX = e.x() - getX();
			grabY = e.y() - getY();
			pressX = e.x();
			pressY = e.y();
			moved = false;
		}

		@Override
		//#if MC >= 1.21.9
		protected void onDrag(MouseButtonEvent e, double dx, double dy) {
		//#else
		//$ protected void onDrag(double mouseX, double mouseY, double dx, double dy) {
		//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
		//#endif
			if (!moved && Math.abs(e.x() - pressX) < 3 && Math.abs(e.y() - pressY) < 3) return;
			moved = true;
			moveTo(tab, (int) Math.round(e.x() - grabX), (int) Math.round(e.y() - grabY), sw, sh);
			int[] p = at(tab, sw, sh);
			setX(p[0]);
			setY(p[1]);
			dock.setX(p[0] + width(tab) - 15);
			dock.setY(p[1] + 1);
			if (resize != null) resize.follow(p);
		}

		@Override
		//#if MC >= 1.21.9
		public void onRelease(MouseButtonEvent e) {
		//#else
		//$ public void onRelease(double mouseX, double mouseY) {
		//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
		//#endif
			if (!moved) {
				// the title stays where it is, whichever edge the window is kept by
				int[] before = at(tab, sw, sh);
				tab.collapsed = !tab.collapsed;
				moveTo(tab, before[0], before[1], sw, sh);
				changed.run();
			}
			SlashHud.config.save();
		}

		@Override
		protected void extractContents(GuiGraphicsExtractor g, int mx, int my, float delta) {
			// the window draws itself (from the HUD); this only shows the hand cursor's place
			if (isHovered()) Ui.round(g, getX(), getY(), getWidth(), getHeight(), 5, 0x10FFFFFF);
		}
	}

	/** The window's bottom right corner: dragging it changes the width and how many lines it shows. */
	static final class Resize extends Button {
		private final HudConfig.ChatTab tab;
		private final Handle handle;
		private final Button dock;
		private final int sw, sh, size;
		private double startX, startY;
		private int startCols, startRows, left, top;

		Resize(HudConfig.ChatTab tab, int x, int y, int size, Handle handle, Button dock, int sw, int sh) {
			super(x, y, size, size, Component.translatable("slashclient-hud.chat.window.resize"), b -> {}, DEFAULT_NARRATION);
			this.tab = tab;
			this.handle = handle;
			this.dock = dock;
			this.sw = sw;
			this.sh = sh;
			this.size = size;
			setTooltip(net.minecraft.client.gui.components.Tooltip.create(Component.translatable("slashclient-hud.chat.window.resize")));
		}

		@Override
		public net.minecraft.client.gui.ComponentPath nextFocusPath(net.minecraft.client.gui.navigation.FocusNavigationEvent event) {
			return null;
		}

		@Override
		//#if MC >= 1.21.9
		public void onClick(MouseButtonEvent e, boolean doubleClick) {
		//#else
		//$ public void onClick(double mouseX, double mouseY) {
		//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
		//$ 	boolean doubleClick = false;
		//#endif
			startX = e.x();
			startY = e.y();
			startCols = cols(tab);
			startRows = rows(tab);
			int[] p = at(tab, sw, sh);
			left = p[0];
			top = p[1];
		}

		@Override
		//#if MC >= 1.21.9
		protected void onDrag(MouseButtonEvent e, double dx, double dy) {
		//#else
		//$ protected void onDrag(double mouseX, double mouseY, double dx, double dy) {
		//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
		//#endif
			float s = tab.window.scale();
			tab.windowWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, (int) Math.round(startCols + (e.x() - startX) / s)));
			tab.windowLines = Math.max(MIN_LINES, Math.min(MAX_LINES, startRows + (int) Math.round((e.y() - startY) / s / LINE_H)));
			// the top left corner stays where it was; the window grows to the right and down
			moveTo(tab, left, top, sw, sh);
			int[] p = at(tab, sw, sh);
			handle.setX(p[0]);
			handle.setY(p[1]);
			handle.setWidth(width(tab) - 16);
			dock.setX(p[0] + width(tab) - 15);
			dock.setY(p[1] + 1);
			follow(p);
		}

		/** Back to the window's corner (after it moved or changed size). */
		void follow(int[] p) {
			setX(p[0] + width(tab) - size);
			setY(p[1] + height(tab) - size);
		}

		@Override
		//#if MC >= 1.21.9
		public void onRelease(MouseButtonEvent e) {
		//#else
		//$ public void onRelease(double mouseX, double mouseY) {
		//$ 	var e = new net.minecraft.client.input.MouseButtonEvent(mouseX, mouseY, 0);
		//#endif
			SlashHud.config.save();
		}

		@Override
		protected void extractContents(GuiGraphicsExtractor g, int mx, int my, float delta) {
			// the window draws the grip itself; this only lights it up under the mouse
			if (isHovered()) Ui.round(g, getX(), getY(), getWidth(), getHeight(), 2, 0x30FFFFFF);
		}
	}

	/** For the test: the window's width and lines. */
	public static String sizeOf(String name) {
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) if (tab.name.equals(name) && tab.window != null) return cols(tab) + "x" + rows(tab);
		return "none";
	}

	/** For the test: the middle of a window's corner grip. */
	public static double[] gripOf(String name, int sw, int sh) {
		for (HudConfig.ChatTab tab : SlashHud.config.chatTabs) {
			if (!tab.name.equals(name) || tab.window == null) continue;
			int[] p = at(tab, sw, sh);
			int grip = Math.max(6, Math.round(GRIP * tab.window.scale()));
			return new double[] { p[0] + width(tab) - grip / 2.0, p[1] + height(tab) - grip / 2.0 };
		}
		return null;
	}

	/** For the test. */
	public static int linesOf(String tab) {
		return lines.getOrDefault(tab, new ArrayDeque<>()).size();
	}
}
