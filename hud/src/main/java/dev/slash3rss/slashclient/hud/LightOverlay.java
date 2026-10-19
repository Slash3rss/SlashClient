package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.NaturalSpawner;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.ArrayList;
import java.util.List;

/**
 * Light level overlay: a cross on every block near the player where monsters can spawn, red where
 * they can at any time, yellow where only at night (enough sky light by day). The rules are the
 * game's own: a block a zombie may stand in (no fluid, nothing solid, nothing that stops spawning),
 * on a block it may spawn on (a solid top: no glass, slabs at the bottom, leaves, bedrock), with
 * the dimension's block light limit (0 in the Overworld). A key switches it; the blocks are looked
 * through a few times a second, in a radius, and drawn as one batch of flat squares.
 */
public final class LightOverlay {
	private LightOverlay() {}

	public static KeyMapping key;
	private static final Identifier TEXTURE = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/light_overlay.png");
	static final int RED = 0xFFFF3B3B, YELLOW = 0xFFFFD43B;
	/** Light from the sky by night: the game darkens it by 11. */
	private static final int NIGHT_DARKEN = 11;
	/** How far up and down from the feet, in blocks. */
	private static final int HEIGHT = 8;
	/** Full brightness for the lightmap: the crosses stay as bright in a dark cave. */
	private static final int FULL_BRIGHT = 0xF000F0;

	/** One spawnable block: where its floor is (the top of what lies there, e.g. snow) and whether only at night. */
	public record Spot(int x, int y, int z, float floor, boolean night) {}

	private static List<Spot> spots = List.of();
	private static int ticks;
	private static BlockPos scannedAt;

	static HudConfig cfg() {
		return SlashHud.config;
	}

	public static List<Spot> spots() {
		return spots;
	}

	public static void register() {
		//#if MC >= 26.1
		net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents.COLLECT_SUBMITS.register(ctx -> submit(ctx.poseStack(), ctx.submitNodeCollector()));
		//#elif MC >= 1.21.9
		//$ net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents.AFTER_ENTITIES.register(ctx -> draw(ctx.matrices(), ctx.consumers()));
		//#else
		//$ net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents.AFTER_ENTITIES.register(ctx -> draw(ctx.matrixStack(), ctx.consumers()));
		//#endif
	}

	static void tick(Minecraft mc) {
		while (key != null && key.consumeClick()) {
			if (Compat.screen(mc) != null) continue;
			cfg().lightOverlay = !cfg().lightOverlay;
			cfg().save();
			Compat.overlay(mc, Component.translatable(cfg().lightOverlay ? "slashclient-hud.lightOverlay.on" : "slashclient-hud.lightOverlay.off"));
			ticks = 0;
		}
		if (!cfg().lightOverlay || mc.player == null || mc.level == null) {
			spots = List.of();
			scannedAt = null;
			return;
		}
		// again twice a second, or at once when the player stepped onto another block
		BlockPos at = mc.player.blockPosition();
		if (--ticks > 0 && at.equals(scannedAt)) return;
		ticks = 10;
		scannedAt = at;
		spots = scan(mc.level, at, Math.max(4, Math.min(32, cfg().lightOverlayRadius)));
	}

	/** The spawnable blocks within `radius` (a circle) and HEIGHT up and down of `center`. */
	public static List<Spot> scan(Level level, BlockPos center, int radius) {
		List<Spot> out = new ArrayList<>();
		var type = level.dimensionType();
		int blockLimit = type.monsterSpawnBlockLightLimit();
		// the darkest the game may ask for (0-7 at random in the Overworld): darker than its top always spawns
		//#if MC >= 26.1
		int test = type.monsterSpawnLightTest().maxInclusive();
		//#else
		//$ int test = type.monsterSpawnLightTest().getMaxValue();
		//#endif
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos(), below = new BlockPos.MutableBlockPos();
		int r2 = radius * radius;
		for (int dx = -radius; dx <= radius; dx++) {
			for (int dz = -radius; dz <= radius; dz++) {
				if (dx * dx + dz * dz > r2) continue;
				int x = center.getX() + dx, z = center.getZ() + dz;
				if (!level.hasChunkAt(pos.set(x, center.getY(), z))) continue;
				BlockState under = level.getBlockState(below.set(x, center.getY() - HEIGHT - 1, z));
				for (int y = center.getY() - HEIGHT; y <= center.getY() + HEIGHT; y++) {
					BlockState state = level.getBlockState(pos.set(x, y, z));
					boolean ok = spawnable(level, pos, state, below, under);
					below.set(x, y, z);
					under = state;
					if (!ok) continue;
					int block = level.getBrightness(LightLayer.BLOCK, pos);
					if (block > blockLimit) continue;
					int sky = level.getBrightness(LightLayer.SKY, pos);
					boolean always = Math.max(block, sky) <= test;
					if (!always && Math.max(block, sky - NIGHT_DARKEN) > test) continue;
					VoxelShape shape = state.getCollisionShape(level, pos);
					float floor = shape.isEmpty() ? 0f : (float) shape.max(Direction.Axis.Y);
					out.add(new Spot(x, y, z, floor, !always));
				}
			}
		}
		return out;
	}

