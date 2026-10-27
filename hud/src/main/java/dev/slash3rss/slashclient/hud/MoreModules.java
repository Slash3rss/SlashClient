package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import dev.slash3rss.slashclient.hud.ui.Ui;
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
public final class MoreModules {
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

		@Override
		public boolean textColored() {
			return false;
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
		public int color(Minecraft mc) {
			return grade((double) used() / Runtime.getRuntime().maxMemory(), cfg.memoryGood / 100.0, cfg.memoryBad / 100.0);
		}
	}

	/** The game's share of the processor, over the last second (all cores together = 100%). */
	public static final class Cpu extends Modules.TextModule {
		private static final java.lang.management.OperatingSystemMXBean OS = java.lang.management.ManagementFactory.getOperatingSystemMXBean();
		private static long sampledAt;
		private static double load = -1;

		public String id() {
			return "cpu";
		}

		@Override
		public boolean textColored() {
			return false;
		}

		/** 0..1, or -1 when the JVM cannot tell; read once a second, the call is not free. */
		public static double load() {
			long now = System.currentTimeMillis();
			if (now - sampledAt >= 1000) {
				sampledAt = now;
				load = OS instanceof com.sun.management.OperatingSystemMXBean sun ? sun.getProcessCpuLoad() : -1;
			}
			return load;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return load() >= 0;
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.cpu", Math.round(Math.max(0, load()) * 100));
		}

		@Override
		public int color(Minecraft mc) {
			return grade(Math.max(0, load()), cfg.cpuGood / 100.0, cfg.cpuBad / 100.0);
		}
	}

	/** How busy the graphics card is with the game's frames, measured by the game (as on F3). */
	static final class Gpu extends Modules.TextModule {
		public String id() {
			return "gpu";
		}

		@Override
		public boolean textColored() {
			return false;
		}

		private static double load(Minecraft mc) {
			return Math.max(0, Math.min(100, mc.getGpuUtilization()));
		}

		Component content(Minecraft mc) {
			// no measurement in the first frames, nor on macOS from 26.1 on (its new renderer gets no GPU timestamps there)
			double v = mc.getGpuUtilization();
			return v > 0 ? Component.translatable("slashclient-hud.gpu", Math.round(load(mc))) : Component.translatable("slashclient-hud.gpu.none");
		}

