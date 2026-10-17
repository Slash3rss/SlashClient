package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.particles.ParticleOptions;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Trails and auras: the game's own particles, made on our side only (others with SlashClient
 * see them the same way, from what the server says each player wears).
 * A trail follows a player who moves; an aura circles one who stands still.
 */
final class CosmeticEffects {
	private CosmeticEffects() {}

	/** Players further than this get no particles: nobody would see them. */
	private static final double RANGE_SQ = 48 * 48;
	private static final Map<UUID, Vec3> lastPos = new ConcurrentHashMap<>();
	private static final RandomSource RANDOM = RandomSource.create();
	private static int tick;

	static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null || !Badges.enabled() || Compat.screen(mc) instanceof net.minecraft.client.gui.screens.PauseScreen) {
			lastPos.clear();
			return;
		}
		tick++;
		for (Player p : mc.level.players()) {
			UUID id = p.getUUID();
			Vec3 pos = p.position();
			Vec3 before = lastPos.put(id, pos);
			if (p.isInvisible() || p.isSpectator() || p.distanceToSqr(mc.player) > RANGE_SQ) continue;
			String trail = Cosmetics.worn(id, "trail");
			String aura = Cosmetics.worn(id, "aura");
			if (trail == null && aura == null) continue;
			double moved = before == null ? 0 : Math.hypot(pos.x - before.x, pos.z - before.z);
			if (moved > 0.03 || (before != null && Math.abs(pos.y - before.y) > 0.1)) {
				if (trail != null && tick % 2 == 0) trail(mc, trail, pos, before == null ? pos : before);
			} else if (aura != null) {
				// not around our own head in first person: it would only cover the view
				boolean self = p == mc.player && mc.options.getCameraType().isFirstPerson();
				if (!self) aura(mc, aura, p);
			}
		}
		if (tick % 200 == 0) lastPos.keySet().removeIf(id -> mc.level.players().stream().noneMatch(p -> p.getUUID().equals(id)));
	}

	/** One puff behind the feet, where the player just was. */
	private static void trail(Minecraft mc, String kind, Vec3 pos, Vec3 before) {
		double x = before.x + (RANDOM.nextDouble() - 0.5) * 0.3;
		double y = pos.y + 0.1 + RANDOM.nextDouble() * 0.2;
		double z = before.z + (RANDOM.nextDouble() - 0.5) * 0.3;
		switch (kind) {
			case "hearts" -> add(mc, ParticleTypes.HEART, x, y + 0.3, z, 0, 0, 0);
			case "sparks" -> add(mc, ParticleTypes.ELECTRIC_SPARK, x, y, z, (RANDOM.nextDouble() - 0.5) * 0.1, 0.05, (RANDOM.nextDouble() - 0.5) * 0.1);
			case "snow" -> add(mc, ParticleTypes.SNOWFLAKE, x, y + 0.2, z, 0, -0.02, 0);
			// a note's "speed" is its colour, from 0 to 1 around the colour wheel
			case "notes" -> add(mc, ParticleTypes.NOTE, x, y + 0.4, z, (tick % 48) / 24.0, 0, 0);
			case "flames" -> add(mc, ParticleTypes.FLAME, x, y, z, 0, 0.01, 0);
			case "clouds" -> add(mc, ParticleTypes.CLOUD, x, y, z, 0, 0.01, 0);
			case "stars" -> add(mc, ParticleTypes.FIREWORK, x, y + 0.1, z, (RANDOM.nextDouble() - 0.5) * 0.04, 0.03, (RANDOM.nextDouble() - 0.5) * 0.04);
			case "bubbles" -> add(mc, ParticleTypes.BUBBLE_POP, x, y + 0.2, z, 0, 0.02, 0);
			case "emerald" -> add(mc, ParticleTypes.HAPPY_VILLAGER, x, y + 0.2, z, 0, 0, 0);
			case "soulfire" -> add(mc, ParticleTypes.SOUL_FIRE_FLAME, x, y, z, 0, 0.01, 0);
			case "crits" -> add(mc, ParticleTypes.CRIT, x, y + 0.2, z, (RANDOM.nextDouble() - 0.5) * 0.2, 0.1, (RANDOM.nextDouble() - 0.5) * 0.2);
			case "witch" -> add(mc, ParticleTypes.WITCH, x, y + 0.2, z, 0, 0, 0);
			case "ink" -> add(mc, ParticleTypes.SQUID_INK, x, y, z, 0, 0.01, 0);
			case "ash" -> add(mc, ParticleTypes.WHITE_ASH, x, y + 0.3, z, 0, 0, 0);
			default -> {}
		}
	}

	/** A few particles circling the body, slowly. */
	private static void aura(Minecraft mc, String kind, Player p) {
		if (tick % 3 != 0) return;
		double a = tick * 0.25 + RANDOM.nextDouble() * 0.6;
		double r = 0.7;
		double x = p.getX() + Math.cos(a) * r, z = p.getZ() + Math.sin(a) * r;
		double y = p.getY() + 0.2 + RANDOM.nextDouble() * 1.6;
		switch (kind) {
			// both fly from where they start towards the given point offset: towards the player
			case "enchant" -> add(mc, ParticleTypes.ENCHANT, p.getX(), p.getY() + 1.2, p.getZ(), x - p.getX(), y - p.getY() - 1.2, z - p.getZ());
			case "portal" -> add(mc, ParticleTypes.PORTAL, p.getX(), p.getY() + 0.8, p.getZ(), (x - p.getX()) * 1.5, y - p.getY() - 0.8, (z - p.getZ()) * 1.5);
			case "cherry" -> add(mc, ParticleTypes.CHERRY_LEAVES, x, p.getY() + 2.2, z, 0, 0, 0);
			case "souls" -> add(mc, ParticleTypes.SOUL, x, p.getY() + 0.1, z, 0, 0.02, 0);
			case "glow" -> add(mc, ParticleTypes.GLOW, x, y, z, 0, 0.02, 0);
			case "magic" -> add(mc, ParticleTypes.ENCHANTED_HIT, x, y, z, 0, 0.05, 0);
			case "amber" -> add(mc, ParticleTypes.WAX_ON, x, y, z, 0, 0.3, 0);
			case "sculk" -> add(mc, ParticleTypes.SCULK_SOUL, x, p.getY() + 0.1, z, 0, 0.03, 0);
			case "spores" -> add(mc, ParticleTypes.SPORE_BLOSSOM_AIR, x, y, z, 0, 0, 0);
			// like the conduit's: flies from where it starts towards the player
			case "nautilus" -> add(mc, ParticleTypes.NAUTILUS, p.getX(), p.getY() + 1.0, p.getZ(), x - p.getX(), y - p.getY() - 1.0, z - p.getZ());
			case "tears" -> add(mc, ParticleTypes.DRIPPING_OBSIDIAN_TEAR, x, p.getY() + 1.9, z, 0, 0, 0);
			case "fireflies" -> add(mc, ParticleTypes.FIREFLY, x, y, z, 0, 0, 0);
			case "royal" -> {
				add(mc, ParticleTypes.TOTEM_OF_UNDYING, x, y, z, 0, 0.04, 0);
				if (RANDOM.nextInt(3) == 0) add(mc, ParticleTypes.END_ROD, p.getX() - (x - p.getX()), y, p.getZ() - (z - p.getZ()), 0, 0.01, 0);
			}
			default -> {}
		}
	}

	private static void add(Minecraft mc, ParticleOptions type, double x, double y, double z, double vx, double vy, double vz) {
		mc.level.addParticle(type, x, y, z, vx, vy, vz);
	}

	static void reset() {
		lastPos.clear();
	}
}
