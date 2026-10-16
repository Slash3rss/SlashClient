package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The extras in a world: a waypoint in view, your own night, repeated chat lines stacked,
 * a right click copying a line, the chat search, the screenshot preview and freelook.
 */
public class GameExtras implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			// a waypoint 12 blocks ahead (south), then night only for us
			context.runOnClient(mc -> TestHooks.worldExtras());
			for (int i = 0; i < 3; i++) world.getServer().runCommand("say Ta sama wiadomość");
			world.getServer().runCommand("say Inna wiadomość");
			context.waitTicks(30);
			String stacked = context.computeOnClient(mc -> TestHooks.chatLines());
			if (!stacked.contains("Ta sama wiadomość ×3")) throw new AssertionError("Repeated lines did not stack: " + stacked);
			context.takeScreenshot("extras-world");

			// open chat: a right click on the second line from the bottom copies it
			context.setScreen(() -> new net.minecraft.client.gui.screens.ChatScreen("", false));
			context.waitTicks(5);
			String copied = context.computeOnClient(mc -> TestHooks.copyLine(1));
			if (copied == null || !copied.contains("Ta sama wiadomość")) throw new AssertionError("Copied the wrong line: " + copied);
			context.runOnClient(mc -> TestHooks.chatSearch("inna"));
			context.waitTicks(5);
			context.takeScreenshot("extras-chat-search");
			context.setScreen(() -> null);

			// F2: the preview in the corner
			context.runOnClient(mc -> TestHooks.screenshot());
			context.waitTicks(20);
			context.takeScreenshot("extras-screenshot-preview");

			// freelook: the camera turns, the player does not
			context.getInput().holdKey(o -> dev.slash3rss.slashclient.hud.Freelook.key);
			context.waitTicks(3);
			boolean ok = context.computeOnClient(mc -> TestHooks.freelookTurn());
			context.waitTicks(3);
			context.takeScreenshot("extras-freelook");
			context.getInput().releaseKey(o -> dev.slash3rss.slashclient.hud.Freelook.key);
			if (!ok) throw new AssertionError("Freelook turned the player");

			// the SlashClient pause menu
			context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashPauseScreen::new);
			context.waitTicks(10);
			context.takeScreenshot("extras-pause-menu");
			context.setScreen(() -> null);
		}
		// switching accounts in the main menu, without a restart (an offline account here)
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(10);
		String name = context.computeOnClient(mc -> TestHooks.switchAccount("Drugi"));
		if (!"Drugi".equals(name)) throw new AssertionError("Account switch failed: " + name);
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(10);
		context.takeScreenshot("extras-switched-account");
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
