// SkyUp's bottling is played on 26.3: the timer is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;

/**
 * The AFK mining countdown of SkyUp's XP calculator: the session is the bottles times the clock
 * between two throws; while it runs, each bottle rings softly and the end rings a level-up. It keeps
 * running with the calculator closed, and the HUD module shows it.
 */
public final class SkyXp {
	private SkyXp() {}

	/** The session's length and the clock (seconds); what is left at `since` (ms) when running. */
	private static long total, left, since;
	private static int interval = 1;
	private static boolean running;
	/** When the last session ended (ms), to show "done" for a while. */
	private static long doneAt;
	private static long lastBottles = -1;
	/** How long "done" stays on the HUD. */
	private static final long DONE_MS = 15_000;

	/** Seconds left now. */
	static long left() {
		return running ? Math.max(0, left - (System.currentTimeMillis() - since) / 1000) : left;
	}

	static long total() {
		return total;
	}

	static boolean running() {
		return running;
	}

	/** Bottles still to throw. */
	static long bottles() {
		return interval > 0 ? (left() + interval - 1) / interval : 0;
	}

	/** Start (a new session of `seconds`, when none is under way) or go on after a pause. */
	static void start(long seconds, int clock) {
		if (left() <= 0 || total == 0) {
			total = left = Math.max(0, seconds);
			interval = Math.max(1, clock);
		}
		if (left <= 0) return;
		since = System.currentTimeMillis();
		running = true;
		doneAt = 0;
		lastBottles = bottles();
		ping();
	}

	static void pause() {
		left = left();
		running = false;
	}

	/** Stopped and forgotten: the next start takes the calculator's numbers as they are then. */
	static void reset() {
		running = false;
		total = left = 0;
		doneAt = 0;
	}

	static void tick(Minecraft mc) {
		if (!running) return;
		long now = left(), bottles = bottles();
		if (now <= 0) {
			running = false;
			left = 0;
			doneAt = System.currentTimeMillis();
			sound(true);
			return;
		}
		// one bottle thrown: a soft ring
		if (bottles < lastBottles) ping();
		lastBottles = bottles;
	}

	private static void ping() {
		sound(false);
	}

	private static void sound(boolean done) {
		if (SlashHud.config == null || SlashHud.config.skyXpMuted) return;
		Minecraft.getInstance().getSoundManager().play(done ? SimpleSoundInstance.forUI(SoundEvents.PLAYER_LEVELUP, 1f)
			: SimpleSoundInstance.forUI(SoundEvents.EXPERIENCE_ORB_PICKUP, 1.4f, 0.5f));
	}

	/** Under way, paused part way, or just done. */
	static boolean shown() {
		return running || left > 0 && left < total || doneAt > 0 && System.currentTimeMillis() - doneAt < DONE_MS;
	}

	// ---------- on the HUD ----------

	public static final class Module implements HudModule {
		public String id() {
			return "skyxp";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return shown();
		}

		private static Component status() {
			if (!running && left <= 0) return Component.translatable("slashclient-hud.skyXp.done");
			Component bottles = Component.translatable("slashclient-hud.skyXp.bottlesLeft", bottles());
			return Component.literal(XpMath.clock(left()) + " · ").append(bottles).append(running ? "" : " · ").append(running ? Component.empty() : Component.translatable("slashclient-hud.skyXp.paused"));
		}

		public int width(Minecraft mc) {
			int w = Math.max(mc.font.width(Component.translatable("slashclient-hud.skyXp.timer")), mc.font.width(visible(mc) ? status() : Component.literal("00:01:12 · 6")));
			return Math.max(90, w) + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			return 26 + Modules.PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			int w = width(mc) - Modules.PAD * 2, left = x + Modules.PAD, top = y + Modules.PAD;
			Modules.text(g, mc, Component.translatable("slashclient-hud.skyXp.timer"), left, top, 0xFF55FF55);
			boolean real = visible(mc);
			Modules.text(g, mc, real ? status() : Component.literal("00:01:12 · 6"), left, top + 10, 0xFFE5E7EB);
			// how much of the session is behind
			float done = real && total > 0 ? 1f - left() / (float) total : 0.4f;
			g.fill(left, top + 22, left + w, top + 24, 0xFF2A3142);
			g.fill(left, top + 22, left + Math.round(w * done), top + 24, 0xFF4ADE80);
		}
	}

	// ---------- for the in-game tests ----------

	static String debug() {
		return "total " + total + " left " + left() + " bottles " + bottles() + " running " + running;
	}

	static void resetForTest() {
		total = left = 0;
		running = false;
		doneAt = 0;
	}
}
//#endif
