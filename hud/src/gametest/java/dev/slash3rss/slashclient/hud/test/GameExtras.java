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

			// crosshair presets, the pixel editor, and the × that hides a module in the layout editor
			context.runOnClient(mc -> {
				TestHooks.crosshairStyle("circledot");
				TestHooks.cpuGpu();
			});
			context.waitTicks(40);
			String loads = context.computeOnClient(mc -> TestHooks.cpuGpuValues());
			String[] cg = loads.split(" ");
			// from 26.1 on, the game gets no GPU timestamps on macOS (F3 shows no GPU load there either)
			boolean mac = System.getProperty("os.name").toLowerCase().contains("mac");
			if (Double.parseDouble(cg[0]) < 0 || (!mac && Double.parseDouble(cg[1]) <= 0)) throw new AssertionError("CPU or GPU not measured: " + loads);
			context.takeScreenshot("extras-crosshair-circle");
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("crosshair"));
			context.waitTicks(5);
			double[] from = context.computeOnClient(mc -> TestHooks.gridPoint(13, 4));
			double[] to = context.computeOnClient(mc -> TestHooks.gridPoint(16, 4));
			context.runOnClient(mc -> {
				TestHooks.mouse("press", from);
				TestHooks.mouse("drag", to);
				TestHooks.mouse("release", to);
			});
			context.waitTicks(3);
			context.takeScreenshot("extras-crosshair-editor");
			String state = context.computeOnClient(mc -> TestHooks.crosshairState());
			String row4 = state.startsWith("custom ") ? state.substring(7).split("/")[4] : "";
			if (!row4.startsWith(".............####")) throw new AssertionError("Painting the crosshair failed: " + state);
			context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::new);
			context.waitTicks(3);
			double[] x = context.computeOnClient(mc -> TestHooks.closePoint("fps"));
			// the × shows with the mouse on the module (the test's cursor sits in GUI points × scale)
			double scale = context.computeOnClient(mc -> mc.getWindow().getScreenWidth() / (double) mc.getWindow().getGuiScaledWidth());
			context.getInput().setCursorPos(x[0] * scale, x[1] * scale);
			context.waitTicks(3);
			context.takeScreenshot("extras-hide-module");
			context.runOnClient(mc -> TestHooks.mouse("press", x));
			context.waitTicks(2);
			if (context.computeOnClient(mc -> TestHooks.moduleOn("fps"))) throw new AssertionError("The × did not hide the module");
			context.setScreen(() -> null);

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
