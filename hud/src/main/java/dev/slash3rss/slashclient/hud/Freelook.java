package dev.slash3rss.slashclient.hud;

import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;

/**
 * Freelook: while the key is held the camera turns around the player, who keeps facing the
 * same way. Off by default, as some servers forbid it.
 */
public final class Freelook {
	private Freelook() {}

	public static KeyMapping key;
	private static boolean active;
	private static float yaw, pitch;
	private static CameraType before;

	public static boolean active() {
		return active;
	}

	static void tick(Minecraft mc) {
		boolean want = SlashHud.config.freelook && key != null && key.isDown() && mc.player != null && Compat.screen(mc) == null;
		if (want && !active) {
			active = true;
			yaw = mc.player.getYRot();
			pitch = mc.player.getXRot();
			before = mc.options.getCameraType();
			mc.options.setCameraType(CameraType.THIRD_PERSON_BACK);
		} else if (!want && active) {
			active = false;
			mc.options.setCameraType(before == null ? CameraType.FIRST_PERSON : before);
		}
	}

	/** The mouse moved: only the camera turns. True when the player must not. */
	public static boolean turn(Entity entity, double dYaw, double dPitch) {
		if (!active || entity != Minecraft.getInstance().player) return false;
		// the same 0.15 the game uses for its own turning
		yaw += (float) dYaw * 0.15f;
		pitch = Math.max(-90f, Math.min(90f, pitch + (float) dPitch * 0.15f));
		return true;
	}

	/** For the game tests' side views: the camera turned this much round the player (degrees). */
	static float testTurn;

	public static float yaw(float original) {
		return active ? yaw : original + testTurn;
	}

	public static float pitch(float original) {
		return active ? pitch : original;
	}
}
