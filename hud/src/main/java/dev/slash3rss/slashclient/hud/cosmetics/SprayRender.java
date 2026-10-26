package dev.slash3rss.slashclient.hud.cosmetics;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.Direction;
import net.minecraft.world.phys.Vec3;

import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Draws the {@link Sprays} on their block faces: one picture each, a hair in front of the face (so it
 * does not flicker with the block), lit as the air in front of it and fading at the end. The world's
 * drawing changed a lot between versions: 26.1 on collects it as submits, 1.21.9 to 1.21.11 and
 * earlier versions draw into the buffers after the entities (each through Fabric's own event).
 */
public final class SprayRender {
	private SprayRender() {}

	/** How far in front of the face: enough against flicker, too little to see. */
	private static final float LIFT = 0.004f;

	public static void register() {
		//#if MC >= 26.1
		net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents.COLLECT_SUBMITS.register(ctx -> submit(ctx.poseStack(), ctx.submitNodeCollector()));
		//#elif MC >= 1.21.9
		//$ net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents.AFTER_ENTITIES.register(ctx -> draw(ctx.matrices(), ctx.consumers()));
		//#else
		//$ net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents.AFTER_ENTITIES.register(ctx -> draw(ctx.matrixStack(), ctx.consumers()));
		//#endif
	}

	/** The sprays to draw now: in this dimension, near enough, on when sprays are shown. */
	private static List<Sprays.Decal> visible(Minecraft mc, Vec3 cam) {
		List<Sprays.Decal> out = new ArrayList<>();
		if (mc.level == null || SlashHud.config == null || !SlashHud.config.sprays) return out;
		String here = Sprays.dimension(mc);
		for (Sprays.Decal d : Sprays.decals) {
			if (!d.dimension().equals(here) || d.pos().distToCenterSqr(cam.x, cam.y, cam.z) > Sprays.DRAW_RANGE_SQ) continue;
			out.add(d);
		}
		return out;
	}

	//#if MC >= 26.1
	private static void submit(PoseStack pose, net.minecraft.client.renderer.SubmitNodeCollector out) {
		Minecraft mc = Minecraft.getInstance();
		var camera = Compat.camera(mc);
		Vec3 cam = camera.position();
		long now = System.currentTimeMillis();
		if (pose == null) pose = new PoseStack();
		for (Sprays.Decal d : visible(mc, cam)) {
			int light = Sprays.light(mc, d);
			float alpha = d.alpha(now);
			out.submitCustomGeometry(pose, RenderTypes.entityTranslucent(Sprays.texture(d.id())), (p, vc) -> quad(p, vc, d, cam, light, alpha));
		}
	}
	//#else
	//$ private static void draw(PoseStack pose, net.minecraft.client.renderer.MultiBufferSource buffers) {
	//$ 	Minecraft mc = Minecraft.getInstance();
	//$ 	if (buffers == null) return;
	//$ 	var camera = Compat.camera(mc);
	//$ 	Vec3 cam = camera.position();
	//$ 	long now = System.currentTimeMillis();
	//$ 	if (pose == null) pose = new PoseStack();
	//$ 	for (Sprays.Decal d : visible(mc, cam)) {
	//$ 		var type = RenderTypes.entityTranslucent(Sprays.texture(d.id()));
	//$ 		quad(pose.last(), buffers.getBuffer(type), d, cam, Sprays.light(mc, d), d.alpha(now));
	//$ 		// drawn now: later the buffers may already have been drawn for this frame
	//$ 		if (buffers instanceof net.minecraft.client.renderer.MultiBufferSource.BufferSource source) source.endBatch(type);
	//$ 	}
	//$ }
	//#endif

	/** The picture's square on the face, its corners relative to the camera. */
	private static void quad(PoseStack.Pose p, VertexConsumer vc, Sprays.Decal d, Vec3 cam, int light, float alpha) {
		Direction face = d.face();
		float nx = face.getStepX(), ny = face.getStepY(), nz = face.getStepZ();
		// which way is up in the picture: the world's up on a wall, `rot` on a floor or a ceiling
		float ux, uy, uz;
		if (face.getAxis() == Direction.Axis.Y) {
			ux = d.rot() == 1 ? 1 : d.rot() == 3 ? -1 : 0;
			uy = 0;
			uz = d.rot() == 0 ? -1 : d.rot() == 2 ? 1 : 0;
		} else {
			ux = 0;
			uy = 1;
			uz = 0;
		}
		// right, as seen from in front of the face: (looking direction) × up, looking along -normal
		float rx = -(ny * uz - nz * uy), ry = -(nz * ux - nx * uz), rz = -(nx * uy - ny * ux);
		float cx = (float) (d.pos().getX() + 0.5 + nx * (0.5 + LIFT) - cam.x);
		float cy = (float) (d.pos().getY() + 0.5 + ny * (0.5 + LIFT) - cam.y);
		float cz = (float) (d.pos().getZ() + 0.5 + nz * (0.5 + LIFT) - cam.z);
		int a = Math.round(alpha * 255);
		// top left, bottom left, bottom right, top right: counter-clockwise from the front
		vertex(p, vc, cx + (-rx + ux) * 0.5f, cy + (-ry + uy) * 0.5f, cz + (-rz + uz) * 0.5f, 0, 0, a, light, nx, ny, nz);
		vertex(p, vc, cx + (-rx - ux) * 0.5f, cy + (-ry - uy) * 0.5f, cz + (-rz - uz) * 0.5f, 0, 1, a, light, nx, ny, nz);
		vertex(p, vc, cx + (rx - ux) * 0.5f, cy + (ry - uy) * 0.5f, cz + (rz - uz) * 0.5f, 1, 1, a, light, nx, ny, nz);
		vertex(p, vc, cx + (rx + ux) * 0.5f, cy + (ry + uy) * 0.5f, cz + (rz + uz) * 0.5f, 1, 0, a, light, nx, ny, nz);
	}

	private static void vertex(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, float u, float v, int alpha, int light, float nx, float ny, float nz) {
		//#if MC >= 1.21
		vc.addVertex(p, x, y, z).setColor(255, 255, 255, alpha).setUv(u, v).setOverlay(OverlayTexture.NO_OVERLAY).setLight(light).setNormal(p, nx, ny, nz);
		//#else
		//$ vc.vertex(p.pose(), x, y, z).color(255, 255, 255, alpha).uv(u, v).overlayCoords(OverlayTexture.NO_OVERLAY).uv2(light).normal(p.normal(), nx, ny, nz).endVertex();
		//#endif
	}
}
