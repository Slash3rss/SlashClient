package dev.slash3rss.slashclient.hud;

import net.minecraft.client.CameraType;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.world.entity.Entity;

/**
 * The emotes as moves of the player's body (the emote wheel's eight, by the same names the server
 * passes on, so older launchers still see the picture): waving, a heart, laughing, clapping, a thumb
 * up, stamping angrily, scratching the head and dancing. Posed over the game's own pose for the frame
 * (PropArmsMixin), easing in and out; a player walking off ends their own (others' are simply not
 * posed while they move). The player's own is watched from the front: the camera turns while it plays.
 */
public final class Emotes {
	private Emotes() {}

	/** How long one plays (the picture in front lasts as long). */
	static final long MS = 4000;
	private static final float PI = (float) Math.PI;

	/**
	 * The parts posed for `e`'s emote, now. `sleeves` are the parts that follow others in the game's
	 * older models (hat, jacket, sleeves, trousers), copied after: {hat, jacket, rightSleeve, leftSleeve, rightPants, leftPants}.
	 */
	public static void pose(Entity e, ModelPart head, ModelPart body, ModelPart rightArm, ModelPart leftArm, ModelPart rightLeg, ModelPart leftLeg, ModelPart... sleeves) {
		if (e == null) return;
		Cosmetics.Playing p = Cosmetics.playing(e.getUUID());
		if (p == null || moving(e) || e.isPassenger() || e.isSwimming()) return;
		float t = (System.currentTimeMillis() - p.start()) / 1000f, total = MS / 1000f;
		// in over a fifth of a second, out over the last third
		float w = Math.min(1f, Math.min(t / 0.2f, Math.max(0f, (total - t) / 0.35f)));
		if (w <= 0) return;
		float s = (float) Math.sin(t * 2 * PI);
		switch (p.emote()) {
			case "wave" -> {
				// the right arm up and out, the hand going side to side
				set(rightArm, -0.2f, 0, 2.5f + 0.35f * (float) Math.sin(t * 12), w);
				set(head, 0.1f, 0.15f, 0.08f, w);
			}
			case "heart" -> {
				// both hands to the chest, a slow sway
				set(rightArm, -1.25f, -0.65f, 0, w);
				set(leftArm, -1.25f, 0.65f, 0, w);
				set(body, 0, 0, 0.06f * s, w);
				set(head, -0.15f, 0, 0.08f * s, w);
			}
			case "laugh" -> {
				// head thrown back, hands on the belly, shaking
				float shake = 0.09f * (float) Math.sin(t * 28);
				set(head, -0.45f + shake, 0, shake * 0.5f, w);
				set(body, 0, shake * 0.4f, 0, w);
				set(rightArm, -0.55f + shake, -0.55f, 0, w);
				set(leftArm, -0.55f - shake, 0.55f, 0, w);
			}
			case "gg" -> {
				// clapping in front
				float apart = 0.5f + 0.5f * (float) Math.sin(t * 14);
				set(rightArm, -1.35f, -(0.12f + 0.38f * apart), 0, w);
				set(leftArm, -1.35f, 0.12f + 0.38f * apart, 0, w);
				set(head, 0.05f, 0, 0, w);
			}
			case "like" -> {
				// a thumb up: the right arm forward and up, a small nod
				set(rightArm, -1.9f, -0.2f, 0.15f, w);
				set(head, 0.1f + 0.08f * (float) Math.max(0, Math.sin(t * 6)), 0, 0, w);
			}
			case "angry" -> {
				// fists shaken low, stamping, leaning in
				float shake = (float) Math.sin(t * 18);
				set(rightArm, -0.35f + 0.35f * shake, 0, 0.25f, w);
				set(leftArm, -0.35f - 0.35f * shake, 0, -0.25f, w);
				set(rightLeg, -0.45f * Math.max(0f, (float) Math.sin(t * 9)), 0, 0, w);
				set(leftLeg, -0.45f * Math.max(0f, (float) -Math.sin(t * 9)), 0, 0, w);
				set(head, 0.25f, 0, 0, w);
			}
			case "question" -> {
				// a hand scratching the head, the head tilted
				set(rightArm, -2.75f + 0.12f * (float) Math.sin(t * 16), -0.35f, 0.3f, w);
				set(head, 0.1f, 0.15f, 0.32f, w);
			}
			case "fire" -> {
				// dancing: the arms up in turn, the legs and body to the beat
				float beat = (float) Math.sin(t * 7);
				set(rightArm, -0.2f, 0, 2.3f + 0.6f * Math.max(0f, beat), w);
				set(leftArm, -0.2f, 0, -(2.3f + 0.6f * Math.max(0f, -beat)), w);
				set(rightLeg, 0.35f * beat, 0, 0.08f, w);
				set(leftLeg, -0.35f * beat, 0, -0.08f, w);
				set(body, 0, 0.25f * beat, 0, w);
				set(head, 0, 0.3f * beat, 0.1f * beat, w);
			}
			default -> {}
		}
		// before 1.21.2 the hat, jacket, sleeves and trousers are parts of their own
		if (sleeves.length == 6) {
			ModelPart[] of = { head, body, rightArm, leftArm, rightLeg, leftLeg };
			for (int i = 0; i < 6; i++) turnLike(sleeves[i], of[i]);
		}
	}

	private static void turnLike(ModelPart part, ModelPart of) {
		part.xRot = of.xRot;
		part.yRot = of.yRot;
		part.zRot = of.zRot;
	}

	/** A part turned towards (x, y, z) by `w` of the way from the game's own pose. */
	private static void set(ModelPart part, float x, float y, float z, float w) {
		part.xRot += (x - part.xRot) * w;
		part.yRot += (y - part.yRot) * w;
		part.zRot += (z - part.zRot) * w;
	}

	/** Walking (or pushed): the emote is not posed over the walk. */
	static boolean moving(Entity e) {
		double dx = e.getX() - e.xo, dz = e.getZ() - e.zo;
		return dx * dx + dz * dz > 0.0016;
	}

	// ---------- the player's own ----------

	/** The camera before the emote turned it (to put back), or null. */
	private static CameraType cameraBefore;

	/** The player's own emote started: watched from the front while it plays (when set so). */
	static void started(Minecraft mc) {
		if (SlashHud.config == null || !SlashHud.config.emoteCamera) return;
		if (cameraBefore == null) cameraBefore = mc.options.getCameraType();
		mc.options.setCameraType(CameraType.THIRD_PERSON_FRONT);
	}

	static void tick(Minecraft mc) {
		if (mc.player == null) return;
		boolean playing = Cosmetics.playing(mc.player.getUUID()) != null;
		// walking off (or jumping) ends it
		var o = mc.options;
		if (playing && (o.keyUp.isDown() || o.keyDown.isDown() || o.keyLeft.isDown() || o.keyRight.isDown() || o.keyJump.isDown())) {
			Cosmetics.stop(mc.player.getUUID());
			playing = false;
		}
		// over: the camera as it was (unless the player turned it since)
		if (!playing && cameraBefore != null) {
			if (mc.options.getCameraType() == CameraType.THIRD_PERSON_FRONT) mc.options.setCameraType(cameraBefore);
			cameraBefore = null;
		}
	}
}
