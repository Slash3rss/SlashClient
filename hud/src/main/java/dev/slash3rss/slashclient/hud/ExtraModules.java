package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.social.Social;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.tags.BlockTags;
import net.minecraft.util.Mth;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static dev.slash3rss.slashclient.hud.Modules.PAD;
import static dev.slash3rss.slashclient.hud.Modules.cfg;
import static dev.slash3rss.slashclient.hud.Modules.grade;
import static dev.slash3rss.slashclient.hud.Modules.text;

/** Durability, ammo, flight, server and network, FPS graph, compass, sky, K/D, block, friends, hits. */
public final class ExtraModules {
	private ExtraModules() {}

	static List<HudModule> all() {
		return List.of(new Durability(), new Ammo(), new Elytra(), new Tps(), new Network(), new FpsGraph(), new Compass(), new Sky(),
			new KillsDeaths(), new BlockInfo(), new Friends(), new Hits());
	}

	private static String seconds(double s) {
		return String.format(java.util.Locale.ROOT, "%d:%02d", (int) s / 60, (int) s % 60);
	}

	// ---------- what the game tells between frames: hits, kills, deaths, flight, server ticks, bytes ----------

	public static final class Stats {
		static int kills;
		static int deaths;
		private static boolean wasDead;
		/** Entities hit in the last seconds, by id: when one of them dies, it was our kill. */
		private static final Map<Integer, Long> hitRecently = new HashMap<>();

		/** The last hit: its strength (0..1), whether it was a critical one, and when. */
		static float hitStrength;
		static boolean hitCritical;
		static long hitAt;

		static double flightSpeed;
		private static Vec3 lastPos;

		/** Called just before the local player hits `target` (the hit itself comes after). */
		static void attack(Player p, Entity target) {
			hitStrength = p.getAttackStrengthScale(0.5f);
			// the game's own rule for a critical hit
			hitCritical = hitStrength > 0.9f && p.fallDistance > 0 && !p.onGround() && !p.onClimbable() && !p.isInWater()
				&& !p.hasEffect(MobEffects.BLINDNESS) && !p.isPassenger() && !p.isSprinting() && target instanceof LivingEntity;
			hitAt = System.currentTimeMillis();
			// a body still falling over is not a new kill (fast clicking hits it again)
			if (target instanceof LivingEntity le && !le.isDeadOrDying()) hitRecently.put(target.getId(), hitAt);
		}

		static void tick(Minecraft mc) {
			if (mc.player == null || mc.level == null) {
				hitRecently.clear();
				lastPos = null;
				return;
			}
			boolean dead = mc.player.isDeadOrDying();
			if (dead && !wasDead) deaths++;
			wasDead = dead;
			long now = System.currentTimeMillis();
			for (Iterator<Map.Entry<Integer, Long>> it = hitRecently.entrySet().iterator(); it.hasNext(); ) {
				Map.Entry<Integer, Long> e = it.next();
				Entity entity = mc.level.getEntity(e.getKey());
				if (entity instanceof LivingEntity le && le.isDeadOrDying()) {
					kills++;
					SessionStats.killed(le);
					it.remove();
				} else if (entity == null || now - e.getValue() > 10_000) it.remove();
			}
			Vec3 pos = mc.player.position();
			flightSpeed = lastPos == null ? 0 : pos.distanceTo(lastPos) * 20;
			lastPos = pos;
		}

		// server ticks per second, from how fast the game time in the server's time packets moves
		private static long lastGameTime = -1;
		private static long lastPacketAt;
		static double tps = -1;

		public static void timePacket(long gameTime) {
			long now = System.nanoTime();
			if (lastGameTime >= 0 && gameTime > lastGameTime) {
				double secs = (now - lastPacketAt) / 1e9;
				if (secs > 0.3 && secs < 10) {
					double measured = Math.min(20, (gameTime - lastGameTime) / secs);
					tps = tps < 0 ? measured : tps * 0.6 + measured * 0.4;
				}
			}
			lastGameTime = gameTime;
			lastPacketAt = now;
		}

