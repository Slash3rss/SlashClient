package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.Map;
import java.util.UUID;

/**
 * A player changes what they wear (in the launcher, on the website or in their game's menu): the
 * server's 'cosmetics' event, passed on by the launcher, shows the new set at once, without waiting
 * for the next lookup. On our own player (seen from behind) for the pictures, and on another uuid.
 */
public class GameLiveCosmetics implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			UUID self = context.computeOnClient(mc -> mc.player.getUUID());
			context.runOnClient(mc -> TestHooks.cosmeticsSelf("galaxy", false));
			context.waitTicks(10);
			context.takeScreenshot("live-cosmetics-before");

			// the whole new set at once: the cape gives way to wings, a pet, an aura, a trail, a hat and a kill effect
			String hat = context.computeOnClient(mc -> TestHooks.firstClothing("hat"));
			Map<String, String> set = Map.of("cape", "ember", "wings", "angel", "pet", "allay", "aura", "souls",
				"trail", "hearts", "hat", hat, "kill", "lightning");
			context.runOnClient(mc -> TestHooks.liveCosmetics(self, set));
			String worn = context.computeOnClient(mc -> TestHooks.wornAll(self));
			if (!worn.equals(new java.util.TreeMap<>(set).toString())) throw new AssertionError("The live set did not apply: " + worn);
			context.waitTicks(30);
			if (!context.computeOnClient(mc -> TestHooks.capeTexture()).equals("none")) throw new AssertionError("The cape shows under the new wings");
			context.takeScreenshot("live-cosmetics-after");

			// a new set replaces the old one whole: only the new cape stays
			context.runOnClient(mc -> TestHooks.liveCosmetics(self, Map.of("cape", "ocean")));
			if (!context.computeOnClient(mc -> TestHooks.wornAll(self)).equals("{cape=ocean}")) throw new AssertionError("Old items stayed after a live change");
			context.waitTicks(5);
			String cape = context.computeOnClient(mc -> TestHooks.capeTexture());
			if (!cape.equals("slashclient-hud:textures/cape/ocean.png")) throw new AssertionError("The new cape does not show: " + cape);
			context.takeScreenshot("live-cosmetics-cape");

			// another player: their cached set changes too; items this mod does not know are left out
			UUID other = UUID.fromString("abcdef01-2222-3333-4444-555555555555");
			context.runOnClient(mc -> TestHooks.liveCosmetics(other, Map.of("cape", "gold", "pet", "fox", "wings", "not_yet_made")));
			String theirs = context.computeOnClient(mc -> TestHooks.wornAll(other));
			if (!theirs.equals("{cape=gold, pet=fox}")) throw new AssertionError("Another player's live set: " + theirs);
			context.runOnClient(mc -> TestHooks.liveCosmetics(other, Map.of()));
			if (!context.computeOnClient(mc -> TestHooks.wornAll(other)).equals("{}")) throw new AssertionError("Another player's items stayed");
			// an event without the set: the next lookup asks the server about that player again
			context.runOnClient(mc -> TestHooks.markLookedUp(other));
			if (context.computeOnClient(mc -> TestHooks.lookupDue(other))) throw new AssertionError("Just looked up, yet due again");
			context.runOnClient(mc -> TestHooks.liveCosmetics(other, null));
			if (!context.computeOnClient(mc -> TestHooks.lookupDue(other))) throw new AssertionError("A change without its set must ask the server again");

			context.runOnClient(mc -> TestHooks.liveCosmetics(self, Map.of()));
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.runOnClient(mc -> TestHooks.firstPerson());
		}
	}
}
