package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.resources.Identifier;

/**
 * Where an emote's picture goes (EmoteLayer, in the player model's space): in front of the face, a
 * little above it, turned to the camera; and how visible it is while the emote eases in and out.
 */
final class EmotePicture {
	private EmotePicture() {}

	/**
	 * How big it is (a block is 1) and where: in front of the player at the face's height (the model's
	 * space is upside down), beside the head as seen by the camera, so the face and the hands stay in sight.
	 */
	private static final float SIZE = 0.4f, FRONT = 0.3f, UP = -0.35f, ASIDE = 0.55f;

	static Identifier texture(String emote) {
		return Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/emote/" + emote + ".png");
	}

	/** Fully there after a fifth of a second, gone over the last half second. */
	static float alpha(Cosmetics.Playing p) {
		float t = (System.currentTimeMillis() - p.start()) / 1000f, total = Emotes.MS / 1000f;
		return Math.max(0f, Math.min(1f, Math.min(t / 0.2f, (total - t) / 0.5f)));
	}

	/**
	 * From the model's space (turned with the body, upside down) to the picture's: out in front of
	 * the face, then turned so its face looks at the camera.
	 */
	static void place(PoseStack pose, float bodyRot, double x, double z, boolean crouching) {
		pose.translate(0, UP + (crouching ? 0.2f : 0f), -FRONT);
		// written as the versions' replacements expect it ("camera.position()")
		var camera = Compat.camera(Minecraft.getInstance());
		var eye = camera.position();
		// the way to the camera, as a yaw in the world; in the model's space the body's own turn is taken off
		float toCamera = (float) Math.toDegrees(Math.atan2(eye.x - x, eye.z - z));
		float turn = toCamera + bodyRot;
		//#if MC >= 26.3
		pose.rotate(com.mojang.math.Axis.YP.rotationDegrees(turn));
		//#else
		//$ pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(turn));
		//#endif
		// beside the head, from where the camera looks
		pose.translate(ASIDE, 0, 0);
		pose.scale(SIZE, SIZE, SIZE);
	}
}