		static void disconnected() {
			lastGameTime = -1;
			tps = -1;
		}

		// bytes through the socket, counted by a handler at the front of the connection's pipeline
		public static final AtomicLong bytesIn = new AtomicLong(), bytesOut = new AtomicLong();
		private static long sampledAt, sampledIn, sampledOut;
		static double inPerSec, outPerSec;

		static void sampleBytes() {
			long now = System.currentTimeMillis();
			if (now - sampledAt < 1000) return;
			double secs = sampledAt == 0 ? 1 : (now - sampledAt) / 1000.0;
			long in = bytesIn.get(), out = bytesOut.get();
			inPerSec = (in - sampledIn) / secs;
			outPerSec = (out - sampledOut) / secs;
			sampledIn = in;
			sampledOut = out;
			sampledAt = now;
		}
	}

	// ---------- 1. durability of the item in hand ----------

	static final class Durability implements HudModule {
		public String id() {
			return "durability";
		}

		private static ItemStack held(Minecraft mc) {
			if (mc.player == null) return ItemStack.EMPTY;
			ItemStack s = mc.player.getMainHandItem();
			return s.isDamageableItem() ? s : ItemStack.EMPTY;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !held(mc).isEmpty();
		}

		private static String label(int left, int max) {
			return left + "/" + max;
		}

		public int width(Minecraft mc) {
			ItemStack s = held(mc);
			String l = s.isEmpty() ? label(1561, 1561) : label(s.getMaxDamage() - s.getDamageValue(), s.getMaxDamage());
			return 20 + Math.max(40, mc.font.width(l)) + PAD * 2;
		}

		public int height(Minecraft mc) {
			return 16 + PAD * 2;
		}

		private void drawFor(GuiGraphicsExtractor g, Minecraft mc, int x, int y, ItemStack s, Item fallback, int left, int max) {
			if (s != null && !s.isEmpty()) g.item(s, x + PAD, y + PAD);
			else Ui.icon(g, fallback, "#", x + PAD, y + PAD);
			double part = max == 0 ? 1 : (double) left / max;
			// under a tenth it blinks red, time to repair
			boolean low = part < 0.1;
			int color = low && System.currentTimeMillis() / 400 % 2 == 0 ? 0xFFFF5555 : grade(1 - part, 0.4, 0.9);
			String l = label(left, max);
			text(g, mc, l, x + PAD + 20, y + PAD, color);
			int bw = width(mc) - PAD * 2 - 20;
			g.fill(x + PAD + 20, y + PAD + 11, x + PAD + 20 + bw, y + PAD + 14, 0x80000000);
			g.fill(x + PAD + 20, y + PAD + 11, x + PAD + 20 + (int) Math.round(bw * part), y + PAD + 14, color);
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			ItemStack s = held(mc);
			drawFor(g, mc, x, y, s, Items.DIAMOND_PICKAXE, s.getMaxDamage() - s.getDamageValue(), s.getMaxDamage());
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			if (!held(mc).isEmpty()) draw(g, mc, x, y);
			else drawFor(g, mc, x, y, Ui.stack(Items.DIAMOND_PICKAXE), Items.DIAMOND_PICKAXE, 1204, 1561);
		}
	}

	// ---------- 2. arrows for a bow or crossbow, rockets with an elytra ----------

	static final class Ammo implements HudModule {
		public String id() {
			return "ammo";
		}

		private static int count(Minecraft mc, Item... items) {
			int n = 0;
			var inv = mc.player.getInventory();
			for (int i = 0; i < inv.getContainerSize(); i++) {
				ItemStack s = inv.getItem(i);
				for (Item item : items) if (s.is(item)) n += s.getCount();
			}
			return n;
		}

