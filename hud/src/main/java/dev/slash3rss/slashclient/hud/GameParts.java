package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * The game's own HUD parts as boxes in the editor: the scoreboard, the boss bar, the tab list,
 * the action bar and the titles are dragged like modules. The game still draws them; GameHud only
 * shifts its drawing from where the game puts it to where the box is, and scales it. Out of the
 * editor the boxes draw nothing. In it, a part the game has something for shows that (the tab
 * list as if Tab were held); one it has nothing for shows a made-up sample.
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

		/** The game has something to show in it now (then the editor shows that, not a sample). */
		boolean real(Minecraft mc) {
			return false;
		}

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
			boolean real = real(mc);
			if (!real) {
				g.fill(x, y, x + w, y + h, 0x50101828);
				sample(g, mc, x, y, w, h);
			}
			Ui.roundOutline(g, x, y, w, h, 2, 0x8060A5FA);
			Component name = Ui.fit(Ui.tr("slashclient-hud.part." + id), w - 6);
			int nw = Ui.width(name), nx = x + (w - nw) / 2;
			// over the real thing, the name on a plate of its own
			if (real) g.fill(nx - 2, y + 1, nx + nw + 2, y + 12, 0xC0101828);
			Ui.draw(g, name, nx, y + 3, Ui.TEXT);
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
		@Override boolean real(Minecraft mc) { return Compat.displayed(mc, true) != null; }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			// lines with their scores, as a server's sidebar looks
			for (int i = 0; i < 6 && 16 + i * 11 + 8 < h; i++) {
				Ui.draw(g, Component.literal(Ui.tr("slashclient-hud.part.sample.line").getString() + " " + (i + 1)), x + 5, y + 16 + i * 11, 0xFFAAAAAA);
				String score = String.valueOf(6 - i);
				Ui.draw(g, Component.literal(score), x + w - 5 - Ui.width(Component.literal(score)), y + 16 + i * 11, 0xFFFF5555);
			}
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
		@Override boolean real(Minecraft mc) { return mc.getConnection() != null && mc.level != null && !mc.getConnection().getOnlinePlayers().isEmpty(); }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			// two columns of players, each with a face and the ping
			String player = Ui.tr("slashclient-hud.part.sample.player").getString();
			for (int i = 0; i < 8 && 16 + (i / 2) * 11 + 9 < h; i++) {
				int cx = x + 6 + (i % 2) * (w / 2), cy = y + 16 + (i / 2) * 11;
				g.fill(cx - 1, cy - 1, cx + w / 2 - 11, cy + 9, 0x30FFFFFF);
				g.fill(cx, cy, cx + 8, cy + 8, 0xFF6B7280);
				Ui.draw(g, Component.literal(player + " " + (i + 1)), cx + 10, cy, 0xFFFFFFFF);
				g.fill(cx + w / 2 - 20, cy + 2, cx + w / 2 - 13, cy + 6, 0xFF55FF55);
			}
		}
	};

	/** Above the hotbar (the "action bar": a server's short messages, "You may not rest now"…). */
	static final Part ACTION_BAR = new Part("actionbar", 180, 14) {
		@Override float scale() { return SlashHud.config.actionBarScale; }
		@Override boolean on() { return SlashHud.config.actionBar && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, h / 2f }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, sh - 68 }; }
		@Override boolean real(Minecraft mc) { return Compat.actionBarShown(mc); }
	};

	/** In the middle of the screen: a title and its subtitle. */
	static final Part TITLES = new Part("titles", 200, 56) {
		@Override float scale() { return SlashHud.config.titleScale; }
		@Override boolean on() { return SlashHud.config.titles && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, h / 2f }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, sh / 2f }; }
		@Override boolean real(Minecraft mc) { return Compat.titleShown(mc); }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			// the title twice the size, the subtitle under it
			Component title = Ui.tr("slashclient-hud.part.sample.title"), subtitle = Ui.tr("slashclient-hud.part.sample.subtitle");
			var pose = g.pose();
			pose.pushMatrix();
			pose.translate(x + w / 2f, y + 16);
			pose.scale(2f, 2f);
			Ui.draw(g, title, -Ui.width(title) / 2, 0, 0xFFFFFFFF);
			pose.popMatrix();
			Ui.draw(g, subtitle, x + (w - Ui.width(subtitle)) / 2, y + 38, 0xFFAAAAAA);
		}
	};

	/** In the top right corner: the toasts (advancements, recipes, friends' messages…), one under another. */
	static final Part TOASTS = new Part("toasts", 160, 64) {
		@Override float scale() { return 1f; }
		@Override boolean on() { return SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w, 0 }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw, 0 }; }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			// two toasts, as the game stacks them
			for (int i = 0; i < 2; i++) {
				int ty = y + i * 32;
				g.fill(x + 2, ty + 2, x + w - 2, ty + 30, 0x40FFFFFF);
				g.fill(x + 8, ty + 8, x + 24, ty + 24, 0xFF6B7280);
				Ui.draw(g, Ui.tr("slashclient-hud.part.sample.toast"), x + 30, ty + 12 + (i == 0 ? 2 : 0), 0xFFFFFF55);
			}
		}
	};

	//#if MC >= 1.20.2
	static final List<Part> ALL = List.of(SCOREBOARD, BOSS_BAR, TAB_LIST, ACTION_BAR, TITLES, TOASTS);
	//#else
	//$ // 1.20.1 draws the action bar inline in Gui.render: it cannot be moved there
	//$ static final List<Part> ALL = List.of(SCOREBOARD, BOSS_BAR, TAB_LIST, TITLES, TOASTS);
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
		cfg.modules.putIfAbsent("titles", new HudConfig.Placement(true, 0.5f, 0.5f, 0, 0));
		cfg.modules.putIfAbsent("toasts", new HudConfig.Placement(true, 1f, 0f, 0, 0));
		// the box's middle on the line the game centres the message on (68 above the bottom)
		cfg.modules.putIfAbsent("actionbar", new HudConfig.Placement(true, 0.5f, 1f, 0, -68 + 7));
	}
}
