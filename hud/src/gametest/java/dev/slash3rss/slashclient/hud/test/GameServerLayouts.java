package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * A HUD layout of a server's own: switched on in the editor's Share page while "on" a server
 * (the address is made up: the test world is singleplayer), changed there, gone back to the
 * player's own on leaving and on again on joining, still in the share codes, forgotten with its ×.
 * And the chat bigger and darker from its card: its box in the editor is where the game draws it,
 * and a click still lands on the right line.
 */
public class GameServerLayouts implements FabricClientGameTest {
	private static final String SERVER = "test.slashclient.pl";

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.serverLayoutsReset());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			for (int i = 1; i <= 4; i++) world.getServer().runCommand("say Wiadomość numer " + i + " na czacie");
			context.waitTicks(5);
			String standard = context.computeOnClient(mc -> TestHooks.layoutState("fps"));

			// on the server: the switch in the editor gives it a layout of its own
			context.runOnClient(mc -> TestHooks.joinServer(SERVER));
			context.setScreen(() -> dev.slash3rss.slashclient.hud.ui.HudEditScreen.category("share"));
			context.waitTicks(3);
			// a low window: the page scrolls down to the servers
			context.runOnClient(mc -> TestHooks.scrollDown());
			context.waitTicks(3);
			context.takeScreenshot("server-layouts-off");
			double[] toggle = context.computeOnClient(mc -> TestHooks.serverSwitchPoint());
			if (toggle == null) throw new AssertionError("No switch for the server's layout in the editor");
			context.runOnClient(mc -> {
				TestHooks.mouse("press", toggle);
				TestHooks.mouse("release", toggle);
			});
			context.waitTicks(2);
			String active = context.computeOnClient(mc -> TestHooks.activeLayout());
			if (!SERVER.equals(active)) throw new AssertionError("The switch did not save a layout for the server: " + active);
			// changed in the editor: the FPS in the middle, the chat bigger and darker
			context.runOnClient(mc -> {
				TestHooks.place("fps", 0.5f, 0.5f, 0, -60);
				TestHooks.chatLook(1.3f, 90f);
			});
			context.waitTicks(5);
			context.takeScreenshot("server-layouts-on");
			context.runOnClient(mc -> TestHooks.closeScreen());
			context.waitTicks(5);
			String onServer = context.computeOnClient(mc -> TestHooks.layoutState("fps"));
			if (!onServer.equals("0.50,0.50,0,-60 1.30 90")) throw new AssertionError("The server's layout is not on: " + onServer);
			context.takeScreenshot("server-layouts-server-hud");

			// the bigger chat: its box is where the game draws it, and a click lands on the line clicked
			context.setScreen(dev.slash3rss.slashclient.hud.ui.HudEditScreen::new);
			context.waitTicks(5);
			String box = context.computeOnClient(mc -> TestHooks.chatBoxCheck());
			if (!box.isEmpty()) throw new AssertionError("The chat's box is not where the game draws it:" + box);
			context.takeScreenshot("chat-look-editor");
			context.runOnClient(mc -> TestHooks.closeScreen());
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.clickableLine("[Kliknij]", "/slashtest"));
			context.waitTicks(2);
			String left = context.computeOnClient(mc -> TestHooks.clickChat(0, false));
			if (!left.equals("-|/slashtest")) throw new AssertionError("A click on the scaled chat missed its line: " + left);
			String copied = context.computeOnClient(mc -> TestHooks.copyLine(1));
			if (copied == null || !copied.contains("numer 4")) throw new AssertionError("A right click on the scaled chat copied the wrong line: " + copied);
			context.takeScreenshot("chat-look-open");
			context.setScreen(() -> null);

			// left: the player's own layout is back, and on again on joining
			context.runOnClient(mc -> TestHooks.joinServer(null));
			context.waitTicks(5);
			String left2 = context.computeOnClient(mc -> TestHooks.layoutState("fps"));
			if (!left2.equals(standard)) throw new AssertionError("The player's own layout did not come back: " + left2 + " (was " + standard + ")");
			context.takeScreenshot("server-layouts-default-hud");
			context.runOnClient(mc -> TestHooks.joinServer(SERVER));
			String again = context.computeOnClient(mc -> TestHooks.layoutState("fps"));
			if (!again.equals(onServer)) throw new AssertionError("The server's layout did not come back on joining: " + again);
			String share = context.computeOnClient(mc -> TestHooks.shareRoundTrip("fps"));
			if (!share.equals("ok")) throw new AssertionError("The share code lost the layout: " + share);

			// forgotten with its × in the editor: the player's own layout at once
			context.setScreen(() -> dev.slash3rss.slashclient.hud.ui.HudEditScreen.category("share"));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.scrollDown());
			context.waitTicks(3);
			double[] delete = context.computeOnClient(mc -> TestHooks.serverDeletePoint());
			if (delete == null) throw new AssertionError("The saved server is not listed");
			context.runOnClient(mc -> {
				TestHooks.mouse("press", delete);
				TestHooks.mouse("release", delete);
			});
			context.waitTicks(5);
			context.takeScreenshot("server-layouts-deleted");
			context.runOnClient(mc -> TestHooks.closeScreen());
			String after = context.computeOnClient(mc -> TestHooks.activeLayout() + " " + TestHooks.layoutState("fps"));
			if (!after.equals("null " + standard)) throw new AssertionError("Deleting the layout did not bring the own one back: " + after);
			context.runOnClient(mc -> TestHooks.serverLayoutsReset());
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