		/** Pairs of (item, count) worth showing now. */
		private static List<Object[]> shown(Minecraft mc) {
			List<Object[]> out = new ArrayList<>();
			if (mc.player == null) return out;
			boolean bow = false;
			for (ItemStack s : List.of(mc.player.getMainHandItem(), mc.player.getOffhandItem())) bow |= s.is(Items.BOW) || s.is(Items.CROSSBOW);
			boolean elytra = mc.player.getItemBySlot(EquipmentSlot.CHEST).is(Items.ELYTRA);
			if (bow) out.add(new Object[] { Items.ARROW, count(mc, Items.ARROW, Items.SPECTRAL_ARROW, Items.TIPPED_ARROW) });
			if (elytra || mc.player.getMainHandItem().is(Items.CROSSBOW)) out.add(new Object[] { Items.FIREWORK_ROCKET, count(mc, Items.FIREWORK_ROCKET) });
			return out;
		}

		private static List<Object[]> orSample(Minecraft mc) {
			List<Object[]> s = shown(mc);
			return s.isEmpty() ? List.of(new Object[] { Items.ARROW, 64 }, new Object[] { Items.FIREWORK_ROCKET, 23 }) : s;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !shown(mc).isEmpty();
		}

		public int width(Minecraft mc) {
			int w = 0;
			for (Object[] o : orSample(mc)) w += 18 + mc.font.width(String.valueOf(o[1])) + 6;
			return w - 6 + PAD * 2;
		}

		public int height(Minecraft mc) {
			return 16 + PAD * 2;
		}

		private void drawList(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<Object[]> list) {
			int cx = x + PAD;
			for (Object[] o : list) {
				Ui.icon(g, (Item) o[0], "#", cx, y + PAD);
				int n = (int) o[1];
				String s = String.valueOf(n);
				// none left is red, a few is yellow
				text(g, mc, s, cx + 18, y + PAD + 4, n == 0 ? 0xFFFF5555 : n < 16 ? 0xFFFFFF55 : cfg.textColor);
				cx += 18 + mc.font.width(s) + 6;
			}
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawList(g, mc, x, y, shown(mc));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawList(g, mc, x, y, orSample(mc));
		}
	}

	// ---------- 3. elytra flight: speed, height, how much elytra is left ----------

	static final class Elytra extends Modules.TextModule {
		public String id() {
			return "elytra";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return mc.player != null && mc.player.isFallFlying();
		}

		Component content(Minecraft mc) {
			if (!visible(mc)) return Component.translatable("slashclient-hud.elytra", "33.6", 142, 38, 87);
			ItemStack e = mc.player.getItemBySlot(EquipmentSlot.CHEST);
			int left = e.isDamageableItem() ? (e.getMaxDamage() - e.getDamageValue()) * 100 / Math.max(1, e.getMaxDamage()) : 100;
			// pitch up is negative in the game; shown as climbing (+) or diving (-)
			int pitch = Math.round(-mc.player.getXRot());
			return Component.translatable("slashclient-hud.elytra", String.format(java.util.Locale.ROOT, "%.1f", Stats.flightSpeed),
				(int) Math.floor(mc.player.getY()), pitch, left);
		}
	}

	// ---------- 4. server TPS and packets ----------

	static final class Tps extends Modules.TextModule {
		public String id() {
			return "tps";
		}

		/** Ticks per second: measured from the integrated server in singleplayer, guessed from time packets online. */
		static double tps(Minecraft mc) {
			var server = mc.getSingleplayerServer();
			if (server != null) {
				//#if MC >= 1.20.2
				double mspt = server.getAverageTickTimeNanos() / 1e6;
				//#else
				//$ double mspt = server.getAverageTickTime();
				//#endif
				return mspt <= 50 ? 20 : 1000 / mspt;
			}
			return Stats.tps;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return mc.getConnection() != null;
		}

		Component content(Minecraft mc) {
			double t = mc.getConnection() == null ? 20 : tps(mc);
			String tpsText = t < 0 ? "…" : String.format(java.util.Locale.ROOT, "%.1f", t);
			var conn = mc.getConnection() == null ? null : mc.getConnection().getConnection();
			int in = conn == null ? 48 : Math.round(conn.getAverageReceivedPackets());
			int out = conn == null ? 12 : Math.round(conn.getAverageSentPackets());
			return Component.translatable("slashclient-hud.tps", tpsText, in, out);
		}

