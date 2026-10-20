package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
//#if MC >= 1.21.11
import net.minecraft.world.entity.projectile.arrow.Arrow;
//#else
//$ import net.minecraft.world.entity.projectile.Arrow;
//#endif

/**
 * The hit marker: a sturdy husk in front of us hit by hand shows it (in each look), an arrow we
 * shot shows it too, a husk with one heart killed shows it in the kill colour; switched off, a hit
 * shows nothing.
 */
public class GameHitMarker implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("execute at @a run summon husk ~ ~ ~2.5 {NoAI:1b,Silent:1b,PersistenceRequired:1b,Health:200f,attributes:[{id:\"minecraft:max_health\",base:200}]}");
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.lookSouth(); });
			context.waitTicks(10);

			// by hand, in each look
			for (String style : new String[] {"x", "bold", "plus"}) {
				context.runOnClient(mc -> { TestHooks.hitMarker(true, style); TestHooks.lookSouth(); });
				if (!context.computeOnClient(mc -> TestHooks.attackNearest())) throw new AssertionError("Nothing to hit");
				String hit = context.computeOnClient(mc -> TestHooks.hitMarkerState());
				if (!hit.equals("hit")) throw new AssertionError("No hit marker after a hit (" + style + "): " + hit);
				context.waitTicks(1);
				context.takeScreenshot("hit-marker-" + style);
				// gone after its second (and the husk can be hurt again)
				context.waitTicks(25);
				String gone = context.computeOnClient(mc -> TestHooks.hitMarkerState());
				if (!gone.isEmpty()) throw new AssertionError("The hit marker stayed: " + gone);
			}

			// an arrow we shot: the server's damage event names us as its cause
			context.runOnClient(mc -> { TestHooks.hitMarker(true, "x"); TestHooks.lookSouth(); });
			shoot(world);
			String arrow = waitFor(context, "hit", 30);
			if (!arrow.equals("hit")) throw new AssertionError("No hit marker for our arrow: " + arrow);
			context.takeScreenshot("hit-marker-arrow");
			context.waitTicks(25);

			// a kill: the marker again, in the kill colour
			world.getServer().runCommand("kill @e[type=husk]");
			world.getServer().runCommand("kill @e[type=arrow]");
			context.waitTicks(30);
			world.getServer().runCommand("execute at @a run summon husk ~ ~ ~2.5 {NoAI:1b,Silent:1b,PersistenceRequired:1b,Health:1f}");
			context.waitTicks(10);
			context.runOnClient(mc -> { TestHooks.hitMarker(true, "bold"); TestHooks.lookSouth(); });
			if (!context.computeOnClient(mc -> TestHooks.attackNearest())) throw new AssertionError("Nothing to kill");
			String kill = "";
			for (int i = 0; i < 60 && !kill.equals("kill"); i++) {
				context.waitTicks(1);
				kill = context.computeOnClient(mc -> TestHooks.hitMarkerState());
				// a husk that is still standing: the first hit did not land, hit again (as in GameKillEffects)
				if (i % 15 == 14 && !kill.equals("kill")) context.runOnClient(mc -> TestHooks.attackNearest());
			}
			if (!kill.equals("kill")) throw new AssertionError("No kill marker: " + kill + " (the husk's health " + context.computeOnClient(mc -> TestHooks.nearestHealth()) + ")");
			context.takeScreenshot("hit-marker-kill");
			context.waitTicks(25);

			// switched off: a hit shows nothing
			world.getServer().runCommand("execute at @a run summon husk ~ ~ ~2.5 {NoAI:1b,Silent:1b,PersistenceRequired:1b,Health:200f,attributes:[{id:\"minecraft:max_health\",base:200}]}");
			context.waitTicks(10);
			context.runOnClient(mc -> { TestHooks.hitMarker(false, "x"); TestHooks.lookSouth(); });
			context.runOnClient(mc -> TestHooks.attackNearest());
			context.waitTicks(2);
			String off = context.computeOnClient(mc -> TestHooks.hitMarkerState());
			if (!off.isEmpty()) throw new AssertionError("A hit marker while switched off: " + off);
			world.getServer().runCommand("kill @e[type=husk]");
		}
	}

	/** Our player shoots an arrow straight south (at the husk), on the server, as a bow would. */
	private static void shoot(TestSingleplayerContext world) {
		world.getServer().runOnServer(server -> {
			var p = server.getPlayerList().getPlayers().get(0);
			Arrow a = new Arrow(p.level(), p, new ItemStack(Items.ARROW), null);
			a.shoot(0, 0, 1, 3f, 0f);
			p.level().addFreshEntity(a);
		});
	}

	/** Waits up to `ticks` for the hit marker to show `want`: what it shows then. */
	private static String waitFor(ClientGameTestContext context, String want, int ticks) {
		String state = "";
		for (int i = 0; i < ticks; i++) {
			context.waitTicks(1);
			state = context.computeOnClient(mc -> TestHooks.hitMarkerState());
			if (state.equals(want)) return state;
		}
		return state;
	}
}
