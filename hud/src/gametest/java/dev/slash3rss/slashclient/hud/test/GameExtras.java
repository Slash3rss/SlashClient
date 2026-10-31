package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.TestHooks;
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
		if (TestFilter.skip(context, getClass())) return;
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
			context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
			context.waitTicks(5);
			String copied = context.computeOnClient(mc -> TestHooks.copyLine(1));
			if (copied == null || !copied.contains("Ta sama wiadomość")) throw new AssertionError("Copied the wrong line: " + copied);
			// through the screen: a right click copies a plain line, but not one with a click event,
			// and a left click runs that event (26.3 numbers the mouse buttons anew)
			String plain = context.computeOnClient(mc -> TestHooks.clickChat(0, true));
			if (!plain.split("\\|")[0].contains("Inna wiadomość")) throw new AssertionError("A right click did not copy the line: " + plain);
			context.runOnClient(mc -> TestHooks.clickableLine("[Kliknij]", "/slashtest"));
			context.waitTicks(2);
			String right = context.computeOnClient(mc -> TestHooks.clickChat(0, true));
			if (!right.startsWith("-|")) throw new AssertionError("A right click copied a clickable line: " + right);
			String left = context.computeOnClient(mc -> TestHooks.clickChat(0, false));
			if (!left.equals("-|/slashtest")) throw new AssertionError("A left click did not run the click event: " + left);
			// the copy settings: § codes, the time it came in, without the sender; then as JSON
			context.runOnClient(mc -> TestHooks.coloredLine());
			context.waitTicks(2);
			context.runOnClient(mc -> TestHooks.copySettings("section", "hm", true));
			String coded = context.computeOnClient(mc -> TestHooks.clickChat(0, true)).split("\\|")[0];
			if (!coded.matches("\\[\\d{2}:\\d{2}] \u00a7cczerwony")) throw new AssertionError("Copied with the wrong settings: " + coded);
			context.runOnClient(mc -> TestHooks.copySettings("json", "off", false));
			String json = context.computeOnClient(mc -> TestHooks.clickChat(0, true)).split("\\|")[0];
			if (!json.contains("<Gracz> ") || !json.contains("\"color\":\"red\"")) throw new AssertionError("Copied the wrong JSON: " + json);
			context.runOnClient(mc -> TestHooks.copySettings("plain", "off", false));
			context.runOnClient(mc -> TestHooks.chatSearch("inna"));
			context.waitTicks(5);
			context.takeScreenshot("extras-chat-search");
			context.setScreen(() -> null);
			// the longer chat history: as many lines as set, the game's 100 when off
			String longer = context.computeOnClient(mc -> TestHooks.chatHistory(true, 1200)), vanilla = context.computeOnClient(mc -> TestHooks.chatHistory(false, 1200));
			if (!longer.equals("1200/1200") || !vanilla.equals("100/100")) throw new AssertionError("Chat history kept (lines/sent) " + longer + " | " + vanilla);

			// F2: the preview in the corner
			context.runOnClient(mc -> TestHooks.screenshot());
			context.waitTicks(20);
			context.takeScreenshot("extras-screenshot-preview");

			// freelook: the camera turns, the player does not
			context.getInput().holdKey(o -> dev.slash3rss.slashclient.hud.camera.Freelook.key);
			context.waitTicks(3);
			boolean ok = context.computeOnClient(mc -> TestHooks.freelookTurn());
			context.waitTicks(3);
			context.takeScreenshot("extras-freelook");
			context.getInput().releaseKey(o -> dev.slash3rss.slashclient.hud.camera.Freelook.key);
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
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("crosshair"));
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
			context.setScreen(dev.slash3rss.slashclient.hud.ui.HudEditScreen::new);
			context.waitTicks(3);
			double[] x = context.computeOnClient(mc -> TestHooks.closePoint("fps"));
			// the × shows with the mouse on the module (the test's cursor sits in GUI points × scale)
			double scale = context.computeOnClient(mc -> mc.getWindow().getScreenWidth() / (double) mc.getWindow().getGuiScaledWidth());
			context.getInput().setCursorPos(x[0] * scale, x[1] * scale);
			// the × is there once the editor has the module under the mouse (a frame or a few later)
			for (int t = 0; t < 40 && !"fps".equals(context.computeOnClient(mc -> TestHooks.editorHovered())); t++) context.waitTick();
			context.waitTicks(2);
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
			// the menu paused the world: it runs again before the world is closed (closing it as it wakes hung the game)
			context.waitTicks(20);
			// the chat stays after leaving (the game would empty it)
			context.runOnClient(mc -> {
				//#if MC >= 26.1
				dev.slash3rss.slashclient.hud.Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal("Zostaje po wyjściu"));
				//#else
				//$ dev.slash3rss.slashclient.hud.Compat.chat(mc).addMessage(net.minecraft.network.chat.Component.literal("Zostaje po wyjściu"));
				//#endif
			});
		}
		String kept = context.computeOnClient(mc -> TestHooks.chatLines());
		if (!kept.contains("Zostaje po wyjściu")) throw new AssertionError("The chat was emptied on leaving: " + kept);
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
