// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import dev.slash3rss.slashclient.hud.map.DeathPoint;
import dev.slash3rss.slashclient.hud.map.Waypoints;

/**
 * For the in-game test of the world helpers (src/gametest GameWorldAids): the death point, the
 * Nether coordinates module, the light level overlay, no weather and the F5 camera's distance.
 */
public final class WorldAidsTestHooks {
	private WorldAidsTestHooks() {}

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	/** Flying (creative), so the player stays where teleported. */
	public static void fly() {
		var mc = Minecraft.getInstance();
		mc.player.getAbilities().flying = true;
		// the server told too, so its next abilities packet does not undo it
		mc.player.onUpdateAbilities();
	}

	/** "x y z dimension" of this world's death point here, or "-". */
	public static String deathPoint() {
		var mc = Minecraft.getInstance();
		var p = DeathPoint.current(mc);
		return p == null ? "-" : p.x + " " + p.y + " " + p.z + " " + Waypoints.dimensionId(p.dimension);
	}

	/** How many death points this world has (one per dimension at most). */
	public static int deathPoints() {
		int n = 0;
		for (var p : Waypoints.points(Minecraft.getInstance())) if (p.death) n++;
		return n;
	}

	/** Back to life from the death screen. */
	public static void respawn() {
		var mc = Minecraft.getInstance();
		mc.player.respawn();
		mc.setScreenAndShow(null);
	}

	/** The Nether coordinates module on (or off), and what it shows now. */
	public static String netherCoords(boolean on) {
		var mc = Minecraft.getInstance();
		cfg().placement("nethercoords").enabled = on;
		for (HudModule m : SlashHud.modules()) {
			if (m instanceof NetherCoords n) return n.visible(mc) ? n.content(mc).getString() : "hidden";
		}
		return "missing";
	}

	/** The overlay on (radius) or off, scanned at once: "all red yellow". */
	public static String lightOverlay(boolean on, int radius) {
		var mc = Minecraft.getInstance();
		cfg().lightOverlay = on;
		cfg().lightOverlayRadius = radius;
		LightOverlay.tick(mc);
		// at once, not on the next tick
		var spots = on ? LightOverlay.scan(mc.level, mc.player.blockPosition(), radius) : java.util.List.<LightOverlay.Spot>of();
		int red = 0, yellow = 0;
		for (var s : spots) if (s.night()) yellow++; else red++;
		return spots.size() + " " + red + " " + yellow;
	}

	/** What the overlay marks at a block: "red", "yellow", farmland "grows" or "dark", or "-". */
	public static String spotAt(int x, int y, int z) {
		var mc = Minecraft.getInstance();
		for (var c : LightOverlay.scanCrops(mc.level, new BlockPos(x, y, z), 1)) {
			if (c.x() == x && c.y() == y && c.z() == z) return c.grows() ? "grows" : "dark";
		}
		for (var s : LightOverlay.scan(mc.level, new BlockPos(x, y, z), 1)) {
			if (s.x() == x && s.y() == y && s.z() == z) return s.night() ? "yellow" : "red";
		}
		return "-";
	}

	public static void weatherOff(boolean on) {
		cfg().weatherOff = on;
	}

	/** The rain as this client's world says it is now (0 to 1). */
	public static float rainLevel() {
		return Minecraft.getInstance().level.getRainLevel(1f);
	}

	/** The F5 camera's distance on (needing its key or not), at a distance (NaN: the set one). */
	public static void cameraDistance(boolean on, boolean needsKey, float distance) {
		cfg().cameraDistance = on;
		cfg().cameraDistanceKey = needsKey;
		CameraDistance.set(distance);
	}

	public static float cameraTarget() {
		return CameraDistance.target();
	}

	/** How far the camera is from the player's eyes now. */
	public static double cameraFromEyes() {
		var mc = Minecraft.getInstance();
		var camera = Compat.camera(mc);
		return camera.position().distanceTo(mc.player.getEyePosition(1f));
	}

	public static int hotbarSlot() {
		return Minecraft.getInstance().player.getInventory().getSelectedSlot();
	}

	/** Everything this test switched, back as it was by default. */
	public static void reset() {
		HudConfig d = new HudConfig();
		cfg().deathWaypoint = d.deathWaypoint;
		cfg().lightOverlay = d.lightOverlay;
		cfg().lightOverlayRadius = d.lightOverlayRadius;
		cfg().weatherOff = d.weatherOff;
		cfg().cameraDistance = d.cameraDistance;
		cfg().cameraDistanceKey = d.cameraDistanceKey;
		cfg().cameraDistanceReset = d.cameraDistanceReset;
		cfg().placement("nethercoords").enabled = false;
		CameraDistance.set(Float.NaN);
		LightOverlay.tick(Minecraft.getInstance());
		var mc = Minecraft.getInstance();
		Waypoints.here(mc).removeIf(p -> p.death);
		Waypoints.save();
	}
}
//#endif
