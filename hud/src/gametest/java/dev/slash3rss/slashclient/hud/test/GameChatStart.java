package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * A tab pulled out before the game was restarted, with its lines kept to its window: on joining a
 * world "All" already leaves them out (not only after a tab is clicked).
 */
public class GameChatStart implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		context.runOnClient(mc -> TestHooks.pulledOutAtStart("Start News", "[News]"));
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("tellraw @a \"[News] only in the window\"");
			world.getServer().runCommand("tellraw @a \"Hello in All\"");
			context.waitTicks(5);
			String all = context.computeOnClient(mc -> TestHooks.visibleChat());
			if (all.contains("only in the window") || !all.contains("Hello in All")) throw new AssertionError("After a restart \"All\" shows: " + all);
		} finally {
			context.runOnClient(mc -> TestHooks.pulledOutAtStart(null, null));
		}
	}
}
