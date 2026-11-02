package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonParser;
import dev.slash3rss.slashclient.hud.config.HudPresets;
import dev.slash3rss.slashclient.hud.testing.PresetTestHooks;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import dev.slash3rss.slashclient.hud.ui.PresetsPanel;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.List;

/**
 * The ready layouts in the editor's Share page: a card's click puts its modules on (each preset
 * with no two modules on each other, its HUD and the editor in screenshots), the player's own layout saved under
 * a name comes back from its card, "Back to my layout" brings back exactly the modules from before
 * the first preset, and a saved one is forgotten with two clicks on its ×.
 */
public class GamePresets implements FabricClientGameTest {
	/** A click on a place of the Share page, scrolled to first in the low test window (the point is asked again after each step). */
	private static void click(ClientGameTestContext context, java.util.function.Supplier<double[]> point, String what) {
		for (int i = 0; i < 60; i++) {
			if (context.computeOnClient(mc -> PresetTestHooks.scrollStep(point.get()))) break;
			context.waitTicks(1);
		}
		double[] at = context.computeOnClient(mc -> point.get());
		if (at == null || !context.computeOnClient(mc -> ((HudEditScreen) dev.slash3rss.slashclient.hud.Compat.screen(mc)).onSharePage(at)))
			throw new AssertionError("Not on the Share page to click: " + what);
		context.runOnClient(mc -> {
			TestHooks.mouse("press", at);
			TestHooks.mouse("release", at);
		});
		context.waitTicks(3);
	}

	private static void sharePage(ClientGameTestContext context) {
		context.setScreen(() -> HudEditScreen.category("share"));
		context.waitTicks(4);
	}


	private static void same(String a, String b, String when) {
		var x = JsonParser.parseString(a).getAsJsonObject();
		var y = JsonParser.parseString(b).getAsJsonObject();
		if (x.equals(y)) return;
		StringBuilder diff = new StringBuilder();
		java.util.Set<String> keys = new java.util.TreeSet<>(x.keySet());
		keys.addAll(y.keySet());
		for (String k : keys) if (!java.util.Objects.equals(x.get(k), y.get(k))) diff.append(' ').append(k).append(": ").append(x.get(k)).append(" / ").append(y.get(k));
		throw new AssertionError(when + ": the modules are not the same:" + diff);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> {
			TestHooks.serverLayoutsReset();
			PresetTestHooks.reset();
		});
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			String original = context.computeOnClient(mc -> PresetTestHooks.modules());

			sharePage(context);
			context.takeScreenshot("presets-share");
			// PvP from its card
			click(context, () -> PresetsPanel.centers.get("pvp"), "the PvP card");
			String pvp = context.computeOnClient(mc -> HudPresets.picked() + " " + PresetTestHooks.enabled("cps") + " " + PresetTestHooks.enabled("coords")
				+ " " + PresetTestHooks.enabled("chat") + " " + HudPresets.canGoBack());
			if (!pvp.equals("pvp true false true true")) throw new AssertionError("The PvP card did not put its modules on: " + pvp);
			context.takeScreenshot("presets-share-pvp");

			// every preset on the HUD of a usual screen (1920×1080, the game's GUI scale 3), with nothing lying on anything else
			context.getInput().resizeWindow(1920, 1080);
			context.runOnClient(mc -> TestHooks.guiScale(3));
			for (String id : HudPresets.IDS) {
				context.runOnClient(mc -> HudPresets.apply(id));
				context.setScreen(() -> null);
				context.waitTicks(5);
				List<String> overlaps = context.computeOnClient(mc -> PresetTestHooks.overlaps());
				if (!overlaps.isEmpty()) throw new AssertionError("Modules lie on each other in the preset " + id + ": " + overlaps);
				context.takeScreenshot("presets-hud-" + id);
				// in the editor every module shows, with a sample where the world has nothing to show yet
				context.setScreen(HudEditScreen::new);
				context.waitTicks(5);
				context.takeScreenshot("presets-editor-" + id);
				context.setScreen(() -> null);
			}
			context.getInput().resizeWindow(854, 480);
			context.runOnClient(mc -> TestHooks.guiScale(2));

			// PvP saved under a name, then put back from its card
			context.runOnClient(mc -> HudPresets.apply("pvp"));
			String pvpModules = context.computeOnClient(mc -> PresetTestHooks.modules());
			sharePage(context);
			context.runOnClient(mc -> PresetTestHooks.typeName("Mój PvP"));
			click(context, () -> PresetsPanel.saveCenter, "Save");
			List<String> saved = context.computeOnClient(mc -> HudPresets.saved());
			if (!saved.equals(List.of("Mój PvP"))) throw new AssertionError("Save did not keep the preset: " + saved);
			context.runOnClient(mc -> HudPresets.apply("minimal"));
			context.waitTicks(2);
			context.takeScreenshot("presets-share-saved");
			click(context, () -> PresetsPanel.centers.get(HudPresets.OWN + "Mój PvP"), "the saved preset's card");
			same(context.computeOnClient(mc -> PresetTestHooks.modules()), pvpModules, "The saved preset put back");

			// back to the player's own layout, exactly as it was: the button over the cards
			sharePage(context);
			context.takeScreenshot("presets-share-back");
			click(context, () -> PresetsPanel.backCenter, "Back to my layout");
			same(context.computeOnClient(mc -> PresetTestHooks.modules()), original, "Back to my layout");
			boolean still = context.computeOnClient(mc -> HudPresets.canGoBack() || HudPresets.picked() != null);
			if (still) throw new AssertionError("The way back is still offered after going back");

			// the saved one forgotten with two clicks on its ×
			click(context, () -> PresetsPanel.firstDelete, "the saved preset's ×");
			if (context.computeOnClient(mc -> HudPresets.saved()).isEmpty()) throw new AssertionError("One click on × deleted the preset at once");
			context.takeScreenshot("presets-delete-ask");
			click(context, () -> PresetsPanel.firstDelete, "the saved preset's × again");
			if (!context.computeOnClient(mc -> HudPresets.saved()).isEmpty()) throw new AssertionError("The second click on × did not delete the preset");
			same(context.computeOnClient(mc -> PresetTestHooks.modules()), original, "Deleting a saved preset");
			context.runOnClient(mc -> TestHooks.closeScreen());
			context.runOnClient(mc -> PresetTestHooks.reset());
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
