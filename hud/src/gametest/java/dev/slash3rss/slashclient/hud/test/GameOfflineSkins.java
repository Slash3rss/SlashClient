package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/**
 * A player with an offline account sets a skin in the launcher: SlashClient's server names it in the
 * lookup's answer (`skins`), and the game draws that player in it (our own player here, seen from behind
 * and in front), with a cape from the same answer. The setting "Skiny graczy offline" turns it off.
 */
public class GameOfflineSkins implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			UUID self = context.computeOnClient(mc -> mc.player.getUUID());
			String name = context.computeOnClient(mc -> mc.getUser().getName());
			UUID offline = UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes(StandardCharsets.UTF_8));
			System.out.println("[offline-skins] player " + name + " " + self + " (offline uuid " + offline + ")");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, false));
			context.waitTicks(10);
			String before = context.computeOnClient(mc -> TestHooks.ownSkin());
			context.takeScreenshot("offline-skin-before");

			// the answer names a skin (slim arms) and a cape for our player
			String hash = context.computeOnClient(mc -> {
				try {
					return TestHooks.offlineSkinAnswer(self, "figure/tvhead", true, "galaxy");
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			String texture = "slashclient-hud:offline_skin/" + hash;
			waitFor(context, () -> context.computeOnClient(mc -> TestHooks.ownSkin()).equals(texture + "|slim"), "our skin from the answer");
			if (!context.computeOnClient(mc -> TestHooks.wornAll(self)).equals("{cape=galaxy}")) throw new AssertionError("The cape from the same answer");
			context.waitTicks(10);
			context.takeScreenshot("offline-skin-back");
			context.runOnClient(mc -> TestHooks.cosmeticsSelf(null, true));
			context.waitTicks(10);
			context.takeScreenshot("offline-skin-front");

			// the setting off: the game's own skin again, the cape stays
			context.runOnClient(mc -> TestHooks.offlineSkins(false));
			if (!context.computeOnClient(mc -> TestHooks.ownSkin()).equals(before)) throw new AssertionError("The setting off keeps the offline skin");
			context.waitTicks(5);
			context.takeScreenshot("offline-skin-off");
			context.runOnClient(mc -> TestHooks.offlineSkins(true));

			// another player with an offline account (a version 3 uuid): the skin and a cape for them too
			UUID other = UUID.nameUUIDFromBytes("OfflinePlayer:Kumpel".getBytes(StandardCharsets.UTF_8));
			if (other.version() != 3) throw new AssertionError("Not an offline uuid: " + other);
			context.runOnClient(mc -> {
				try {
					TestHooks.offlineSkinAnswer(other, "figure/tvhead", false, "ember");
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			waitFor(context, () -> context.computeOnClient(mc -> TestHooks.offlineSkinOf(other)).equals(texture), "another offline player's skin");
			if (!context.computeOnClient(mc -> TestHooks.wornAll(other)).equals("{cape=ember}")) throw new AssertionError("Another offline player's cape");

			// a later answer without a skin: the game's own skin again
			context.runOnClient(mc -> {
				try {
					TestHooks.offlineSkinAnswer(self, null, false, null);
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			if (!context.computeOnClient(mc -> TestHooks.ownSkin()).equals(before)) throw new AssertionError("An answer without a skin keeps it");
			context.runOnClient(mc -> TestHooks.firstPerson());
		}
	}

	private static void waitFor(ClientGameTestContext context, java.util.function.BooleanSupplier done, String what) {
		for (int i = 0; i < 100; i++) {
			if (done.getAsBoolean()) return;
			context.waitTick();
		}
		throw new AssertionError("Not in 5 s: " + what);
	}
}