		@Override
		int color(Minecraft mc) {
			double t = mc.getConnection() == null ? 20 : tps(mc);
			return t < 0 ? cfg.textColor : grade(20 - t, 1, 8);
		}
	}

	// ---------- 15. network: bytes per second through the socket ----------

	static final class Network extends Modules.TextModule {
		public String id() {
			return "network";
		}

		private static String size(double bytes) {
			if (bytes < 1024) return Math.round(bytes) + " B";
			if (bytes < 1024 * 1024) return String.format(java.util.Locale.ROOT, "%.1f KB", bytes / 1024);
			return String.format(java.util.Locale.ROOT, "%.2f MB", bytes / 1024 / 1024);
		}

		@Override
		public boolean visible(Minecraft mc) {
			// singleplayer passes packets in memory, nothing goes through a network
			return mc.getConnection() != null && !mc.getConnection().getConnection().isMemoryConnection();
		}

		Component content(Minecraft mc) {
			Stats.sampleBytes();
			if (!visible(mc)) return Component.translatable("slashclient-hud.network", size(18_400), size(2_150));
			return Component.translatable("slashclient-hud.network", size(Stats.inPerSec), size(Stats.outPerSec));
		}
	}

	// ---------- 5. FPS graph: the last frames' times, the 1% lows ----------

	static final class FpsGraph implements HudModule {
		private static final int N = 90;
		private static final float[] frames = new float[N];
		private static int next;
		private static long lastFrame;
		private static long lastSampleFrame = -1;

		public String id() {
			return "fpsgraph";
		}

		/** One sample per drawn frame (the editor and the HUD both call this). */
		private static void sample() {
			long now = System.nanoTime();
			if (lastFrame != 0) {
				frames[next] = (now - lastFrame) / 1e6f;
				next = (next + 1) % N;
			}
			lastFrame = now;
		}

		public int width(Minecraft mc) {
			return N + PAD * 2;
		}

		public int height(Minecraft mc) {
			return 24 + 10 + PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			sample();
			int top = y + PAD + 10, h = 24;
			// 33 ms (30 FPS) fills the height; a guide line at 16.7 ms (60 FPS)
			g.fill(x + PAD, top + h - Math.round(h * 16.7f / 33.3f), x + PAD + N, top + h - Math.round(h * 16.7f / 33.3f) + 1, 0x30FFFFFF);
			float[] sorted = new float[N];
			int n = 0;
			for (int i = 0; i < N; i++) {
				float ms = frames[(next + i) % N];
				if (ms <= 0) continue;
				sorted[n++] = ms;
				int bh = Math.max(1, Math.min(h, Math.round(h * ms / 33.3f)));
				g.fill(x + PAD + i, top + h - bh, x + PAD + i + 1, top + h, grade(ms, 17, 40));
			}
			Arrays.sort(sorted, 0, n);
			// the 1% low: the FPS of the slowest frames, what you feel as a stutter
			int low = n == 0 ? 0 : Math.round(1000 / sorted[Math.max(0, n - 1 - n / 100)]);
			text(g, mc, Component.translatable("slashclient-hud.fpsgraph", mc.getFps(), low), x + PAD, y + PAD, cfg.textColor);
		}
	}

	// ---------- 6. compass: a strip of directions at the top, with the waypoints on it ----------

	static final class Compass implements HudModule {
		private static final int W = 180;
		private static final int SPAN = 90;

		public String id() {
			return "compass";
		}

		public int width(Minecraft mc) {
			return W + PAD * 2;
		}

