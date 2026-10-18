package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * The game's own HUD parts as boxes in the editor: the scoreboard, the boss bar, the tab list and
 * the action bar are dragged like modules. The game still draws them; GameHud only shifts its
 * drawing from where the game puts it to where the box is, and scales it. Out of the editor the
 * boxes draw nothing.
 */
public final class GameParts {
	private GameParts() {}

	/** One part: its box in the editor, and the point of the screen the game draws it around. */
	public abstract static class Part implements HudModule {
		private final String id;
		private final int baseW, baseH;

		Part(String id, int baseW, int baseH) {
			this.id = id;
			this.baseW = baseW;
			this.baseH = baseH;
		}

		@Override
		public String id() {
			return id;
		}

		/** The part's own size slider (the settings card's), not the module scale. */
		abstract float scale();

		/** Shown: switched on in its card and not hidden in the editor. */
		abstract boolean on();

		@Override
		public boolean visible(Minecraft mc) {
			// never drawn in the game: the game draws the part itself
			return false;
		}

		@Override
		public int width(Minecraft mc) {
			return Math.round(baseW * scale());
		}

		@Override
		public int height(Minecraft mc) {
			return Math.round(baseH * scale());
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {}

		/** A see-through box with the part's name and a hint of what it shows. */
		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			int w = width(mc), h = height(mc);
			g.fill(x, y, x + w, y + h, 0x50101828);
			Ui.roundOutline(g, x, y, w, h, 2, 0x8060A5FA);
			Component name = Ui.tr("slashclient-hud.part." + id);
			sample(g, mc, x, y, w, h);
			Ui.draw(g, Ui.fit(name, w - 6), x + (w - Math.min(Ui.width(name), w - 6)) / 2, y + 3, Ui.TEXT);
		}

		/** What it looks like, roughly. */
		void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {}

		/** The anchor of the box (x, y within it), the same point of the part as `screenAnchor`. */
		abstract float[] boxAnchor(int w, int h);

		/** Where on the screen the game draws the part around (its anchor). */
		abstract float[] screenAnchor(int screenW, int screenH);
	}

	/** In the middle of the right edge. */
	static final Part SCOREBOARD = new Part("scoreboard", 100, 90) {
		@Override float scale() { return SlashHud.config.scoreboardScale; }
		@Override boolean on() { return SlashHud.config.scoreboard && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w, h / 2f }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw, sh / 2f }; }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			for (int i = 0; i < 5 && 16 + i * 12 < h; i++) g.fill(x + 6, y + 16 + i * 12, x + w - 6 - (i % 3) * 14, y + 20 + i * 12, 0x40FFFFFF);
		}
	};

	/** Hanging from the top middle. */
	static final Part BOSS_BAR = new Part("bossbar", 182, 20) {
		@Override float scale() { return SlashHud.config.bossBarScale; }
		@Override boolean on() { return SlashHud.config.bossBar && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, 0 }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, 0 }; }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			g.fill(x + 2, y + h - 6, x + w - 2, y + h - 2, 0x60EC4899);
		}
	};

	/** Hanging from the top middle, over the boss bar. */
	static final Part TAB_LIST = new Part("tablist", 240, 70) {
		@Override float scale() { return SlashHud.config.tabScale; }
		@Override boolean on() { return SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, 0 }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, 0 }; }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			for (int i = 0; i < 4 && 16 + i * 12 < h; i++) {
				g.fill(x + 6, y + 16 + i * 12, x + w / 2 - 6, y + 24 + i * 12, 0x30FFFFFF);
				g.fill(x + w / 2 + 6, y + 16 + i * 12, x + w - 6, y + 24 + i * 12, 0x30FFFFFF);
			}
		}
	};

	/** Above the hotbar (the "action bar": a server's short messages, "You may not rest now"…). */
	static final Part ACTION_BAR = new Part("actionbar", 180, 14) {
		@Override float scale() { return SlashHud.config.actionBarScale; }
		@Override boolean on() { return SlashHud.config.actionBar && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, h / 2f }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, sh - 68 }; }
	};

	//#if MC >= 1.20.2
	static final List<Part> ALL = List.of(SCOREBOARD, BOSS_BAR, TAB_LIST, ACTION_BAR);
	//#else
	//$ // 1.20.1 draws the action bar inline in Gui.render: it cannot be moved there
	//$ static final List<Part> ALL = List.of(SCOREBOARD, BOSS_BAR, TAB_LIST);
	//#endif

	/**
	 * Where each part's box starts, so that the game's own position comes out: the scoreboard on
	 * the right edge (moved by the old offset slider, when it was used), the others where the game
	 * draws them.
	 */
	static void defaults(HudConfig cfg) {
		cfg.modules.putIfAbsent("scoreboard", new HudConfig.Placement(true, 1f, 0.5f, 0, cfg.scoreboardOffset));
		cfg.modules.putIfAbsent("bossbar", new HudConfig.Placement(true, 0.5f, 0f, 0, cfg.bossBarOffset));
		cfg.modules.putIfAbsent("tablist", new HudConfig.Placement(true, 0.5f, 0f, 0, 0));
		// the box's middle on the line the game centres the message on (68 above the bottom)
		cfg.modules.putIfAbsent("actionbar", new HudConfig.Placement(true, 0.5f, 1f, 0, -68 + 7));
	}
}
