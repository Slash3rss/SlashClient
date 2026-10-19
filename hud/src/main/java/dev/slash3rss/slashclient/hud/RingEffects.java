package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.resources.Identifier;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Rings, a SlashClient cosmetic: a flat picture of ours on the ground under a player's feet, slowly
 * turning and gently pulsing, drawn as one see-through square (RingLayer) rather than particles.
 * It lies on the block the player stands on; jumping or falling it stays on the ground below and
 * fades with the height, and it is gone in the air (higher than {@link #FADE} blocks), swimming,
 * gliding or sleeping. Crouching dims it. What others wear comes from the SlashClient server.
 *
 * The pictures (textures/ring/<id>.png, or <id>_<n>.png for an animated one's frames) are two squares
 * side by side, the ring on the left (scripts/make-rings.mjs).
 */
public final class RingEffects {
	private RingEffects() {}

	/** In the order of the menus (and of the server's catalog). */
	public static final List<String> IDS = List.of("ring_runes", "ring_flame", "ring_frost", "ring_rainbow", "ring_mushroom",
		"ring_galaxy", "ring_halo", "ring_toxic");
	/** Rings drawn as a loop of frames, and how many. */
	static final Map<String, Integer> FRAMES = Map.of("ring_runes", 8, "ring_flame", 8, "ring_rainbow", 8, "ring_galaxy", 8, "ring_toxic", 8);
	private static final long FRAME_MS = 140;
	/** The ring's width on the ground, in blocks. */
	public static final float SIZE = 1.5f;
	/** How high above the ground it still shows (fading on the way). */
	static final double FADE = 1.6;
	/** How bright it is while crouching. */
	private static final float CROUCHING = 0.4f;

	/** The ring's picture now (an animated one's current frame). */
	public static Identifier texture(String id) {
		Integer frames = FRAMES.get(id);
		return Cosmetics.textureId("ring", frames == null ? id : id + "_" + (System.currentTimeMillis() / FRAME_MS) % frames);
	}

	/** How far it has turned now, in degrees: once round in 14 seconds. */
	public static float spin() {
		return (System.currentTimeMillis() % 14_000) / 14_000f * 360f;
	}

	/** Its size now, breathing in and out a little (1 ± 4%). */
	public static float pulse() {
		return 1f + 0.04f * (float) Math.sin((System.currentTimeMillis() % 3_600_000) / 1000.0 * 2.2);
	}

	/** Whether a player's ring shows: rings on, and others' too unless they are switched off. */
	static boolean shows(UUID id) {
		if (SlashHud.config == null || !SlashHud.config.ringEffects || !Badges.enabled()) return false;
		Minecraft mc = Minecraft.getInstance();
		return SlashHud.config.ringEffectsOthers || mc.player != null && mc.player.getUUID().equals(id);
	}

	/**
	 * How far below `y` the ground is under (x, z), or -1 when there is none within {@link #FADE}
	 * blocks. Standing (`onGround`) it is right under the feet, also on a block's edge.
	 */
	static double groundBelow(Level level, Entity e, double x, double y, double z) {
		if (e.onGround()) return 0;
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		int bx = Mth.floor(x), bz = Mth.floor(z);
		for (int by = Mth.floor(y + 0.01); by >= Mth.floor(y - FADE); by--) {
			pos.set(bx, by, bz);
			VoxelShape shape = level.getBlockState(pos).getCollisionShape(level, pos);
			if (shape.isEmpty()) continue;
			double top = by + shape.max(Direction.Axis.Y);
			if (top <= y + 0.01) return y - top <= FADE ? Math.max(0, y - top) : -1;
		}
		return -1;
	}

	/** How opaque the ring is at `above` blocks over the ground (0: not drawn). */
	static float alpha(double above, boolean crouching) {
		if (above < 0) return 0;
		float a = (float) Mth.clamp(1 - above / FADE, 0, 1);
		return crouching ? a * CROUCHING : a;
	}
}