		public int height(Minecraft mc) {
			return 20 + PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			// 0 = north, clockwise, as on a map; the game's yaw is 0 to the south
			float heading = mc.player == null ? 0 : Mth.wrapDegrees(mc.player.getYRot() + 180);
			int cx = x + PAD + W / 2, top = y + PAD;
			for (int a = 0; a < 360; a += 15) {
				float off = Mth.wrapDegrees(a - heading);
				if (Math.abs(off) > SPAN) continue;
				int px = cx + Math.round(off * (W / 2f) / SPAN);
				boolean main = a % 90 == 0, half = a % 45 == 0;
				if (main || half) {
					String label = switch (a) {
						case 0 -> "N";
						case 45 -> "NE";
						case 90 -> "E";
						case 135 -> "SE";
						case 180 -> "S";
						case 225 -> "SW";
						case 270 -> "W";
						default -> "NW";
					};
					int color = a == 0 ? 0xFFFF5555 : main ? cfg.textColor : 0xFFAAAAAA;
					text(g, mc, label, px - mc.font.width(label) / 2, top + 9, color);
					g.fill(px, top + 2, px + 1, top + 7, color);
				} else g.fill(px, top + 4, px + 1, top + 7, 0x80FFFFFF);
			}
			// waypoints of this world as coloured marks over the strip
			if (mc.player != null && mc.level != null && cfg.waypoints) {
				String dim = Waypoints.dimension(mc);
				for (Waypoints.Point p : Waypoints.points(mc)) {
					if (!p.visible || !dim.equals(p.dimension)) continue;
					double dx = p.x + 0.5 - mc.player.getX(), dz = p.z + 0.5 - mc.player.getZ();
					float bearing = (float) Math.toDegrees(Math.atan2(dx, -dz));
					float off = Mth.wrapDegrees(bearing - heading);
					if (Math.abs(off) > SPAN) continue;
					int px = cx + Math.round(off * (W / 2f) / SPAN);
					g.fill(px - 2, top, px + 3, top + 4, p.color);
				}
			}
			// where you look
			g.fill(cx, top, cx + 1, top + 8, 0xFFFFFFFF);
			String deg = String.valueOf(Math.round((heading + 360) % 360));
			int dw = mc.font.width(deg);
			g.fill(cx - dw / 2 - 2, top + 8, cx + dw / 2 + 2, top + 18, 0xC0000000);
			text(g, mc, deg, cx - dw / 2, top + 9, 0xFFFFFFFF);
		}
	}

	// ---------- 7. the sky: time until dusk or dawn, and the weather ----------

	static final class Sky extends Modules.TextModule {
		public String id() {
			return "sky";
		}

		Component content(Minecraft mc) {
			long t = mc.level == null ? 9000 : mc.level.getOverworldClockTime() % 24000;
			// monsters come out from about 13000 and burn from 23000
			boolean day = t < 13000 || t >= 23000;
			long until = day ? (13000 - t + 24000) % 24000 : 23000 - t;
			String weather = mc.level == null ? "clear" : mc.level.isThundering() ? "thunder" : mc.level.isRaining() ? "rain" : "clear";
			return Component.translatable(day ? "slashclient-hud.sky.dusk" : "slashclient-hud.sky.dawn", seconds(until / 20.0))
				.append(Component.literal(" · ")).append(Component.translatable("slashclient-hud.sky." + weather));
		}
	}

	// ---------- 8. kills and deaths this session ----------

	static final class KillsDeaths extends Modules.TextModule {
		public String id() {
			return "kd";
		}

		Component content(Minecraft mc) {
			int k = Stats.kills, d = Stats.deaths;
			String ratio = String.format(java.util.Locale.ROOT, "%.2f", d == 0 ? (double) k : (double) k / d);
			return Component.translatable("slashclient-hud.kd", k, d, ratio);
		}
	}

	// ---------- 9. the block you look at: name, tool, how long it takes ----------

	static final class BlockInfo implements HudModule {
		public String id() {
			return "block";
		}

		private static BlockPos target(Minecraft mc) {
			if (mc.level == null || mc.player == null || !(mc.hitResult instanceof BlockHitResult hit) || hit.getType() != HitResult.Type.BLOCK) return null;
			return hit.getBlockPos();
		}

		@Override
		public boolean visible(Minecraft mc) {
			BlockPos pos = target(mc);
			return pos != null && !mc.level.getBlockState(pos).isAir();
		}

