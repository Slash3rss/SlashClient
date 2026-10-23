package dev.slash3rss.slashclient.hud;

import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * A waypoint put by itself where the player died: one per world (or server, or server's mode) and dimension, so
 * the way back to the items shows with its distance. The next death there moves it; it can be
 * removed in the waypoints list (B) like any other.
 */
public final class DeathPoint {
	private DeathPoint() {}

	static final int COLOR = 0xFFF87171;
	private static boolean wasDead;

	static void tick(Minecraft mc) {
		if (mc.player == null || mc.level == null) {
			wasDead = false;
			return;
		}
		boolean dead = mc.player.isDeadOrDying();
		if (dead && !wasDead && SlashHud.config.deathWaypoint) place(mc);
		wasDead = dead;
	}

	/** The death point of this world and dimension, now at the player's feet. */
	static Waypoints.Point place(Minecraft mc) {
		String dimension = Waypoints.dimension(mc);
		// the one before, in this mode's list or (from before modes were told apart) the server's own
		for (Waypoints.Point old : new java.util.ArrayList<>(Waypoints.points(mc))) if (old.death && dimension.equals(old.dimension)) Waypoints.remove(old);
		List<Waypoints.Point> list = Waypoints.here(mc);
		int[] at = spot(mc);
		Waypoints.Point p = new Waypoints.Point(Component.translatable("slashclient-hud.deathPoint.name").getString(), at[0], at[1], at[2], dimension, COLOR);
		p.death = true;
		list.add(p);
		Waypoints.save();
		Compat.chat(mc).addClientSystemMessage(Component.translatable("slashclient-hud.deathPoint.placed", at[0], at[1], at[2]).withStyle(ChatFormatting.GRAY));
		return p;
	}

	/** Where the player is (died): x, y, z of the block at their feet. */
	static int[] spot(Minecraft mc) {
		var pos = mc.player.blockPosition();
		// fallen into the void: the point at the bottom of the world, where the fall started to count
		//#if MC >= 1.21.2
		int y = Math.max(pos.getY(), mc.level.getMinY());
		//#else
		//$ int y = Math.max(pos.getY(), mc.level.getMinBuildHeight());
		//#endif
		return new int[] { pos.getX(), y, pos.getZ() };
	}

	/** The death point of this world and dimension, or null. */
	public static Waypoints.Point current(Minecraft mc) {
		String dimension = Waypoints.dimension(mc);
		for (Waypoints.Point p : Waypoints.points(mc)) if (p.death && dimension.equals(p.dimension)) return p;
		return null;
	}
}
