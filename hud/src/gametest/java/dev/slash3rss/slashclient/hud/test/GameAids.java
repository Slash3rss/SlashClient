package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/** The helpers in a world: the TNT timer, damage numbers, the nick hider and drop protection. */
public class GameAids implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			// lit TNT in front of us: its seconds above it
			world.getServer().runCommand("execute as @p at @s run summon tnt ^ ^ ^5 {fuse:80}");
			context.waitTicks(10);
			String label = context.computeOnClient(mc -> TestHooks.tntLabel());
			if (!label.endsWith(" s")) throw new AssertionError("No timer above the TNT: " + label);
			context.takeScreenshot("aids-tnt");
			world.getServer().runCommand("kill @e[type=tnt]");
			// a zombie hit: the damage rises from it
			world.getServer().runCommand("execute as @p at @s run summon zombie ^ ^ ^4 {NoAI:1b}");
			context.waitTicks(10);
			world.getServer().runCommand("damage @e[type=zombie,limit=1] 5");
			context.waitTicks(3);
			if (context.computeOnClient(mc -> TestHooks.damagePops()) < 1) throw new AssertionError("No damage number for the hit");
			context.takeScreenshot("aids-damage");
			world.getServer().runCommand("kill @e[type=zombie]");
			// our nick written as "Ty" (the test plays in Polish or English: either word)
			String hidden = context.computeOnClient(mc -> TestHooks.hiddenNick(true));
			String shown = context.computeOnClient(mc -> TestHooks.hiddenNick(false));
			if (!hidden.matches("<(Ty|You)> hej") || shown.equals(hidden)) throw new AssertionError("Nick not hidden: " + hidden + " / " + shown);
			// a sword needs a second Q, dirt does not
			String guarded = context.computeOnClient(mc -> TestHooks.dropGuarded());
			if (!guarded.equals("true,false")) throw new AssertionError("Drop protection picked wrong items: " + guarded);
			// a scrollbar follows the mouse: dragged 70 of 133 px of track, then clicked at its very end
			String bar = context.computeOnClient(mc -> TestHooks.scrollbarDrag());
			String[] parts = bar.split(",");
			if (!parts[0].equals("true") || Integer.parseInt(parts[1]) < 150 || Integer.parseInt(parts[2]) < 390) throw new AssertionError("The scrollbar does not follow the mouse: " + bar);
			// the creative inventory's search: Polish names (without Polish letters) in a game in English, and English ones
			world.getServer().runCommand("gamemode creative @a");
			context.waitTicks(5);
			for (String q : new String[] { "miecz diament", "diamond sword", "diamentowy miecz" }) {
				String found = context.computeOnClient(mc -> TestHooks.creativeSearch(q));
				if (!found.startsWith("true ")) throw new AssertionError("The creative search for '" + q + "' misses the diamond sword: " + found);
			}
			context.waitTicks(3);
			context.takeScreenshot("aids-creative-search");
			context.setScreen(() -> null);
			// "Ciemne okna gry": the inventory and the creative inventory dark, their labels light; then back
			var dark = context.computeOnClient(mc -> TestHooks.darkGui(true, "dark"));
			context.waitFor(mc -> dark.isDone(), 1200);
			// past the reload screen fading out
			context.waitTicks(80);
			int darkLabel = context.computeOnClient(mc -> TestHooks.darkLabel());
			if (darkLabel != 0xE0E0E0) throw new AssertionError("A window's label with the dark windows: " + Integer.toHexString(darkLabel));
			context.computeOnClient(mc -> TestHooks.creativeSearch("diamond sword"));
			context.waitTicks(3);
			context.takeScreenshot("aids-dark-creative");
			world.getServer().runCommand("gamemode survival @a");
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.openInventory());
			context.waitTicks(3);
			context.takeScreenshot("aids-dark-inventory");
			for (String kind : new String[] { "chest", "furnace", "crafting", "anvil", "enchanting", "brewing" }) {
				context.runOnClient(mc -> TestHooks.openWindow(kind));
				context.waitTicks(3);
				context.takeScreenshot("aids-dark-" + kind);
			}
			context.setScreen(() -> null);
			var darker = context.computeOnClient(mc -> TestHooks.darkGui(true, "darker"));
			context.waitFor(mc -> darker.isDone(), 1200);
			context.waitTicks(80);
			context.runOnClient(mc -> TestHooks.openInventory());
			context.waitTicks(3);
			context.takeScreenshot("aids-darker-inventory");
			context.setScreen(() -> null);
			var light = context.computeOnClient(mc -> TestHooks.darkGui(false, "dark"));
			context.waitFor(mc -> light.isDone(), 1200);
			context.waitTicks(20);
			// "Okna w wyglądzie bloków": the crafting table's top over its grid, the furnace's front, the enchanting table's cloth…
			var blocks = context.computeOnClient(mc -> TestHooks.blockWindows(true));
			context.waitFor(mc -> blocks.isDone(), 1200);
			context.waitTicks(80);
			context.runOnClient(mc -> TestHooks.openInventory());
			context.waitTicks(3);
			context.takeScreenshot("aids-block-inventory");
			for (String kind : new String[] { "chest", "furnace", "crafting", "anvil", "enchanting", "brewing", "dispenser", "hopper", "shulker", "smithing" }) {
				context.runOnClient(mc -> TestHooks.openWindow(kind));
				context.waitTicks(3);
				context.takeScreenshot("aids-block-" + kind);
			}
			int blockLabel = context.computeOnClient(mc -> TestHooks.darkLabel());
			if (blockLabel != 0xFFFFFF) throw new AssertionError("A window's label on its block: " + Integer.toHexString(blockLabel));
			// a red shulker box in front of the player: its window red
			context.setScreen(() -> null);
			world.getServer().runCommand("execute as @p at @s anchored eyes run setblock ^ ^ ^2 red_shulker_box");
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.openWindow("shulker"));
			context.waitTicks(10);
			context.takeScreenshot("aids-block-shulker-red");
			context.setScreen(() -> null);
			world.getServer().runCommand("execute as @p at @s anchored eyes run setblock ^ ^ ^2 air");
			var plain = context.computeOnClient(mc -> TestHooks.blockWindows(false));
			context.waitFor(mc -> plain.isDone(), 1200);
			context.waitTicks(20);
			world.getServer().runCommand("gamemode survival @a");
			// SlashClient's keys in its own window
			context.runOnClient(mc -> TestHooks.audit(true));
			int keys = context.computeOnClient(mc -> TestHooks.openKeybinds());
			if (keys < 5) throw new AssertionError("The keys window lists only " + keys + " keys");
			context.waitTicks(5);
			context.takeScreenshot("aids-keybinds");
			context.runOnClient(mc -> TestHooks.reportAudit());
			// a key preset saved, the key changed, the preset loaded (read back from its file)
			String presets = context.computeOnClient(mc -> TestHooks.keyPresetsRoundTrip());
			String[] p = presets.split("\\|");
			if (!p[0].equals("key.keyboard.space") || !p[1].equals("key.keyboard.k,1,PvP") || !p[2].equals("1")) throw new AssertionError("Key presets: " + presets);
			context.waitTicks(5);
			context.takeScreenshot("aids-key-presets");
			context.runOnClient(mc -> TestHooks.reportAudit());
			context.runOnClient(mc -> TestHooks.keyPresetsCleanUp(p[3]));
			context.runOnClient(mc -> TestHooks.audit(false));
			context.setScreen(() -> null);
		}
	}
}