		private static String tool(BlockState s) {
			if (s.is(BlockTags.MINEABLE_WITH_PICKAXE)) return "pickaxe";
			if (s.is(BlockTags.MINEABLE_WITH_AXE)) return "axe";
			if (s.is(BlockTags.MINEABLE_WITH_SHOVEL)) return "shovel";
			if (s.is(BlockTags.MINEABLE_WITH_HOE)) return "hoe";
			return "hand";
		}

		/** Second line: tool and time; red when what you hold drops nothing. */
		private static Component detail(Minecraft mc, BlockState s, BlockPos pos) {
			float perTick = s.getDestroyProgress(mc.player, mc.level, pos);
			Component time = perTick <= 0 ? Component.translatable("slashclient-hud.block.never")
				: perTick >= 1 ? Component.translatable("slashclient-hud.block.instant")
				: Component.literal(String.format(java.util.Locale.ROOT, "%.2f s", Math.ceil(1 / perTick) / 20));
			return Component.translatable("slashclient-hud.block.tool." + tool(s)).append(Component.literal(" · ")).append(time);
		}

		private static boolean drops(Minecraft mc, BlockState s) {
			return !s.requiresCorrectToolForDrops() || mc.player.getMainHandItem().isCorrectToolForDrops(s);
		}

		/** The extra lines for the block looked at, as text (for the test); "" when none is. */
		static String linesForTest(Minecraft mc) {
			BlockPos pos = target(mc);
			if (pos == null) return "";
			StringBuilder out = new StringBuilder();
			for (var line : extras(mc, mc.level.getBlockState(pos), pos)) out.append(line.getKey().getString()).append('\n');
			return out.toString();
		}

		/** Numbered properties worth a line: honey, fill level, charges, moisture, bites, note, delay, how many. */
		private static final List<String> DETAILS = List.of("honey_level", "level", "charges", "moisture", "bites", "note", "delay", "pickles", "candles", "eggs", "hatch", "flower_amount", "segment_amount");
		/** Those whose top value means ready: a hive full of honey, a full composter, a charged anchor, wet farmland. */
		private static final List<String> FULL_IS_DONE = List.of("honey_level", "level", "charges", "moisture");

		/** An integer property of the state by its name ("age", "power"), with its highest value; null when it has none. */
		private static int[] intProperty(BlockState s, String name) {
			for (var p : s.getProperties()) {
				if (p instanceof net.minecraft.world.level.block.state.properties.IntegerProperty ip && ip.getName().equals(name)) {
					int max = 0;
					for (int v : ip.getPossibleValues()) max = Math.max(max, v);
					return new int[] { s.getValue(ip), max };
				}
			}
			return null;
		}

		@SuppressWarnings({ "rawtypes", "unchecked" })
		private static String value(BlockState s, net.minecraft.world.level.block.state.properties.Property p) {
			return p.getName(s.getValue(p));
		}