	/** Whether a monster could appear in `pos` standing on `under` (at `below`), light aside. */
	static boolean spawnable(Level level, BlockPos pos, BlockState state, BlockPos below, BlockState under) {
		if (!NaturalSpawner.isValidEmptySpawnBlock(level, pos, state, state.getFluidState(), ZOMBIE)) return false;
		return under.isValidSpawn(level, below, ZOMBIE);
	}

	/** The monster the rules are checked for: an ordinary one, two blocks tall, not fire-proof. */
	//#if MC >= 26.2
	private static final EntityType<?> ZOMBIE = net.minecraft.world.entity.EntityTypes.ZOMBIE;
	//#else
	//$ private static final EntityType<?> ZOMBIE = EntityType.ZOMBIE;
	//#endif

	//#if MC >= 26.1
	private static void submit(PoseStack pose, net.minecraft.client.renderer.SubmitNodeCollector out) {
		List<Spot> list = spots;
		if (list.isEmpty()) return;
		var camera = Compat.camera(Minecraft.getInstance());
		Vec3 cam = camera.position();
		if (pose == null) pose = new PoseStack();
		out.submitCustomGeometry(pose, RenderTypes.entityTranslucent(TEXTURE), (p, vc) -> {
			for (Spot s : list) quad(p, vc, s, cam);
		});
	}
	//#else
	//$ private static void draw(PoseStack pose, net.minecraft.client.renderer.MultiBufferSource buffers) {
	//$ 	List<Spot> list = spots;
	//$ 	if (list.isEmpty() || buffers == null) return;
	//$ 	var camera = Compat.camera(Minecraft.getInstance());
	//$ 	Vec3 cam = camera.position();
	//$ 	if (pose == null) pose = new PoseStack();
	//$ 	var type = RenderTypes.entityTranslucent(TEXTURE);
	//$ 	VertexConsumer vc = buffers.getBuffer(type);
	//$ 	for (Spot s : list) quad(pose.last(), vc, s, cam);
	//$ 	// drawn now: later the buffers may already have been drawn for this frame
	//$ 	if (buffers instanceof net.minecraft.client.renderer.MultiBufferSource.BufferSource source) source.endBatch(type);
	//$ }
	//#endif

	/** The cross on the block's floor, a hair above it, counter-clockwise seen from above. */
	private static void quad(PoseStack.Pose p, VertexConsumer vc, Spot s, Vec3 cam) {
		float x0 = (float) (s.x() - cam.x), z0 = (float) (s.z() - cam.z);
		float y = (float) (s.y() + s.floor() + 0.01 - cam.y);
		int c = s.night() ? YELLOW : RED;
		int r = c >> 16 & 0xFF, g = c >> 8 & 0xFF, b = c & 0xFF;
		vertex(p, vc, x0, y, z0, 0, 0, r, g, b);
		vertex(p, vc, x0, y, z0 + 1, 0, 1, r, g, b);
		vertex(p, vc, x0 + 1, y, z0 + 1, 1, 1, r, g, b);
		vertex(p, vc, x0 + 1, y, z0, 1, 0, r, g, b);
	}

	private static void vertex(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v, int r, int g, int b) {
		//#if MC >= 1.21
		vc.addVertex(p, x, y, z).setColor(r, g, b, 220).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(FULL_BRIGHT).setNormal(p, 0, 1, 0);
		//#else
		//$ vc.vertex(p.pose(), x, y, z).color(r, g, b, 220).uv(u, v).overlayCoords(OverlayTexture.NO_OVERLAY).uv2(FULL_BRIGHT).normal(p.normal(), 0, 1, 0).endVertex();
		//#endif
	}
}
