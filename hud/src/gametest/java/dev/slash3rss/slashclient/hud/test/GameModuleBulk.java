package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The row above the settings window's cards: "Enabled first" puts the cards that are on at the top
 * (each part in its usual order) and is remembered; "Turn all off" asks first, then switches off
 * every card listed except the game's own parts and options (the chat, the scoreboard, Toggle
 * Sprint…), and Undo switches them all back on.
 */
public class GameModuleBulk implements FabricClientGameTest {
	private static void click(ClientGameTestContext context, String button) {
		double[] at = context.computeOnClient(mc -> TestHooks.listButton(button));
		if (at == null) throw new AssertionError("No button \"" + button + "\" above the cards");
		context.runOnClient(mc -> {
			TestHooks.mouse("press", at);
			TestHooks.mouse("release", at);
		});
		context.waitTicks(3);
	}

	/** "fps=1,!chat=1" as id → "1"/"0", with the game's own parts under their "!id". */
	private static Map<String, String> states(String line) {
		Map<String, String> out = new LinkedHashMap<>();
		for (String part : line.split(",")) {
			String[] kv = part.split("=");
			out.put(kv[0], kv[1]);
		}
		return out;
	}

	private static Map<String, String> states(ClientGameTestContext context) {
		String line = context.computeOnClient(mc -> TestHooks.cardStates());
		return states(line);
	}

	private static boolean on(Map<String, String> states, String id) {
		return "1".equals(states.get(id)) || "1".equals(states.get("!" + id));
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(20);
			String startLine = context.computeOnClient(mc -> TestHooks.cardStates());
			context.runOnClient(mc -> {
				SlashHud.config.moduleSort = "default";
				for (String id : new String[] { "fps", "ping", "clock", "coords", "armor" }) SlashHud.config.placement(id).enabled = true;
				SlashHud.config.placement("chat").enabled = true;
				SlashHud.config.zoom = true;
			});
			context.setScreen(HudEditScreen::settingsWindow);
			context.waitTicks(5);
			List<String> usual = Arrays.asList(context.computeOnClient(mc -> TestHooks.shownCards()).split(","));
			Map<String, String> before = states(context);

			// "Enabled first": the ones on first, then the rest, each in the usual order
			click(context, "sort");
			if (!"enabled".equals(context.computeOnClient(mc -> SlashHud.config.moduleSort))) throw new AssertionError("The order was not saved as \"enabled\"");
			List<String> want = new ArrayList<>();
			for (String id : usual) if (on(before, id)) want.add(id);
			if (want.size() < 5) throw new AssertionError("Too few cards on for the test: " + want);
			for (String id : usual) if (!on(before, id)) want.add(id);
			String sorted = context.computeOnClient(mc -> TestHooks.shownCards());
			if (!sorted.equals(String.join(",", want))) throw new AssertionError("Enabled first: " + sorted + ", expected " + String.join(",", want));
			context.takeScreenshot("modules-sort-enabled");
			// remembered: the window opened again lists them so too
			context.setScreen(HudEditScreen::settingsWindow);
			context.waitTicks(5);
			String again = context.computeOnClient(mc -> TestHooks.shownCards());
			if (!again.equals(sorted)) throw new AssertionError("Enabled first after opening again: " + again);

			// "Turn all off" asks first, and "Cancel" changes nothing
			click(context, "allOff");
			if (context.computeOnClient(mc -> TestHooks.listButton("allOffYes")) == null) throw new AssertionError("Turn all off did not ask");
			context.takeScreenshot("modules-all-off-ask");
			click(context, "allOffNo");
			if (!states(context).equals(before)) throw new AssertionError("Cancel switched something");
			click(context, "allOff");
			click(context, "allOffYes");
			Map<String, String> after = states(context);
			for (var e : before.entrySet()) {
				String id = e.getKey();
				boolean builtIn = id.startsWith("!");
				boolean listed = usual.contains(builtIn ? id.substring(1) : id);
				String expected = builtIn || !listed ? e.getValue() : "0";
				if (!expected.equals(after.get(id))) throw new AssertionError("After Turn all off " + id + "=" + after.get(id) + ", expected " + expected);
			}
			// the game's own parts that were on are on still
			for (String part : new String[] { "!chat", "!scoreboard", "!toasts" })
				if (!"1".equals(after.get(part))) throw new AssertionError("The game's part " + part + " was switched off: " + after);
			if (context.computeOnClient(mc -> SlashHud.config.placement("fps").enabled)) throw new AssertionError("FPS still on after Turn all off");
			context.takeScreenshot("modules-all-off");

			// Undo brings back every card as it was
			click(context, "allOffUndo");
			if (!states(context).equals(before)) throw new AssertionError("After Undo: " + states(context) + ", expected " + before);
			if (context.computeOnClient(mc -> TestHooks.listButton("allOffUndo")) != null) throw new AssertionError("Undo still offered after undoing");

			// all off again: the game's own parts' tab still has them on, and the HUD keeps the game's parts
			click(context, "allOff");
			click(context, "allOffYes");
			context.setScreen(() -> HudEditScreen.category("game"));
			context.waitTicks(5);
			context.takeScreenshot("modules-all-off-game");
			context.setScreen(() -> null);
			context.waitTicks(5);
			context.takeScreenshot("modules-all-off-hud");

			// as it was before the test
			context.runOnClient(mc -> {
				TestHooks.restoreCards(startLine);
				SlashHud.config.moduleSort = "default";
				SlashHud.config.save();
			});
			if (!states(context).equals(states(startLine))) throw new AssertionError("The cards were not put back after the test");
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