		/** The extra lines the settings ask for (those that say nothing for this block are left out), each with its colour. */
		private static List<Map.Entry<Component, Integer>> extras(Minecraft mc, BlockState s, BlockPos pos) {
			List<Map.Entry<Component, Integer>> out = new ArrayList<>();
			int muted = 0xFFAAAAAA;
			if (cfg.blockGrowth) {
				int[] age = intProperty(s, "age");
				if (age != null && age[1] > 0) {
					int pct = Math.round(age[0] * 100f / age[1]);
					out.add(Map.entry(age[0] >= age[1] ? Component.translatable("slashclient-hud.block.grown")
						: Component.translatable("slashclient-hud.block.growth", pct, age[0], age[1]), age[0] >= age[1] ? 0xFF55FF55 : 0xFFFFCC55));
				}
			}
			// what the block holds or counts, by its own numbered properties (the game's names)
			if (cfg.blockDetails) for (String name : DETAILS) {
				int[] v = intProperty(s, name);
				if (v == null) continue;
				// a note block counts from 0, a repeater's delay from 1: shown as the game numbers them
				out.add(Map.entry(Component.translatable("slashclient-hud.block.detail." + name, v[0], v[1]), v[0] >= v[1] && FULL_IS_DONE.contains(name) ? 0xFF55FF55 : 0xFFDDDDDD));
			}
			if (cfg.blockPower) {
				int[] power = intProperty(s, "power");
				int signal = power != null ? power[0] : mc.level.getBestNeighborSignal(pos);
				if (signal > 0 || power != null) out.add(Map.entry(Component.translatable("slashclient-hud.block.power", signal), signal > 0 ? 0xFFFF5555 : muted));
			}
			if (cfg.blockCoords) out.add(Map.entry(Component.literal(pos.getX() + " " + pos.getY() + " " + pos.getZ()), muted));
			if (cfg.blockLight && mc.hitResult instanceof BlockHitResult hit) {
				BlockPos face = pos.relative(hit.getDirection());
				int block = mc.level.getBrightness(net.minecraft.world.level.LightLayer.BLOCK, face), sky = mc.level.getBrightness(net.minecraft.world.level.LightLayer.SKY, face);
				// mobs spawn in the dark of block light 0
				out.add(Map.entry(Component.translatable("slashclient-hud.block.light", block, sky), block == 0 ? 0xFFFF7777 : muted));
			}
			if (cfg.blockHardness) {
				float hard = s.getDestroySpeed(mc.level, pos), blast = s.getBlock().getExplosionResistance();
				out.add(Map.entry(Component.translatable("slashclient-hud.block.hardness",
					hard < 0 ? "∞" : String.format(java.util.Locale.ROOT, "%.1f", hard), String.format(java.util.Locale.ROOT, "%.1f", blast)), muted));
			}
			if (cfg.blockId) out.add(Map.entry(Component.literal(net.minecraft.core.registries.BuiltInRegistries.BLOCK.getKey(s.getBlock()).toString()), 0xFF6B7FA8));
			if (cfg.blockState) {
				List<String> parts = new ArrayList<>();
				for (var p : s.getProperties()) {
					// what the lines above already say
					if (cfg.blockGrowth && p.getName().equals("age") || cfg.blockPower && p.getName().equals("power") || cfg.blockDetails && DETAILS.contains(p.getName())) continue;
					parts.add(p.getName() + "=" + value(s, p));
				}
				// a long state in lines of a few
				for (int i = 0; i < parts.size(); i += 3) out.add(Map.entry(Component.literal(String.join(", ", parts.subList(i, Math.min(parts.size(), i + 3)))), 0xFF8B95A7));
			}
			return out;
		}

		public int width(Minecraft mc) {
			BlockPos pos = target(mc);
			if (pos == null || !visible(mc)) return 20 + Math.max(mc.font.width(Component.translatable("block.minecraft.diamond_ore")), 70) + PAD * 2;
			BlockState s = mc.level.getBlockState(pos);
			int w = Math.max(mc.font.width(s.getBlock().getName()), mc.font.width(detail(mc, s, pos)));
			for (var line : extras(mc, s, pos)) w = Math.max(w, mc.font.width(line.getKey()));
			return 20 + w + PAD * 2;
		}

		public int height(Minecraft mc) {
			BlockPos pos = target(mc);
			int more = pos == null || !visible(mc) ? 0 : extras(mc, mc.level.getBlockState(pos), pos).size();
			return 20 + more * 10 + PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			BlockPos pos = target(mc);
			if (pos == null) return;
			BlockState s = mc.level.getBlockState(pos);
			Item item = s.getBlock().asItem();
			if (item != Items.AIR) g.item(new ItemStack(item), x + PAD, y + PAD + 2);
			text(g, mc, s.getBlock().getName(), x + PAD + 20, y + PAD, cfg.textColor);
			text(g, mc, detail(mc, s, pos), x + PAD + 20, y + PAD + 11, drops(mc, s) ? 0xFFAAAAAA : 0xFFFF5555);
			int ly = y + PAD + 22;
			for (var line : extras(mc, s, pos)) {
				text(g, mc, line.getKey(), x + PAD + 20, ly, line.getValue());
				ly += 10;
			}
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			if (visible(mc)) {
				draw(g, mc, x, y);
				return;
			}
			Ui.icon(g, Items.DIAMOND_ORE, "#", x + PAD, y + PAD + 2);
			text(g, mc, Component.translatable("block.minecraft.diamond_ore"), x + PAD + 20, y + PAD, cfg.textColor);
			text(g, mc, Component.translatable("slashclient-hud.block.tool.pickaxe").append(Component.literal(" · 0.75 s")), x + PAD + 20, y + PAD + 11, 0xFFAAAAAA);
		}
	}