		@Override
		public int color(Minecraft mc) {
			return grade(load(mc) / 100, cfg.gpuGood / 100.0, cfg.gpuBad / 100.0);
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
		public int color(Minecraft mc) {
			// mobs spawn at light 0 in recent versions: worth a red warning
			return level(mc) == 0 ? 0xFFFF5555 : Modules.textColor();
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

	/** Sprinting and sneaking, and whether the key is set to toggle. */
	static final class Movement extends Modules.TextModule {
		public String id() {
			return "movement";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return mc.player != null && (mc.player.isSprinting() || mc.player.isShiftKeyDown());
		}

		Component content(Minecraft mc) {
			boolean sneaking = mc.player != null && mc.player.isShiftKeyDown();
			boolean toggled = sneaking ? mc.options.toggleCrouch().get() : mc.options.toggleSprint().get();
			Component state = Component.translatable(sneaking ? "slashclient-hud.sneaking" : "slashclient-hud.sprinting");
			return toggled ? Component.empty().append(state).append(" ").append(Component.translatable("slashclient-hud.toggled")) : state;
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
				// in the main menu (editor before any world) items can't be made yet: an icon badge instead
				Ui.icon(g, GROUPS[c[0]][0], "#", cx, y + PAD);
				String n = String.valueOf(c[1]);
				text(g, mc, n, cx + 18, y + PAD + 4, Modules.textColor());
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
		/** As wide as the name needs (servers put ranks and icons in it), within these bounds. */
		private static final int MIN_WIDTH = 120, MAX_WIDTH = 260;

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

		/** The name the box shows for what is under the crosshair (for the tests). */
		static String shownName(Minecraft mc) {
			return nameOf(target(mc)).getString();
		}

		private static Component nameOf(LivingEntity e) {
			if (e == null) return Component.literal("Steve");
			Component name = withoutHealth(e.getDisplayName());
			if (!name.getString().isBlank()) return name;
			// a mob drawn with a server's model (SkyUp's dungeons) has no name of its own: the name over
			// its head is on another entity there (a name tag riding it or standing above), else its kind
			Component tag = tagAbove(e);
			return tag != null ? tag : e.getType().getDescription();
		}

		/**
		 * The name over this one's head: a name tag (an entity riding it or standing just above with its
		 * name shown) or a text display there, without the health; the nearest, or null if none.
		 */
		private static Component tagAbove(LivingEntity e) {
			if (e.level() == null) return null;
			var box = e.getBoundingBox();
			var above = new net.minecraft.world.phys.AABB(box.minX - 0.5, box.minY, box.minZ - 0.5, box.maxX + 0.5, box.maxY + 2.5, box.maxZ + 0.5);
			Component best = null;
			double bestDist = Double.MAX_VALUE;
			for (var other : e.level().getEntities(e, above, o -> !(o instanceof net.minecraft.world.entity.player.Player))) {
				Component text = null;
				if (other.hasCustomName() && other.isCustomNameVisible()) text = other.getCustomName();
				//#if MC >= 1.21
				else if (other instanceof net.minecraft.world.entity.Display.TextDisplay display) text = display.getText();
				//#endif
				if (text == null) continue;
				// the first line only: a text display may carry more under the name
				Component name = withoutHealth(firstLine(text));
				if (name.getString().isBlank()) continue;
				double d = Math.abs(other.getX() - e.getX()) + Math.abs(other.getZ() - e.getZ());
				if (d < bestDist) {
					best = name;
					bestDist = d;
				}
			}
			return best;
		}

		/** A text's first line, its colours kept. */
		private static Component firstLine(Component text) {
			if (!text.getString().contains("\n")) return text;
			var out = Component.empty();
			boolean[] done = { false };
			text.visit((style, part) -> {
				if (done[0]) return java.util.Optional.empty();
				int nl = part.indexOf('\n');
				out.append(Component.literal(nl < 0 ? part : part.substring(0, nl)).withStyle(style));
				if (nl >= 0) done[0] = true;
				return java.util.Optional.empty();
			}, net.minecraft.network.chat.Style.EMPTY);
			return out;
		}

		/**
		 * The name without the health servers put in front of it ("84.36 ❤ | Żniwiarz poz. 100" on
		 * SkyUp): the box shows the health under it anyway. Only when a heart comes before a "|".
		 */
		static Component withoutHealth(Component name) {
			String plain = name.getString();
			int bar = plain.indexOf('|');
			if (bar < 0 || plain.lastIndexOf('❤', bar) < 0) return name;
			int[] skip = { bar + 1 };
			var out = Component.empty();
			name.visit((style, part) -> {
				String kept = part;
				if (skip[0] > 0) {
					int drop = Math.min(skip[0], part.length());
					skip[0] -= drop;
					kept = part.substring(drop);
					if (out.getSiblings().isEmpty()) kept = kept.stripLeading();
				}
				if (!kept.isEmpty()) out.append(Component.literal(kept).withStyle(style));
				return java.util.Optional.empty();
			}, net.minecraft.network.chat.Style.EMPTY);
			return out;
		}

		/** The name cut to fit, keeping its colours and the server's icons, with "…" at the end. */
		private static Component cut(Minecraft mc, Component name, int max) {
			if (mc.font.width(name) <= max) return name;
			var kept = mc.font.substrByWidth(name, max - mc.font.width("…"));
			var out = Component.empty();
			kept.visit((style, part) -> {
				out.append(Component.literal(part).withStyle(style));
				return java.util.Optional.empty();
			}, net.minecraft.network.chat.Style.EMPTY);
			return out.append("…");
		}

		private static int widthFor(Minecraft mc, Component name) {
			return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, mc.font.width(name) + PAD * 2));
		}

		public int width(Minecraft mc) {
			return widthFor(mc, nameOf(target(mc)));
		}

		public int height(Minecraft mc) {
			return mc.font.lineHeight * 2 + 1 + (cfg.targetBar ? 5 : 0) + PAD * 2;
		}

		private void drawFor(GuiGraphicsExtractor g, Minecraft mc, int x, int y, Component name, float health, float max, float absorb, double distance) {
			int width = widthFor(mc, name);
			// a name longer than the widest box is made smaller to fit, down to half; only past that cut with "…"
			int room = width - PAD * 2, full = mc.font.width(name);
			if (full <= room) text(g, mc, name, x + PAD, y + PAD, Modules.textColor());
			else {
				float s = Math.max(0.5f, (float) room / full);
				var pose = g.pose();
				pose.pushMatrix();
				pose.translate(x + PAD, y + PAD + mc.font.lineHeight * (1 - s) / 2f);
				pose.scale(s, s);
				text(g, mc, cut(mc, name, (int) (room / s)), 0, 0, Modules.textColor());
				pose.popMatrix();
			}
			String hp = String.format("❤ %.1f", health) + (absorb > 0 ? String.format(" +%.0f", absorb) : "");
			int barY = y + PAD + mc.font.lineHeight + 2;
			int barW = width - PAD * 2;
			if (cfg.targetBar) {
				g.fill(x + PAD, barY, x + PAD + barW, barY + 3, 0xFF333333);
				g.fill(x + PAD, barY, x + PAD + Math.round(barW * Math.min(1, health / max)), barY + 3, grade(max - health, 0, max));
			}
			int ty = cfg.targetBar ? barY + 5 : barY;
			text(g, mc, hp, x + PAD, ty, 0xFFFF7777);
			if (!cfg.targetDistance) return;
			String dist = String.format("%.1f m", distance);
			text(g, mc, dist, x + width - PAD - mc.font.width(dist), ty, 0xFFAAAAAA);
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			LivingEntity e = target(mc);
			if (e == null || mc.player == null) return;
			drawFor(g, mc, x, y, nameOf(e), e.getHealth(), e.getMaxHealth(), e.getAbsorptionAmount(), Math.sqrt(mc.player.getEyePosition().distanceToSqr(e.getBoundingBox().getCenter())));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			if (target(mc) != null) draw(g, mc, x, y);
			else drawFor(g, mc, x, y, Component.literal("Steve"), 14f, 20f, 0f, 3.2);
		}
	}
}
