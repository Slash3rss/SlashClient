package dev.slash3rss.slashclient.hud.cosmetics;

import net.minecraft.client.Minecraft;
import dev.slash3rss.slashclient.hud.Freelook;
import dev.slash3rss.slashclient.hud.SlashHud;

/** For the game test of props (GameProps): what is shown, how far the wheel has rolled, and views of our own player from any side. */
public final class PropTestHooks {
	private PropTestHooks() {}

	/** The props this mod can draw, comma separated. */
	public static String props() {
		return String.join(",", Props.IDS);
	}

	/** The prop our own player shows now ("" for none). */
	public static String shown() {
		String s = Props.shown(Minecraft.getInstance().player);
		return s == null ? "" : s;
	}

	/** How far our own player has walked, as the wheel counts it (the walk animation's position). */
	public static float walked() {
		return Minecraft.getInstance().player.walkAnimation.position(1);
	}

	/** Holds (or lets go of) the forward key, as the player would. */
	public static void walk(boolean on) {
		Minecraft.getInstance().options.keyUp.setDown(on);
	}

	/**
	 * Looks at our own player from `angle` degrees round from their front (0: the face, 90: their
	 * side, 180: the back), a little from above, with freelook (held as if its key were; the player
	 * keeps facing the same way). True once the camera is there: freelook starts on the next tick,
	 * so call it again then. NaN lets go of freelook.
	 */
	public static boolean viewFrom(float angle) {
		Minecraft mc = Minecraft.getInstance();
		if (Float.isNaN(angle)) {
			Freelook.key.setDown(false);
			return true;
		}
		SlashHud.config.freelook = true;
		Freelook.key.setDown(true);
		if (!Freelook.active()) return false;
		// the camera looks back at the player: its own direction is the player's turned round
		float yaw = mc.player.getYRot() + 180 + angle, pitch = 28;
		Freelook.turn(mc.player, (yaw - Freelook.yaw(0)) / 0.15, (pitch - Freelook.pitch(0)) / 0.15);
		return true;
	}
}
