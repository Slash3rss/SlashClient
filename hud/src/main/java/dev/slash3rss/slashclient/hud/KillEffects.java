package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.BlockParticleOption;
import net.minecraft.core.particles.DustParticleOptions;
import net.minecraft.core.particles.ItemParticleOption;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.Mth;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Kill effects, a SlashClient cosmetic: a short burst of the game's own particles where a mob or a
 * player falls, made on our side only (no sounds, nothing sent to the game's server, no effect on play).
 *
 * When one plays, for any living entity but armour stands, once it starts dying (its health reaches
 * 0: the client learns that from the entity's data or the death event, the same on every version):
 * - our own kill: we hit it (AttackEntityCallback, see SlashHud) in the last {@link #KILL_MS}: our effect;
 * - another player's, best effort (the client is never told who killed what): the nearest other
 *   player with a kill effect who swung an arm in the last {@link #OTHER_MS} and stands within
 *   {@link #OTHER_REACH} blocks of it gets the credit. Bows, tridents, fire and falls are not seen;
 *   of two players swinging at the same mob the closer one wins.
 * What others wear comes from the SlashClient server, like the rest of the cosmetics.
 */
public final class KillEffects {
	private KillEffects() {}

	/** In the order of the menus (and of the server's catalog). */
	public static final List<String> IDS = List.of("lightning", "blood", "heartburst", "firework", "soulrise", "enderpoof",
		"confetti", "blast", "shatter", "coins", "ghost", "flamering");
	static final long KILL_MS = 2000, OTHER_MS = 1000;
	static final double OTHER_REACH = 6;
	/** Further than this nobody would see it. */
	private static final double RANGE_SQ = 64 * 64;
	private static final int MAX_PLAYING = 12;
	private static final RandomSource R = RandomSource.create();

	/** One effect being played: where (the victim's feet and size) and for how many ticks yet. */
	private static final class Play {
		final String kind;
		final double x, y, z, w, h;
		/** How big it is drawn: a chicken's is smaller than a player's, a ghast's bigger. */
		final double s;
		final int seed = R.nextInt();
		int age;

		Play(String kind, double x, double y, double z, double w, double h) {
			this.kind = kind;
			this.x = x;
			this.y = y;
			this.z = z;
			this.w = w;
			this.h = h;
			this.s = Mth.clamp(Math.max(w, h) / 1.8, 0.5, 2.5);
		}

		double cy() {
			return y + h * 0.5;
		}

		/** A number of particles, more for bigger victims. */
		int n(int base) {
			return Math.max(1, (int) Math.round(base * s));
		}
	}

	private static final List<Play> playing = new ArrayList<>();
	/** Entities we hit, by id, and when. */
	private static final Map<Integer, Long> ourHits = new HashMap<>();
	/** Other players' last arm swing, and when. */
	private static final Map<UUID, Long> swings = new HashMap<>();
	/** Entities already seen dying, so each death plays once. */
	private static final Set<Integer> dying = new HashSet<>();
	private static int tick;
	/** For the test: the last effect that started, and for whom ("self" or the player's name). */
	static String lastStarted = "";

	/** Called just before the local player hits `target`. */
	static void attacked(Entity target) {
		// a body still falling over is not a new kill (fast clicking hits it again)
		if (target instanceof LivingEntity le && !le.isDeadOrDying()) ourHits.put(target.getId(), System.currentTimeMillis());
	}

	static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null) {
			reset();
			return;
		}
		// in a paused game the particles stand still: so does the effect
		if (mc.isPaused()) return;
		tick++;
		long now = System.currentTimeMillis();
		for (Player p : mc.level.players()) if (p != mc.player && swinging(p)) swings.put(p.getUUID(), now);
		for (Entity e : mc.level.entitiesForRendering()) {
			if (!(e instanceof LivingEntity le) || e instanceof ArmorStand || !le.isDeadOrDying()) continue;
			if (dying.add(e.getId())) died(mc, le, now);
		}
		if (tick % 20 == 0) {
			// gone, or alive again (our own player comes back with the same id)
			dying.removeIf(id -> !(mc.level.getEntity(id) instanceof LivingEntity le) || !le.isDeadOrDying());
			ourHits.values().removeIf(t -> now - t > KILL_MS);
			swings.values().removeIf(t -> now - t > OTHER_MS);
		}
		for (Iterator<Play> it = playing.iterator(); it.hasNext(); ) {
			Play p = it.next();
			step(mc, p);
			if (++p.age > duration(p.kind)) it.remove();
		}
	}

	private static boolean swinging(Player p) {
		//#if MC >= 26.3
		return p.isSwinging();
		//#else
		//$ return p.swinging;
		//#endif
	}

	/** Whose effect, if any, plays where `victim` started dying. */
	private static void died(Minecraft mc, LivingEntity victim, long now) {
		Long ours = ourHits.remove(victim.getId());
		if (SlashHud.config == null || !SlashHud.config.killEffects || victim.distanceToSqr(mc.player) > RANGE_SQ) return;
		if (ours != null && now - ours <= KILL_MS) {
			String kind = Cosmetics.worn(mc.player.getUUID(), "kill");
			if (kind != null) start(kind, victim, "self");
			return;
		}
		if (!SlashHud.config.killEffectsOthers) return;
		Player best = null;
		double bestD = OTHER_REACH * OTHER_REACH;
		for (Player p : mc.level.players()) {
			if (p == mc.player || p == victim) continue;
			Long at = swings.get(p.getUUID());
			if (at == null || now - at > OTHER_MS) continue;
			double d = p.distanceToSqr(victim);
			if (d <= bestD && Cosmetics.worn(p.getUUID(), "kill") != null) {
				best = p;
				bestD = d;
			}
		}
		if (best != null) start(Cosmetics.worn(best.getUUID(), "kill"), victim, best.getName().getString());
	}

	private static void start(String kind, Entity at, String whose) {
		play(kind, at.getX(), at.getY(), at.getZ(), at.getBbWidth(), at.getBbHeight());
		lastStarted = kind + ":" + whose;
	}

	/** Plays an effect at a spot, for something `w` wide and `h` tall standing there. */
	static void play(String kind, double x, double y, double z, double w, double h) {
		if (!IDS.contains(kind)) return;
		if (playing.size() >= MAX_PLAYING) playing.remove(0);
		playing.add(new Play(kind, x, y, z, w, h));
	}

	/**
	 * The menu's preview: the effect on a figure the size of a player, a little to the left of our
	 * own player (seen from behind there, it stays clear of the menu's panel on the right).
	 */
	static void preview(Minecraft mc, String kind) {
		if (mc.player == null || mc.level == null) return;
		double yaw = Math.toRadians(mc.player.getYRot());
		double x = mc.player.getX() + Math.cos(yaw) * 2.4 - Math.sin(yaw) * 0.5, z = mc.player.getZ() + Math.sin(yaw) * 2.4 + Math.cos(yaw) * 0.5;
		play(kind, x, mc.player.getY(), z, 0.6, 1.8);
	}

	static int playingCount() {
		return playing.size();
	}

	static void reset() {
		playing.clear();
		ourHits.clear();
		swings.clear();
		dying.clear();
	}

	private static int duration(String kind) {
		return switch (kind) {
			case "soulrise", "confetti" -> 26;
			case "ghost" -> 34;
			case "flamering", "coins", "firework" -> 16;
			default -> 12;
		};
	}

	// ---------- the effects, a tick at a time (t = ticks since the start) ----------

	private static void step(Minecraft mc, Play p) {
		int t = p.age;
		switch (p.kind) {
			case "lightning" -> lightning(mc, p, t);
			case "blood" -> {
				if (t == 0) {
					BlockParticleOption red = block(Blocks.REDSTONE_BLOCK.defaultBlockState());
					for (int i = 0; i < p.n(30); i++) add(mc, red, inX(p), p.y + R.nextDouble() * p.h, inZ(p), spread(0.15), 0.1 + R.nextDouble() * 0.2, spread(0.15));
					for (int i = 0; i < p.n(24); i++) add(mc, dust(0x7A0000, 1.6f), inX(p), p.y + R.nextDouble() * p.h, inZ(p), 0, 0, 0);
				}
				if (t == 2 || t == 4) for (int i = 0; i < p.n(10); i++) add(mc, dust(0xB00000, 1.1f), inX(p), p.y + R.nextDouble() * p.h * 0.6, inZ(p), 0, 0, 0);
			}
			case "heartburst" -> {
				if (t == 0 || t == 3 || t == 6) {
					int count = t == 0 ? 10 : t == 3 ? 8 : 6;
					double r = p.w * 0.6 + 0.3 + t * 0.08;
					for (int i = 0; i < count; i++) {
						double a = Math.PI * 2 * i / count + t;
						add(mc, ParticleTypes.HEART, p.x + Math.cos(a) * r * p.s, p.y + p.h * (0.4 + t * 0.1), p.z + Math.sin(a) * r * p.s, 0, 0, 0);
					}
				}
			}
			case "firework" -> firework(mc, p, t);
			case "soulrise" -> {
				if (t == 0) ring(mc, p, ParticleTypes.SOUL_FIRE_FLAME, p.n(16), p.w * 0.5 + 0.4, p.y + 0.1, 0.02);
				if (t % 2 == 0 && t < 22) for (int i = 0; i < p.n(3); i++)
					add(mc, i % 2 == 0 ? ParticleTypes.SOUL : ParticleTypes.SOUL_FIRE_FLAME, inX(p), p.y + R.nextDouble() * p.h * 0.6, inZ(p), 0, 0.05 + R.nextDouble() * 0.03, 0);
			}
			case "enderpoof" -> {
				if (t == 0) {
					for (int i = 0; i < p.n(40); i++) {
						Vec3 d = direction();
						add(mc, ParticleTypes.REVERSE_PORTAL, p.x, p.cy(), p.z, d.x * 0.12 * p.s, d.y * 0.12 * p.s, d.z * 0.12 * p.s);
					}
					// these fly in from around it
					for (int i = 0; i < p.n(30); i++) {
						Vec3 d = direction();
						add(mc, ParticleTypes.PORTAL, p.x, p.cy() - 0.5, p.z, d.x * 1.4 * p.s, d.y * 1.2 * p.s, d.z * 1.4 * p.s);
					}
				}
				if (t == 1) for (int i = 0; i < p.n(8); i++) add(mc, ParticleTypes.POOF, inX(p), p.y + R.nextDouble() * p.h, inZ(p), spread(0.05), 0.02, spread(0.05));
				if (t == 3) for (int i = 0; i < p.n(20); i++) {
					Vec3 d = direction();
					add(mc, ParticleTypes.REVERSE_PORTAL, p.x, p.cy(), p.z, d.x * 0.07, d.y * 0.07, d.z * 0.07);
				}
			}
			case "confetti" -> {
				double top = p.y + p.h + 0.4;
				if (t == 0) for (int i = 0; i < p.n(30); i++) {
					Vec3 d = direction();
					double r = 0.3 + R.nextDouble() * 0.7;
					add(mc, dust(confetti(), 1.1f), p.x + d.x * r * p.s, top + Math.abs(d.y) * r, p.z + d.z * r * p.s, 0, 0, 0);
				}
				// a sheet of bits falling from above the head
				if (t < 22) for (int i = 0; i < p.n(6); i++) {
					double a = R.nextDouble() * Math.PI * 2, r = Math.sqrt(R.nextDouble()) * 1.5 * p.s;
					add(mc, dust(confetti(), 0.8f + R.nextFloat() * 0.5f), p.x + Math.cos(a) * r, top + 1.4 - t * 0.1, p.z + Math.sin(a) * r, 0, 0, 0);
				}
			}
			case "blast" -> {
				if (t == 0) {
					// the game's explosion puff without the explosion: its size from the first speed (0: 2 blocks, 1: 1 block)
					add(mc, ParticleTypes.EXPLOSION, p.x, p.cy(), p.z, p.s < 1.3 ? 1 : 0.5, 0, 0);
					if (p.s > 1.3) for (int i = 0; i < 2; i++) add(mc, ParticleTypes.EXPLOSION, inX(p), p.y + R.nextDouble() * p.h, inZ(p), 0, 0, 0);
					for (int i = 0; i < p.n(20); i++) {
						Vec3 d = direction();
						add(mc, ParticleTypes.POOF, p.x, p.cy(), p.z, d.x * 0.18, d.y * 0.18, d.z * 0.18);
					}
				}
				if (t == 1) for (int i = 0; i < p.n(10); i++) {
					Vec3 d = direction();
					add(mc, ParticleTypes.FLAME, p.x, p.cy(), p.z, d.x * 0.1, Math.abs(d.y) * 0.1, d.z * 0.1);
				}
				if (t == 2 || t == 5) for (int i = 0; i < p.n(5); i++) add(mc, ParticleTypes.LARGE_SMOKE, inX(p), p.y + R.nextDouble() * p.h, inZ(p), 0, 0.04, 0);
			}
			case "shatter" -> {
				if (t == 0) {
					BlockParticleOption packed = block(Blocks.PACKED_ICE.defaultBlockState()), blue = block(Blocks.BLUE_ICE.defaultBlockState());
					for (int i = 0; i < p.n(36); i++) add(mc, i % 2 == 0 ? packed : blue, inX(p), p.y + R.nextDouble() * p.h, inZ(p), spread(0.2), 0.15, spread(0.2));
					for (int i = 0; i < p.n(22); i++) {
						Vec3 d = direction();
						add(mc, ParticleTypes.SNOWFLAKE, p.x, p.cy(), p.z, d.x * 0.16, Math.abs(d.y) * 0.16, d.z * 0.16);
					}
					ring(mc, p, dust(0xCFF2FF, 1.3f), p.n(18), p.w * 0.6 + 0.3, p.cy(), 0);
				}
				if (t == 2) for (int i = 0; i < p.n(10); i++) add(mc, ParticleTypes.ITEM_SNOWBALL, inX(p), p.y + R.nextDouble() * p.h, inZ(p), spread(0.1), 0.1, spread(0.1));
			}
			case "coins" -> {
				// a fountain of gold nuggets (the game's item crumbs fall with gravity)
				if (t <= 2) {
					ItemParticleOption nugget = item(Items.GOLD_NUGGET), ingot = item(Items.GOLD_INGOT);
					for (int i = 0; i < p.n(9); i++) {
						double a = R.nextDouble() * Math.PI * 2, v = 0.06 + R.nextDouble() * 0.1;
						add(mc, i % 4 == 0 ? ingot : nugget, p.x, p.y + p.h * 0.8, p.z, Math.cos(a) * v, 0.25 + R.nextDouble() * 0.2, Math.sin(a) * v);
					}
				}
				if (t == 0) for (int i = 0; i < p.n(8); i++) add(mc, block(Blocks.GOLD_BLOCK.defaultBlockState()), inX(p), p.y + R.nextDouble() * p.h, inZ(p), 0, 0.1, 0);
				if (t % 4 == 0) for (int i = 0; i < p.n(4); i++) add(mc, ParticleTypes.WAX_ON, inX(p), p.y + R.nextDouble() * p.h * 1.2, inZ(p), 0, 0.5, 0);
			}
			case "ghost" -> ghost(mc, p, t);
			case "flamering" -> {
				if (t == 0 || t == 4) {
					int count = p.n(t == 0 ? 28 : 20);
					for (int i = 0; i < count; i++) {
						double a = Math.PI * 2 * i / count;
						double v = t == 0 ? 0.13 : 0.09;
						add(mc, ParticleTypes.FLAME, p.x + Math.cos(a) * p.w * 0.5, p.y + 0.15, p.z + Math.sin(a) * p.w * 0.5, Math.cos(a) * v, 0.005, Math.sin(a) * v);
					}
				}
				if (t == 0) for (int i = 0; i < p.n(3); i++) add(mc, ParticleTypes.LAVA, inX(p), p.y + 0.2, inZ(p), 0, 0, 0);
				if (t == 10) ring(mc, p, ParticleTypes.SMOKE, p.n(16), p.w * 0.5 + 1.2 * p.s, p.y + 0.2, 0.03);
			}
			default -> {}
		}
	}

	/** A jagged bolt from the sky down to the victim, a second one flickering, sparks where it hits. */
	private static void lightning(Minecraft mc, Play p, int t) {
		if (t == 0 || t == 2) {
			RandomSource r = RandomSource.create(p.seed + t);
			boolean main = t == 0;
			double top = p.y + p.h + 6, x = p.x, z = p.z;
			for (double y = top; y > p.y; y -= 0.18) {
				x += (r.nextDouble() - 0.5) * 0.22;
				z += (r.nextDouble() - 0.5) * 0.22;
				x = Mth.clamp(x, p.x - 0.7, p.x + 0.7);
				z = Mth.clamp(z, p.z - 0.7, p.z + 0.7);
				add(mc, dust(main ? 0xEAF6FF : 0xB8E2FF, main ? 1.7f : 1.0f), x, y, z, 0, 0, 0);
				// a few short branches off the main bolt
				if (main && r.nextInt(14) == 0) {
					double bx = x, bz = z, dx = (r.nextDouble() - 0.5) * 0.3, dz = (r.nextDouble() - 0.5) * 0.3;
					for (int i = 0; i < 6; i++) add(mc, dust(0xA8D8FF, 0.9f), bx += dx, y - i * 0.15, bz += dz, 0, 0, 0);
				}
			}
			if (main) {
				for (int i = 0; i < p.n(26); i++) {
					Vec3 d = direction();
					add(mc, ParticleTypes.ELECTRIC_SPARK, p.x, p.y + 0.2, p.z, d.x * 0.35, Math.abs(d.y) * 0.3, d.z * 0.35);
				}
				for (int i = 0; i < p.n(6); i++) add(mc, ParticleTypes.CLOUD, inX(p), p.y + 0.1, inZ(p), spread(0.05), 0.02, spread(0.05));
			}
		}
		if (t >= 4 && t % 2 == 0) for (int i = 0; i < p.n(3); i++) add(mc, ParticleTypes.ELECTRIC_SPARK, inX(p), p.y + R.nextDouble() * p.h, inZ(p), 0, 0, 0);
	}

	private static final int[] FIREWORK_COLORS = {0xFF3B3B, 0xFFD93B, 0x3BFF6E, 0x3BC8FF, 0xC63BFF, 0xFF7AD9};

	/** A round burst in two colours above the victim, its sparks drifting down. */
	private static void firework(Minecraft mc, Play p, int t) {
		int a = FIREWORK_COLORS[Math.floorMod(p.seed, FIREWORK_COLORS.length)], b = FIREWORK_COLORS[Math.floorMod(p.seed >> 8, FIREWORK_COLORS.length)];
		double cx = p.x, cy = p.y + p.h + 0.8, cz = p.z;
		if (t == 0) for (int i = 0; i < p.n(36); i++) {
			Vec3 d = direction();
			add(mc, ParticleTypes.FIREWORK, cx, cy, cz, d.x * 0.17, d.y * 0.17, d.z * 0.17);
		}
		if (t <= 5) {
			double r = (0.25 + t * 0.3) * p.s;
			for (int i = 0; i < p.n(26); i++) {
				Vec3 d = direction();
				add(mc, dust(i % 2 == 0 ? a : b, 1.0f), cx + d.x * r, cy + d.y * r, cz + d.z * r, 0, 0, 0);
			}
		} else if (t % 2 == 0) for (int i = 0; i < p.n(6); i++) {
			Vec3 d = direction();
			double r = 1.7 * p.s * R.nextDouble();
			add(mc, dust(i % 2 == 0 ? a : b, 0.9f), cx + d.x * r, cy + d.y * r - (t - 5) * 0.08, cz + d.z * r, 0, 0, 0);
		}
	}

	/** A small white ghost with dark eyes rising out of the body, swaying, then gone in a puff. */
	private static void ghost(Minecraft mc, Play p, int t) {
		double k = Math.min(p.s, 1.5);
		double gx = p.x + Math.sin(t * 0.35) * 0.18 * k, gy = p.y + p.h * 0.55 + t * 0.075, gz = p.z + Math.cos(t * 0.35) * 0.08 * k;
		if (t == 0) for (int i = 0; i < 4; i++) add(mc, ParticleTypes.SOUL, gx, gy, gz, spread(0.03), 0.04, spread(0.03));
		if (t >= 30) {
			if (t == 30) for (int i = 0; i < 6; i++) add(mc, ParticleTypes.POOF, gx, gy, gz, spread(0.04), 0.02, spread(0.04));
			return;
		}
		ParticleOptions white = dust(0xF4F6FF, (float) (0.6 * k));
		// the head: a round top
		for (int i = 0; i < 6; i++) {
			Vec3 d = direction();
			add(mc, white, gx + d.x * 0.2 * k, gy + 0.15 * k + Math.abs(d.y) * 0.2 * k, gz + d.z * 0.2 * k, 0, 0, 0);
		}
		// the body, wider at the wavy bottom
		for (int i = 0; i < 6; i++) {
			double a = R.nextDouble() * Math.PI * 2, f = R.nextDouble();
			double r = (0.2 + f * 0.08) * k;
			add(mc, white, gx + Math.cos(a) * r, gy + (0.15 - f * 0.4 + Math.sin(a * 3 + t) * 0.04) * k, gz + Math.sin(a) * r, 0, 0, 0);
		}
		// the eyes look at whoever watches
		if (t % 2 == 0) {
			var camera = Compat.camera(mc);
			Vec3 eye = camera.position();
			Vec3 to = new Vec3(eye.x - gx, 0, eye.z - gz);
			if (to.lengthSqr() > 1.0E-4) {
				to = to.normalize();
				Vec3 side = new Vec3(-to.z, 0, to.x);
				for (int s = -1; s <= 1; s += 2) add(mc, dust(0x14141C, (float) (0.5 * k)),
					gx + (to.x * 0.24 + side.x * 0.08 * s) * k, gy + 0.2 * k, gz + (to.z * 0.24 + side.z * 0.08 * s) * k, 0, 0, 0);
			}
		}
	}

	// ---------- helpers ----------

	private static void ring(Minecraft mc, Play p, ParticleOptions type, int count, double r, double y, double vy) {
		for (int i = 0; i < count; i++) {
			double a = Math.PI * 2 * i / count;
			add(mc, type, p.x + Math.cos(a) * r, y, p.z + Math.sin(a) * r, 0, vy, 0);
		}
	}

	/** A random direction, evenly over a sphere. */
	private static Vec3 direction() {
		double y = R.nextDouble() * 2 - 1, a = R.nextDouble() * Math.PI * 2, r = Math.sqrt(1 - y * y);
		return new Vec3(Math.cos(a) * r, y, Math.sin(a) * r);
	}

	private static double inX(Play p) {
		return p.x + (R.nextDouble() - 0.5) * p.w;
	}

	private static double inZ(Play p) {
		return p.z + (R.nextDouble() - 0.5) * p.w;
	}

	private static double spread(double v) {
		return (R.nextDouble() - 0.5) * 2 * v;
	}

	private static int confetti() {
		return FIREWORK_COLORS[R.nextInt(FIREWORK_COLORS.length)];
	}

	private static ParticleOptions dust(int rgb, float size) {
		//#if MC >= 1.21.4
		return new DustParticleOptions(rgb, size);
		//#else
		//$ return new DustParticleOptions(new org.joml.Vector3f(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f), size);
		//#endif
	}

	private static BlockParticleOption block(BlockState state) {
		return new BlockParticleOption(ParticleTypes.BLOCK, state);
	}

	private static ItemParticleOption item(Item item) {
		//#if MC >= 26.1
		return new ItemParticleOption(ParticleTypes.ITEM, item);
		//#else
		//$ return new ItemParticleOption(ParticleTypes.ITEM, new net.minecraft.world.item.ItemStack(item));
		//#endif
	}

	private static void add(Minecraft mc, ParticleOptions type, double x, double y, double z, double vx, double vy, double vz) {
		mc.level.addParticle(type, x, y, z, vx, vy, vz);
	}
}
