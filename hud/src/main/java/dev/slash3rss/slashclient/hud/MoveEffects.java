package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Movement effects, a SlashClient cosmetic: the game's own particles when the wearer walks (footprints,
 * petals), jumps (a puff), lands from high up (a shockwave ring and a double sparkle), sprints (sparks),
 * goes into or swims in water (bubbles) or shoots (a streak behind the arrow, snowball, trident…).
 * Made on our side only, from what every client sees anyway: other players' positions, whether they
 * stand on the ground, sprint or swim (the game tells all of that), and who shot a projectile.
 * What others wear comes from the SlashClient server. Every player has a cooldown per burst and all of
 * them together at most {@link #BUDGET} particles a tick.
 */
public final class MoveEffects {
	private MoveEffects() {}

	/** In the order of the menus (and of the server's catalog). */
	public static final List<String> IDS = List.of("move_steps", "move_jump", "move_landing", "move_arrows", "move_sprint",
		"move_bubbles", "move_petals");
	/** Further than this nobody would see them. */
	private static final double RANGE_SQ = 48 * 48;
	private static final int BUDGET = 90;
	/** A fall at least this high (blocks) ends in a shockwave. */
	static final double LANDING_FALL = 2.0;
	private static final double STEP = 0.75;
	private static final RandomSource R = RandomSource.create();

	/** What we know of a player from the last tick. */
	private static final class Track {
		Vec3 last;
		boolean ground = true, water;
		/** The highest point since leaving the ground. */
		double peak;
		double walked;
		boolean left;
		/** Ticks until a burst (jump, landing, splash) may come again. */
		int cooldown;
	}

	private static final Map<UUID, Track> tracks = new HashMap<>();
	/** Projectiles leaving a streak: where they were last tick. */
	private static final Map<Integer, Vec3> shots = new HashMap<>();
	/** Parts of an effect that come a few ticks later (the landing's second sparkle). */
	private static final List<Later> later = new ArrayList<>();
	private record Later(int at, Runnable run) {}
	private static int tick, budget;
	/** For the test: the last effect that played ("kind:player") and how many have played. */
	static String lastPlayed = "";
	static int played;

	static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			reset();
			return;
		}
		if (mc.isPaused()) return;
		tick++;
		budget = BUDGET;
		for (Iterator<Later> it = later.iterator(); it.hasNext(); ) {
			Later l = it.next();
			if (l.at() <= tick) {
				l.run().run();
				it.remove();
			}
		}
		boolean on = SlashHud.config != null && SlashHud.config.moveEffects && Badges.enabled();
		boolean arrows = false;
		for (Player p : mc.level.players()) {
			Track t = tracks.computeIfAbsent(p.getUUID(), k -> new Track());
			Vec3 pos = p.position();
			boolean ground = p.onGround(), water = p.isInWater();
			String kind = Cosmetics.worn(p.getUUID(), "move");
			boolean self = p == mc.player;
			boolean show = on && kind != null && (self || SlashHud.config.moveEffectsOthers) && !p.isInvisible() && !p.isSpectator()
				&& p.distanceToSqr(mc.player) <= RANGE_SQ;
			if (t.cooldown > 0) t.cooldown--;
			if (show && "move_arrows".equals(kind)) arrows = true;
			if (show && t.last != null && !p.isPassenger()) moved(mc, p, t, kind, pos, ground, water);
			t.peak = ground || water ? pos.y : Math.max(t.peak, pos.y);
			t.last = pos;
			t.ground = ground;
			t.water = water;
		}
		if (arrows) streaks(mc);
		else shots.clear();
		if (tick % 200 == 0) tracks.keySet().removeIf(id -> mc.level.players().stream().noneMatch(p -> p.getUUID().equals(id)));
	}

	/** What a player's move this tick sets off, for the effect they wear. */
	private static void moved(Minecraft mc, Player p, Track t, String kind, Vec3 pos, boolean ground, boolean water) {
		double dx = pos.x - t.last.x, dz = pos.z - t.last.z, dy = pos.y - t.last.y;
		double flat = Math.hypot(dx, dz);
		// a jump: off the ground, upwards (not falling off an edge, not swimming up)
		boolean jumped = t.ground && !ground && dy > 0.05 && !water;
		boolean landed = !t.ground && ground && !water;
		switch (kind) {
			case "move_steps" -> {
				if (!ground || flat < 0.01 || water) break;
				t.walked += flat;
				if (t.walked < STEP) break;
				t.walked = 0;
				t.left = !t.left;
				footprint(mc, pos, dx / flat, dz / flat, t.left);
				played(kind, p);
			}
			case "move_jump" -> {
				if (!jumped || t.cooldown > 0) break;
				t.cooldown = 6;
				for (int i = 0; i < 12; i++) {
					double a = Math.PI * 2 * i / 12;
					add(mc, ParticleTypes.CLOUD, pos.x + Math.cos(a) * 0.3, pos.y + 0.05, pos.z + Math.sin(a) * 0.3, Math.cos(a) * 0.08, 0.01, Math.sin(a) * 0.08);
				}
				for (int i = 0; i < 4; i++) add(mc, ParticleTypes.POOF, pos.x + spread(0.3), pos.y + 0.1, pos.z + spread(0.3), 0, 0.02, 0);
				played(kind, p);
			}
			case "move_landing" -> {
				double fall = t.peak - pos.y;
				if (!landed || fall < LANDING_FALL || t.cooldown > 0) break;
				t.cooldown = 10;
				landing(mc, pos, Math.min(2.2, 1 + (fall - LANDING_FALL) / 8));
				played(kind, p);
			}
			case "move_sprint" -> {
				if (!ground || !p.isSprinting() || flat < 0.12 || tick % 2 != 0) break;
				double bx = pos.x - dx / flat * 0.35, bz = pos.z - dz / flat * 0.35;
				add(mc, ParticleTypes.ELECTRIC_SPARK, bx + spread(0.25), pos.y + 0.1, bz + spread(0.25), -dx * 0.6 + spread(0.08), 0.12, -dz * 0.6 + spread(0.08));
				if (R.nextInt(3) == 0) add(mc, ParticleTypes.CRIT, bx, pos.y + 0.15, bz, -dx * 0.5, 0.15, -dz * 0.5);
				if (tick % 6 == 0) played(kind, p);
			}
			case "move_bubbles" -> {
				if (water && !t.water && t.cooldown == 0) {
					// into the water: a burst
					t.cooldown = 10;
					for (int i = 0; i < 24; i++) add(mc, ParticleTypes.BUBBLE, pos.x + spread(0.6), pos.y + R.nextDouble() * 0.8, pos.z + spread(0.6), spread(0.15), 0.1 + R.nextDouble() * 0.15, spread(0.15));
					for (int i = 0; i < 8; i++) add(mc, ParticleTypes.SPLASH, pos.x + spread(0.8), pos.y + 0.8, pos.z + spread(0.8), 0, 0.2, 0);
					played(kind, p);
				} else if (water && (flat > 0.05 || Math.abs(dy) > 0.05) && tick % 3 == 0) {
					// swimming: a stream of them behind
					for (int i = 0; i < 2; i++) add(mc, ParticleTypes.BUBBLE, pos.x - dx * 2 + spread(0.3), pos.y + 0.3 + R.nextDouble() * 0.6, pos.z - dz * 2 + spread(0.3), 0, 0.05, 0);
				} else if (!water && t.water && t.cooldown == 0) {
					// out of it: they pop
					t.cooldown = 10;
					for (int i = 0; i < 10; i++) add(mc, ParticleTypes.BUBBLE_POP, pos.x + spread(0.6), pos.y + 0.2 + R.nextDouble() * 0.8, pos.z + spread(0.6), 0, 0.03, 0);
				}
			}
			case "move_petals" -> {
				if (!ground || flat < 0.05 || water || tick % 3 != 0) break;
				add(mc, ParticleTypes.CHERRY_LEAVES, pos.x + spread(0.4), pos.y + 0.25 + R.nextDouble() * 0.3, pos.z + spread(0.4), 0, 0, 0);
				if (tick % 9 == 0) played(kind, p);
			}
			default -> {}
		}
	}

	/** A footprint: a heel and the toes, a little to the side of where the player walks, glowing softly. */
	private static void footprint(Minecraft mc, Vec3 pos, double fx, double fz, boolean left) {
		double sx = -fz * (left ? 0.13 : -0.13), sz = fx * (left ? 0.13 : -0.13);
		double x = pos.x + sx, z = pos.z + sz, y = pos.y + 0.03;
		ParticleOptions print = dust(0x9FE4FF, 1.0f);
		add(mc, print, x - fx * 0.08, y, z - fz * 0.08, 0, 0, 0);
		add(mc, print, x + fx * 0.06, y, z + fz * 0.06, 0, 0, 0);
		add(mc, dust(0xD8F6FF, 0.75f), x + fx * 0.16 - fz * 0.03, y, z + fz * 0.16 + fx * 0.03, 0, 0, 0);
		add(mc, dust(0xD8F6FF, 0.75f), x + fx * 0.16 + fz * 0.03, y, z + fz * 0.16 - fx * 0.03, 0, 0, 0);
	}

	/** A ring of dust running out over the ground, a burst of sparks, and a second, smaller one a moment later. */
	private static void landing(Minecraft mc, Vec3 pos, double k) {
		int n = (int) Math.round(28 * k);
		for (int i = 0; i < n; i++) {
			double a = Math.PI * 2 * i / n, v = 0.28 * k;
			add(mc, ParticleTypes.CLOUD, pos.x + Math.cos(a) * 0.4, pos.y + 0.08, pos.z + Math.sin(a) * 0.4, Math.cos(a) * v, 0.005, Math.sin(a) * v);
		}
		// short-lived ones (the firework's sparks would hang in the air for seconds)
		sparkle(mc, pos, (int) Math.round(16 * k), 0.4, ParticleTypes.CRIT);
		int at = tick + 4;
		later.add(new Later(at, () -> sparkle(mc, pos, (int) Math.round(12 * k), 0.3, ParticleTypes.ENCHANTED_HIT)));
	}

	private static void sparkle(Minecraft mc, Vec3 pos, int n, double v, ParticleOptions type) {
		if (mc.level == null) return;
		for (int i = 0; i < n; i++) {
			double a = R.nextDouble() * Math.PI * 2;
			add(mc, type, pos.x + Math.cos(a) * 0.3, pos.y + 0.2, pos.z + Math.sin(a) * 0.3, Math.cos(a) * v, 0.35 + R.nextDouble() * 0.3, Math.sin(a) * v);
		}
	}

	/** Streaks behind the flying projectiles of players who wear them. */
	private static void streaks(Minecraft mc) {
		Map<Integer, Vec3> seen = new HashMap<>();
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!(e instanceof Projectile pr) || !(pr.getOwner() instanceof Player owner)) continue;
			if (!"move_arrows".equals(Cosmetics.worn(owner.getUUID(), "move"))) continue;
			if (owner != mc.player && !SlashHud.config.moveEffectsOthers) continue;
			if (e.distanceToSqr(mc.player) > RANGE_SQ) continue;
			Vec3 pos = e.position(), before = shots.get(e.getId());
			seen.put(e.getId(), pos);
			// stuck in a block (or not moving): nothing
			if (before == null || pos.distanceToSqr(before) < 0.04) continue;
			for (int i = 0; i < 4; i++) {
				double f = i / 4.0;
				add(mc, dust(i % 2 == 0 ? 0xFFD84A : 0xFFF6D0, 1.1f), before.x + (pos.x - before.x) * f, before.y + (pos.y - before.y) * f, before.z + (pos.z - before.z) * f, 0, 0, 0);
			}
			if (tick % 3 == 0) add(mc, ParticleTypes.ELECTRIC_SPARK, pos.x, pos.y, pos.z, 0, 0, 0);
			lastPlayed = "move_arrows:" + owner.getName().getString();
		}
		shots.clear();
		shots.putAll(seen);
	}

	private static void played(String kind, Player p) {
		lastPlayed = kind + ":" + p.getName().getString();
		played++;
	}

	private static double spread(double v) {
		return (R.nextDouble() - 0.5) * 2 * v;
	}

	private static ParticleOptions dust(int rgb, float size) {
		//#if MC >= 1.21.4
		return new DustParticleOptions(rgb, size);
		//#else
		//$ return new DustParticleOptions(new org.joml.Vector3f(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f), size);
		//#endif
	}

	private static void add(Minecraft mc, ParticleOptions type, double x, double y, double z, double vx, double vy, double vz) {
		if (budget-- <= 0) return;
		mc.level.addParticle(type, x, y, z, vx, vy, vz);
	}

	static void reset() {
		tracks.clear();
		shots.clear();
		later.clear();
	}
}
