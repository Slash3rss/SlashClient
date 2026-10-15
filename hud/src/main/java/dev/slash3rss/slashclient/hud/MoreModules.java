package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.List;

import static dev.slash3rss.slashclient.hud.Modules.PAD;
import static dev.slash3rss.slashclient.hud.Modules.cfg;
import static dev.slash3rss.slashclient.hud.Modules.grade;
import static dev.slash3rss.slashclient.hud.Modules.text;

/** The rest of the usual client HUD: server info, world info, combat and inventory. */
final class MoreModules {
	private MoreModules() {}

	// ---------- combat: reach of the last hit and combo, fed by SlashHud's attack listener ----------

	static final class Combat {
		static double lastReach = -1;
		static long lastReachAt;
		static int combo;
		static long lastHitAt;
		private static int lastHurtTime;

		/** The local player hit `target`; `reach` is from the eyes to its hitbox. */
		static void hit(double reach) {
			long now = System.currentTimeMillis();
			lastReach = reach;
			lastReachAt = now;
			combo = now - lastHitAt < 2500 ? combo + 1 : 1;
			lastHitAt = now;
		}

		/** Taking a hit or waiting too long ends the combo. */
		static void tick(Minecraft mc) {
			if (mc.player == null) return;
			int hurt = mc.player.hurtTime;
			if (hurt > lastHurtTime) combo = 0;
			lastHurtTime = hurt;
			if (System.currentTimeMillis() - lastHitAt > 2500) combo = 0;
		}
	}

	/** When the current world or server session started, for the session timer. */
	static long sessionStart;

	// ---------- simple text modules ----------

	static final class Server extends Modules.TextModule {
		public String id() {
			return "server";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return mc.getCurrentServer() != null && !mc.hasSingleplayerServer();
		}

		Component content(Minecraft mc) {
			var server = mc.getCurrentServer();
			return Component.literal(server == null ? "mc.example.com" : server.ip);
		}
	}

	static final class Players extends Modules.TextModule {
		public String id() {
			return "players";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return mc.getConnection() != null && !mc.hasSingleplayerServer();
		}

		Component content(Minecraft mc) {
			int n = mc.getConnection() == null ? 12 : mc.getConnection().getListedOnlinePlayers().size();
			return Component.translatable("slashclient-hud.players", n);
		}
	}

	static final class Memory extends Modules.TextModule {
		public String id() {
			return "memory";
		}

		private static long used() {
			Runtime r = Runtime.getRuntime();
			return r.totalMemory() - r.freeMemory();
		}

		Component content(Minecraft mc) {
			long max = Runtime.getRuntime().maxMemory();
			return Component.translatable("slashclient-hud.memory", used() * 100 / max, used() >> 20, max >> 20);
		}

		@Override
		int color(Minecraft mc) {
			return grade((double) used() / Runtime.getRuntime().maxMemory(), 0.6, 0.95);
		}
	}

	static final class Biome extends Modules.TextModule {
		public String id() {
			return "biome";
		}

		Component content(Minecraft mc) {
			if (mc.player == null || mc.level == null) return Component.translatable("biome.minecraft.plains");
			String name = mc.level.getBiome(mc.player.blockPosition()).getRegisteredName();
			return Component.translatable("biome." + name.replace(':', '.'));
		}
	}

	static final class DayTime extends Modules.TextModule {
		public String id() {
			return "daytime";
		}

		Component content(Minecraft mc) {
			long t = mc.level == null ? 6000 : mc.level.getOverworldClockTime();
			long day = t / 24000 + 1;
			// tick 0 is 6:00 in the morning
			long ofDay = (t + 6000) % 24000;
			String clock = String.format("%02d:%02d", ofDay / 1000, ofDay % 1000 * 60 / 1000);
			return Component.translatable("slashclient-hud.daytime", day, clock);
		}
	}

	static final class Light extends Modules.TextModule {
		public String id() {
			return "light";
		}

		private int level(Minecraft mc) {
			return mc.player == null || mc.level == null ? 15 : mc.level.getMaxLocalRawBrightness(mc.player.blockPosition());
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.light", level(mc));
		}

		@Override
		int color(Minecraft mc) {
			// mobs spawn at light 0 in recent versions: worth a red warning
			return level(mc) == 0 ? 0xFFFF5555 : cfg.textColor;
		}
	}

	static final class Session extends Modules.TextModule {
		public String id() {
			return "session";
		}