	// ---------- 10. friends online, from the launcher's friends list ----------

	static final class Friends implements HudModule {
		private static final int MAX = 5;

		public String id() {
			return "friends";
		}

		private record Row(String name, Component activity, int color) {}

		private static int statusColor(String status) {
			return switch (status) {
				case "idle" -> 0xFFFACC15;
				case "dnd" -> Ui.DANGER;
				default -> Ui.GREEN;
			};
		}

		private static List<Row> rows() {
			List<Row> out = new ArrayList<>();
			for (Social.Friend f : Social.friends()) {
				if ("offline".equals(f.status())) continue;
				if (out.size() == MAX) break;
				out.add(new Row(f.name(), Social.activity(f), statusColor(f.status())));
			}
			return out;
		}

		private static List<Row> orSample() {
			List<Row> r = rows();
			return !r.isEmpty() ? r : List.of(new Row("Kuba", Component.literal("mc.hypixel.net"), Ui.GREEN), new Row("Ola", Component.literal("Survival"), 0xFFFACC15));
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !rows().isEmpty();
		}

		private static Component line(Row r) {
			return Component.literal(r.name()).append(Component.literal("  ")).append(r.activity().copy().withStyle(st -> st.withColor(0xFF9CA3AF)));
		}

		public int width(Minecraft mc) {
			int w = mc.font.width(Component.translatable("slashclient-hud.friends.online", 0));
			for (Row r : orSample()) w = Math.max(w, 9 + Math.min(170, mc.font.width(line(r))));
			return w + PAD * 2;
		}

		public int height(Minecraft mc) {
			return 11 + orSample().size() * 11 - 2 + PAD * 2;
		}

		private void drawRows(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<Row> rows, int online) {
			text(g, mc, Component.translatable("slashclient-hud.friends.online", online), x + PAD, y + PAD, Ui.ACCENT_LIGHT);
			int ry = y + PAD + 11;
			for (Row r : rows) {
				g.fill(x + PAD, ry + 2, x + PAD + 4, ry + 6, r.color());
				text(g, mc, Ui.fit(line(r), 170), x + PAD + 9, ry, cfg.textColor);
				ry += 11;
			}
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawRows(g, mc, x, y, rows(), Social.onlineCount());
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			List<Row> r = orSample();
			drawRows(g, mc, x, y, r, rows().isEmpty() ? r.size() : Social.onlineCount());
		}
	}

	// ---------- 11. the last hit: how strong, and whether it was critical ----------

	static final class Hits extends Modules.TextModule {
		private static final long SHOW_MS = 1200;

		public String id() {
			return "hits";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return System.currentTimeMillis() - Stats.hitAt < SHOW_MS;
		}

		Component content(Minecraft mc) {
			boolean real = visible(mc);
			int pct = real ? Math.round(Stats.hitStrength * 100) : 100;
			return real && !Stats.hitCritical ? Component.translatable("slashclient-hud.hits", pct) : Component.translatable("slashclient-hud.hits.crit", pct);
		}

		@Override
		int color(Minecraft mc) {
			int base = !visible(mc) || Stats.hitCritical ? 0xFFFFAA00 : grade(1 - Stats.hitStrength, 0.1, 0.6);
			if (!visible(mc)) return base;
			// fades out over its last third
			float left = 1 - (System.currentTimeMillis() - Stats.hitAt) / (float) SHOW_MS;
			int alpha = Math.max(8, Math.min(255, Math.round(255 * left * 3)));
			return (alpha << 24) | (base & 0xFFFFFF);
		}
	}
}
