package dev.slash3rss.slashclient.hud.gamehud;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.SlashHud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.PlayerTeam;
import net.minecraft.world.scores.Scoreboard;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;

import java.util.List;
import dev.slash3rss.slashclient.hud.chat.ChatLook;

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
		public abstract boolean on();

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
			int[] r = drawn(mc, mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
			return Math.round((r != null ? r[2] - r[0] : baseW) * scale());
		}

		@Override
		public int height(Minecraft mc) {
			int[] r = drawn(mc, mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
			return Math.round((r != null ? r[3] - r[1] : baseH) * scale());
		}

		/**
		 * Where the game draws the part now on a screen of that size (left, top, right, bottom), or
		 * null when it has nothing for it or the part has no measure (then the box is the base size).
		 */
		final int[] drawn(Minecraft mc, int screenW, int screenH) {
			return real(mc) ? measure(mc, screenW, screenH) : null;
		}

		/** The game's own measure of what it draws, as `drawn`; only asked while `real`. */
		int[] measure(Minecraft mc, int screenW, int screenH) {
			return null;
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

	/** In the middle of the right edge (a little below it: the game puts a third of the lines' height under the middle). */
	static final Part SCOREBOARD = new Part("scoreboard", 100, 90) {
		@Override float scale() { return SlashHud.config.scoreboardScale; }
		@Override public boolean on() { return SlashHud.config.scoreboard && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w, h / 2f }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw, sh / 2f }; }
		@Override boolean real(Minecraft mc) { return Compat.displayed(mc, true) != null; }
		@Override int[] measure(Minecraft mc, int sw, int sh) { return scoreboardDrawn(mc, Compat.displayed(mc, true), sw, sh); }
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
		@Override public boolean on() { return SlashHud.config.bossBar && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, 0 }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, 0 }; }
		@Override void sample(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h) {
			g.fill(x + 2, y + h - 6, x + w - 2, y + h - 2, 0x60EC4899);
		}
	};

	/** Hanging from the top middle, over the boss bar. */
	static final Part TAB_LIST = new Part("tablist", 240, 70) {
		@Override float scale() { return SlashHud.config.tabScale; }
		@Override public boolean on() { return SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, 0 }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, 0 }; }
		@Override boolean real(Minecraft mc) { return mc.getConnection() != null && mc.level != null && mc.player != null && !mc.getConnection().getListedOnlinePlayers().isEmpty(); }
		@Override int[] measure(Minecraft mc, int sw, int sh) { return tabListDrawn(mc, sw); }
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
		@Override public boolean on() { return SlashHud.config.actionBar && SlashHud.config.placement(id()).enabled; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { w / 2f, h / 2f }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { sw / 2f, sh - 68 }; }
		@Override boolean real(Minecraft mc) { return Compat.actionBarShown(mc); }
	};

	/** In the middle of the screen: a title and its subtitle. */
	public static final Part TITLES = new Part("titles", 200, 56) {
		@Override float scale() { return SlashHud.config.titleScale; }
		@Override public boolean on() { return SlashHud.config.titles && SlashHud.config.placement(id()).enabled; }
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
		@Override public boolean on() { return SlashHud.config.placement(id()).enabled; }
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

	/**
	 * The chat, bottom left: not moved (its lines are clicked where the game draws them), only
	 * sized and made more or less see-through from its card (ChatLook). Its box is the full closed
	 * chat at that size; its × hides the chat until it is opened.
	 */
	public static final Part CHAT = new Part("chat", 320, 90) {
		@Override float scale() { return 1f; }
		@Override public boolean on() { return SlashHud.config.placement(id()).enabled; }
		@Override boolean real(Minecraft mc) { return true; }
		@Override float[] boxAnchor(int w, int h) { return new float[] { 0, h }; }
		@Override float[] screenAnchor(int sw, int sh) { return new float[] { 0, sh - 40 }; }
		@Override public int width(Minecraft mc) {
			int[] b = ChatLook.box(mc, mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
			return b[2] - b[0];
		}
		@Override public int height(Minecraft mc) {
			// from the top of its highest line down to where the placement puts the bottom (40 above the screen's)
			int sh = mc.getWindow().getGuiScaledHeight();
			return sh - 40 - ChatLook.box(mc, mc.getWindow().getGuiScaledWidth(), sh)[1];
		}
		@Override public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			int[] at = SlashHud.position(SlashHud.config.placement(id()), width(mc), height(mc), g.guiWidth(), g.guiHeight());
			ChatLook.preview(g, mc, at[0], at[1]);
			super.drawPreview(g, mc, x, y);
		}
	};

	/** Parts that stay where the game draws them: the editor does not drag them. */
	public static boolean fixed(HudModule m) {
		return m == CHAT;
	}

	/**
	 * The scoreboard as the game lays it out (Gui.displayScoreboardSidebar): as wide as the title
	 * or the widest "name: score" line, 9 pixels a line for at most 15 lines and the title, the
	 * bottom a third of the lines' height under the middle, 1 pixel off the right edge.
	 */
	static int[] scoreboardDrawn(Minecraft mc, Objective objective, int sw, int sh) {
		Font font = mc.font;
		Scoreboard board = objective.getScoreboard();
		int wide = font.width(objective.getDisplayName()), colon = font.width(": "), lines;
		//#if MC >= 1.20.2
		// the hidden lines left out, the numbers in the objective's format (blank when switched off in the card)
		net.minecraft.network.chat.numbers.NumberFormat format = SlashHud.config != null && !SlashHud.config.scoreboardNumbers
			? net.minecraft.network.chat.numbers.BlankFormat.INSTANCE
			: objective.numberFormatOrDefault(net.minecraft.network.chat.numbers.StyledFormat.SIDEBAR_DEFAULT);
		List<net.minecraft.world.scores.PlayerScoreEntry> entries = board.listPlayerScores(objective).stream()
			.filter(e -> !e.isHidden())
			.sorted(java.util.Comparator.comparing(net.minecraft.world.scores.PlayerScoreEntry::value).reversed()
				.thenComparing(net.minecraft.world.scores.PlayerScoreEntry::owner, String.CASE_INSENSITIVE_ORDER))
			.limit(15).toList();
		for (var e : entries) {
			int name = font.width(PlayerTeam.formatNameForTeam(board.getPlayersTeam(e.owner()), e.ownerName()));
			int score = font.width(e.formatValue(format));
			wide = Math.max(wide, name + (score > 0 ? colon + score : 0));
		}
		lines = entries.size();
		//#else
		//$ // the names starting with # left out, the last 15 of the game's order, the red number always there
		//$ List<net.minecraft.world.scores.Score> scores = board.getPlayerScores(objective).stream()
		//$ 	.filter(s -> s.getOwner() != null && !s.getOwner().startsWith("#")).toList();
		//$ if (scores.size() > 15) scores = scores.subList(scores.size() - 15, scores.size());
		//$ for (var s : scores) {
		//$ 	int name = font.width(PlayerTeam.formatNameForTeam(board.getPlayersTeam(s.getOwner()), Component.literal(s.getOwner())));
		//$ 	wide = Math.max(wide, name + colon + font.width(Integer.toString(s.getScore())));
		//$ }
		//$ lines = scores.size();
		//#endif
		int bottom = sh / 2 + lines * 9 / 3;
		return new int[] { sw - wide - 5, bottom - lines * 9 - 10, sw - 1, bottom };
	}

	/**
	 * The tab list as the game lays it out (PlayerTabOverlay's drawing): up to 20 rows a column,
	 * each column a face, the widest name and the widest score wide (at most the screen less 50
	 * in all), with the header and the footer over and under it, wrapped to the same width,
	 * centred and 9 pixels from the top.
	 */
	/** The scoreboard's and the tab list's boxes as the game lays them out, for their rounded corners (GameRound). */
	public static int[] scoreboardRect(Minecraft mc, Objective objective, int sw, int sh) {
		return objective == null ? null : scoreboardDrawn(mc, objective, sw, sh);
	}

	public static int[] tabListRect(Minecraft mc) {
		return mc.level == null ? null : tabListDrawn(mc, mc.getWindow().getGuiScaledWidth());
	}

	static int[] tabListDrawn(Minecraft mc, int sw) {
		Font font = mc.font;
		var tab = Compat.tabList(mc);
		var parts = (dev.slash3rss.slashclient.hud.mixin.PlayerTabOverlayAccessor) tab;
		Scoreboard board = mc.level.getScoreboard();
		Objective objective = Compat.displayed(mc, false);
		boolean hearts = objective != null && objective.getRenderType() == ObjectiveCriteria.RenderType.HEARTS;
		List<PlayerInfo> players = parts.slashclient$playerInfos();
		int names = 0, scores = 0, space = font.width(" ");
		for (PlayerInfo info : players) {
			names = Math.max(names, font.width(tab.getNameForDisplay(info)));
			if (objective == null || hearts) continue;
			//#if MC >= 1.20.2
			var score = board.getPlayerScoreInfo(net.minecraft.world.scores.ScoreHolder.fromGameProfile(info.getProfile()), objective);
			var format = objective.numberFormatOrDefault(net.minecraft.network.chat.numbers.StyledFormat.PLAYER_LIST_DEFAULT);
			//#if MC >= 26.2
			int w = score != null ? font.width(score.formatValue(format)) : 0;
			//#else
			//$ int w = font.width(net.minecraft.world.scores.ReadOnlyScoreInfo.safeFormatValue(score, format));
			//#endif
			scores = Math.max(scores, w > 0 ? space + w : 0);
			//#else
			//$ String name = info.getProfile().getName();
			//$ int value = board.hasPlayerScore(name, objective) ? board.getOrCreatePlayerScore(name, objective).getScore() : 0;
			//$ scores = Math.max(scores, font.width(" " + value));
			//#endif
		}
		int n = players.size(), rows = n, columns = 1;
		while (rows > 20) rows = (n + ++columns - 1) / columns;
		//#if MC >= 26.2
		boolean faces = mc.getConnection().onlineMode();
		//#else
		//$ boolean faces = mc.isLocalServer() || mc.getConnection().getConnection().isEncrypted();
		//#endif
		int scoreW = objective == null ? 0 : hearts ? 90 : scores;
		int column = Math.min(columns * ((faces ? 9 : 0) + names + scoreW + 13), sw - 50) / columns;
		int wide = column * columns + (columns - 1) * 5;
		List<net.minecraft.util.FormattedCharSequence> header = null, footer = null;
		if (parts.slashclient$header() != null && !SlashHud.config.tabHideHeader) {
			header = font.split(parts.slashclient$header(), sw - 50);
			for (var line : header) wide = Math.max(wide, font.width(line));
		}
		if (parts.slashclient$footer() != null && !SlashHud.config.tabHideFooter) {
			footer = font.split(parts.slashclient$footer(), sw - 50);
			for (var line : footer) wide = Math.max(wide, font.width(line));
		}
		// the footer's background reaches a pixel lower than its lines (measured in game on 26.3 and 1.21.4)
		int bottom = 10 + (header != null ? header.size() * 9 + 1 : 0) + rows * 9 + (footer != null ? 2 + footer.size() * 9 : 0);
		return new int[] { sw / 2 - wide / 2 - 1, 9, sw / 2 + wide / 2 + 1, bottom };
	}

	//#if MC >= 1.20.2
	public static final List<Part> ALL = List.of(SCOREBOARD, BOSS_BAR, TAB_LIST, ACTION_BAR, TITLES, TOASTS);
	//#else
	//$ // 1.20.1 draws the action bar inline in Gui.render: it cannot be moved there
	//$ public static final List<Part> ALL = List.of(SCOREBOARD, BOSS_BAR, TAB_LIST, TITLES, TOASTS);
	//#endif

	/**
	 * Where each part's box starts, so that the game's own position comes out: the scoreboard on
	 * the right edge (moved by the old offset slider, when it was used), the others where the game
	 * draws them.
	 */
	/** The game's own parts placed like modules (left on in the saving mode for slower computers, HudConfig.defaults). */
	public static final java.util.Set<String> IDS = java.util.Set.of("scoreboard", "bossbar", "tablist", "titles", "toasts", "actionbar", "chat");

	public static void defaults(HudConfig cfg) {
		cfg.modules.putIfAbsent("scoreboard", new HudConfig.Placement(true, 1f, 0.5f, 0, cfg.scoreboardOffset));
		cfg.modules.putIfAbsent("bossbar", new HudConfig.Placement(true, 0.5f, 0f, 0, cfg.bossBarOffset));
		cfg.modules.putIfAbsent("tablist", new HudConfig.Placement(true, 0.5f, 0f, 0, 0));
		cfg.modules.putIfAbsent("titles", new HudConfig.Placement(true, 0.5f, 0.5f, 0, 0));
		cfg.modules.putIfAbsent("toasts", new HudConfig.Placement(true, 1f, 0f, 0, 0));
		// the box's middle on the line the game centres the message on (68 above the bottom)
		cfg.modules.putIfAbsent("actionbar", new HudConfig.Placement(true, 0.5f, 1f, 0, -68 + 7));
		// the chat is never moved: its box always sits where the game draws it
		HudConfig.Placement chat = cfg.modules.computeIfAbsent("chat", k -> new HudConfig.Placement(true, 0f, 1f, 0, -40));
		chat.ax = 0f;
		chat.ay = 1f;
		chat.dx = 0;
		chat.dy = -40;
		chat.scale = 1f;
	}
}