		Component content(Minecraft mc) {
			long s = sessionStart == 0 ? 0 : (System.currentTimeMillis() - sessionStart) / 1000;
			return Component.translatable("slashclient-hud.session", String.format("%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60));
		}
	}

	static final class Combo extends Modules.TextModule {
		public String id() {
			return "combo";
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.combo", Combat.combo);
		}
	}

	static final class Reach extends Modules.TextModule {
		public String id() {
			return "reach";
		}

		Component content(Minecraft mc) {
			// the last hit stays on screen for a few seconds
			boolean fresh = Combat.lastReach >= 0 && System.currentTimeMillis() - Combat.lastReachAt < 3000;
			return fresh ? Component.translatable("slashclient-hud.reach", String.format("%.2f", Combat.lastReach)) : Component.translatable("slashclient-hud.reach.none");
		}
	}

	static final class Saturation extends Modules.TextModule {
		public String id() {
			return "saturation";
		}

		Component content(Minecraft mc) {
			if (mc.player == null) return Component.translatable("slashclient-hud.saturation", 20, "5.0");
			var food = mc.player.getFoodData();
			return Component.translatable("slashclient-hud.saturation", food.getFoodLevel(), String.format("%.1f", food.getSaturationLevel()));
		}
	}

	// ---------- items worth counting in PvP and on long trips ----------

	static final class ItemCounter implements HudModule {
		private static final Item[][] GROUPS = {
			{ Items.ARROW, Items.SPECTRAL_ARROW, Items.TIPPED_ARROW },
			{ Items.ENDER_PEARL },
			{ Items.TOTEM_OF_UNDYING },
			{ Items.GOLDEN_APPLE, Items.ENCHANTED_GOLDEN_APPLE },
			{ Items.EXPERIENCE_BOTTLE },
			{ Items.FIREWORK_ROCKET },
		};

		public String id() {
			return "items";
		}

		private static List<int[]> counts(Minecraft mc) {
			List<int[]> out = new ArrayList<>();
			if (mc.player == null) return out;
			Inventory inv = mc.player.getInventory();
			for (int g = 0; g < GROUPS.length; g++) {
				int n = 0;
				for (int i = 0; i < inv.getContainerSize(); i++) {
					ItemStack s = inv.getItem(i);
					for (Item item : GROUPS[g]) if (s.is(item)) n += s.getCount();
				}
				if (n > 0) out.add(new int[] { g, n });
			}
			return out;
		}

		private static List<int[]> shown(Minecraft mc) {
			List<int[]> c = counts(mc);
			return c.isEmpty() ? List.of(new int[] { 0, 64 }, new int[] { 1, 16 }, new int[] { 2, 1 }) : c;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !counts(mc).isEmpty();
		}

		public int width(Minecraft mc) {
			int w = 0;
			for (int[] c : shown(mc)) w += 18 + mc.font.width(String.valueOf(c[1])) + 4;
			return w - 4 + PAD * 2;
		}

		public int height(Minecraft mc) {
			return 16 + PAD * 2;
		}

		private void drawCounts(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<int[]> list) {
			int cx = x + PAD;
			for (int[] c : list) {
				g.item(new ItemStack(GROUPS[c[0]][0]), cx, y + PAD);
				String n = String.valueOf(c[1]);
				text(g, mc, n, cx + 18, y + PAD + 4, cfg.textColor);
				cx += 18 + mc.font.width(n) + 4;
			}
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawCounts(g, mc, x, y, counts(mc));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawCounts(g, mc, x, y, shown(mc));
		}
	}

	// ---------- the creature under the crosshair: name, health, distance ----------

	static final class Target implements HudModule {
		private static final int WIDTH = 120;

		public String id() {
			return "target";
		}

		private static LivingEntity target(Minecraft mc) {
			return mc.crosshairPickEntity instanceof LivingEntity e ? e : null;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return target(mc) != null;
		}

		public int width(Minecraft mc) {
			return WIDTH;
		}

		public int height(Minecraft mc) {
			return mc.font.lineHeight * 2 + 6 + PAD * 2;
		}

		private void drawFor(GuiGraphicsExtractor g, Minecraft mc, int x, int y, Component name, float health, float max, float absorb, double distance) {
			text(g, mc, name, x + PAD, y + PAD, cfg.textColor);
			String hp = String.format("❤ %.1f", health) + (absorb > 0 ? String.format(" +%.0f", absorb) : "");
			int barY = y + PAD + mc.font.lineHeight + 2;
			int barW = WIDTH - PAD * 2;
			g.fill(x + PAD, barY, x + PAD + barW, barY + 3, 0xFF333333);
			g.fill(x + PAD, barY, x + PAD + Math.round(barW * Math.min(1, health / max)), barY + 3, grade(max - health, 0, max));
			text(g, mc, hp, x + PAD, barY + 5, 0xFFFF7777);
			String dist = String.format("%.1f m", distance);
			text(g, mc, dist, x + WIDTH - PAD - mc.font.width(dist), barY + 5, 0xFFAAAAAA);
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			LivingEntity e = target(mc);
			if (e == null || mc.player == null) return;
			drawFor(g, mc, x, y, e.getDisplayName(), e.getHealth(), e.getMaxHealth(), e.getAbsorptionAmount(), Math.sqrt(mc.player.getEyePosition().distanceToSqr(e.getBoundingBox().getCenter())));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			if (target(mc) != null) draw(g, mc, x, y);
			else drawFor(g, mc, x, y, Component.literal("Steve"), 14f, 20f, 0f, 3.2);
		}
	}
}
