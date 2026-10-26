package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.inventory.InvToolsTestHooks;
//#endif
import dev.slash3rss.slashclient.hud.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Sorting in a survival world: a chest of mixed items sorted with the window's button (tools
 * first, then blocks, food, the rest, by name; half stacks put together), the player's backpack
 * sorted with R (the hotbar left alone), a sort stopped by closing the window, and the list of
 * servers it stays off on.
 */
public class GameInventorySort implements FabricClientGameTest {
	private static final String CHEST = "minecraft:chest[facing=north]{Items:["
		+ "{Slot:0b,id:\"minecraft:dirt\",count:10},{Slot:2b,id:\"minecraft:bread\",count:5},{Slot:3b,id:\"minecraft:stone\",count:40},"
		+ "{Slot:5b,id:\"minecraft:dirt\",count:20},{Slot:7b,id:\"minecraft:diamond_sword\",count:1},{Slot:9b,id:\"minecraft:apple\",count:3},"
		+ "{Slot:12b,id:\"minecraft:dirt\",count:64},{Slot:13b,id:\"minecraft:stone\",count:30},{Slot:15b,id:\"minecraft:diamond\",count:7},"
		+ "{Slot:18b,id:\"minecraft:bread\",count:2},{Slot:20b,id:\"minecraft:oak_log\",count:16},{Slot:26b,id:\"minecraft:iron_pickaxe\",count:1}]}";

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		// the list of servers it stays off on: the server and its subdomains, any port
		context.runOnClient(mc -> {
			String list = "hypixel.net, *.example.pl;mc.other.com";
			check(MapSortTestHooks.blockedOn("mc.hypixel.net", list), "a subdomain of a listed server");
			check(MapSortTestHooks.blockedOn("HYPIXEL.NET:25565", list), "a listed server with a port");
			check(MapSortTestHooks.blockedOn("play.example.pl", list), "a *. entry");
			check(!MapSortTestHooks.blockedOn("nothypixel.net", list), "a server that only ends the same");
			check(!MapSortTestHooks.blockedOn("skyup.pl", list), "a server not on the list");
			check(!MapSortTestHooks.blockedOn("skyup.pl", ""), "an empty list");
		});
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode survival @a");
			server.runCommand("clear @a");
			server.runCommand("fill -3 99 -3 3 99 5 stone");
			server.runCommand("setblock 0 100 2 " + CHEST);
			server.runCommand("tp @a 0 100 0 0 30");
			context.runOnClient(mc -> MapSortTestHooks.sortSettings(true, 50, false, "hypixel.net"));
			context.waitTicks(20);
			context.runOnClient(mc -> InvToolsTestHooks.quiet());

			// the chest with its button, sorted by a click on it
			context.runOnClient(mc -> MapSortTestHooks.use(0, 100, 2));
			waitFor(context, () -> !context.computeOnClient(mc -> MapSortTestHooks.chest()).isEmpty(), "the chest did not open");
			context.waitTicks(5);
			String before = context.computeOnClient(mc -> MapSortTestHooks.chest());
			System.out.println("SlashClient test: chest before sorting " + before);
			int[] button = context.computeOnClient(mc -> MapSortTestHooks.sortButton(false));
			context.getInput().setCursorPos(button[0], button[1]);
			context.waitTicks(3);
			context.takeScreenshot("sort-chest-before");
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
			// with 50 ms between clicks it takes a while: not all at once
			context.waitTicks(1);
			check(context.computeOnClient(mc -> MapSortTestHooks.sorting()), "the sort ran all at once despite the delay: " + context.computeOnClient(mc -> MapSortTestHooks.lastSort()));
			waitFor(context, () -> !context.computeOnClient(mc -> MapSortTestHooks.sorting()), "the sort did not end");
			context.waitTicks(10);
			String after = context.computeOnClient(mc -> MapSortTestHooks.chest());
			String last = context.computeOnClient(mc -> MapSortTestHooks.lastSort());
			System.out.println("SlashClient test: chest sorted (" + last + ") " + after);
			String want = "diamond_sword x1,iron_pickaxe x1,dirt x64,dirt x30,oak_log x16,stone x64,stone x6,apple x3,bread x7,diamond x7,";
			if (!after.startsWith(want) || !after.substring(want.length()).replace("-,", "").isEmpty()) throw new AssertionError("The chest sorted: " + after);
			check(!context.computeOnClient(mc -> MapSortTestHooks.carrying()), "something left in hand");
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(3);
			context.takeScreenshot("sort-chest-after");
			// the tooltip of the apple next to the button covers the button, not the other way round
			int[] apple = context.computeOnClient(mc -> MapSortTestHooks.chestSlotTop(7));
			context.getInput().setCursorPos(apple[0], apple[1]);
			context.waitTicks(3);
			context.takeScreenshot("sort-chest-tooltip");
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(2);
			// sorted again: nothing to do
			check(context.computeOnClient(mc -> MapSortTestHooks.sort(false)).equals("nothing"), "a sorted chest sorted again");

			// closed in the middle of a slow sort: it stops
			context.runOnClient(mc -> MapSortTestHooks.sortSettings(true, 250, false, "hypixel.net"));
			server.runCommand("setblock 0 100 2 air");
			server.runCommand("setblock 0 100 2 " + CHEST);
			context.waitTicks(5);
			context.runOnClient(mc -> MapSortTestHooks.closeWindow());
			context.waitTicks(3);
			context.runOnClient(mc -> MapSortTestHooks.use(0, 100, 2));
			waitFor(context, () -> !context.computeOnClient(mc -> MapSortTestHooks.chest()).isEmpty(), "the chest did not open again");
			context.waitTicks(5);
			context.runOnClient(mc -> MapSortTestHooks.sort(false));
			context.waitTicks(4);
			context.runOnClient(mc -> MapSortTestHooks.closeWindow());
			context.waitTicks(5);
			String stopped = context.computeOnClient(mc -> MapSortTestHooks.lastSort());
			check(stopped.equals("closed") && !context.computeOnClient(mc -> MapSortTestHooks.sorting()), "closing did not stop the sort: " + stopped);

			// the backpack with R, the hotbar left as it is
			context.runOnClient(mc -> MapSortTestHooks.sortSettings(true, 0, false, "hypixel.net"));
			server.runCommand("clear @a");
			server.runCommand("item replace entity @p hotbar.0 with minecraft:torch 5");
			server.runCommand("item replace entity @p hotbar.4 with minecraft:dirt 3");
			server.runCommand("item replace entity @p inventory.0 with minecraft:cobblestone 12");
			server.runCommand("item replace entity @p inventory.3 with minecraft:golden_apple 2");
			server.runCommand("item replace entity @p inventory.8 with minecraft:cobblestone 60");
			server.runCommand("item replace entity @p inventory.11 with minecraft:stone_axe");
			server.runCommand("item replace entity @p inventory.20 with minecraft:arrow 33");
			server.runCommand("item replace entity @p inventory.26 with minecraft:andesite 9");
			context.waitTicks(10);
			context.runOnClient(mc -> InvToolsTestHooks.openInventory());
			context.waitTicks(5);
			context.getInput().setCursorPos(4, 4);
			context.takeScreenshot("sort-inventory-before");
			context.getInput().pressKey(InputConstants.KEY_R);
			waitFor(context, () -> !context.computeOnClient(mc -> MapSortTestHooks.sorting()), "the inventory sort did not end");
			context.waitTicks(10);
			String backpack = context.computeOnClient(mc -> MapSortTestHooks.inventory(9, 35));
			String hotbar = context.computeOnClient(mc -> MapSortTestHooks.inventory(0, 8));
			System.out.println("SlashClient test: backpack sorted with R (" + context.computeOnClient(mc -> MapSortTestHooks.lastSort()) + ") " + backpack + " hotbar " + hotbar);
			String wantPack = "stone_axe x1,andesite x9,cobblestone x64,cobblestone x8,golden_apple x2,arrow x33,";
			if (!backpack.startsWith(wantPack)) throw new AssertionError("The backpack sorted: " + backpack);
			check(hotbar.equals("torch x5,-,-,-,dirt x3,-,-,-,-,"), "the hotbar changed: " + hotbar);
			context.takeScreenshot("sort-inventory-after");
			context.runOnClient(mc -> MapSortTestHooks.closeWindow());
			context.waitTicks(5);

			// the arrows in a chest: all of the chest into the inventory (the game fills the hotbar first, as
			// with shift-clicks), then all of the backpack into the chest (the hotbar stays as it is)
			context.runOnClient(mc -> MapSortTestHooks.use(0, 100, 2));
			waitFor(context, () -> !context.computeOnClient(mc -> MapSortTestHooks.chest()).isEmpty(), "the chest did not open for the arrows");
			context.waitTicks(5);
			int[] out = context.computeOnClient(mc -> MapSortTestHooks.moveButton(false));
			context.getInput().setCursorPos(out[0], out[1]);
			context.waitTicks(3);
			context.takeScreenshot("chest-move-buttons");
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(10);
			String emptied = context.computeOnClient(mc -> MapSortTestHooks.chest());
			check(emptied.replace("-,", "").isEmpty(), "the chest not emptied by its arrow: " + emptied);
			int[] in = context.computeOnClient(mc -> MapSortTestHooks.moveButton(true));
			context.getInput().setCursorPos(in[0], in[1]);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(10);
			String packAfter = context.computeOnClient(mc -> MapSortTestHooks.inventory(9, 35));
			String hotbarAfter = context.computeOnClient(mc -> MapSortTestHooks.inventory(0, 8));
			String filled = context.computeOnClient(mc -> MapSortTestHooks.chest());
			check(packAfter.replace("-,", "").isEmpty() && hotbarAfter.startsWith("torch x5,") && filled.contains("golden_apple x2"),
				"all into the chest: backpack " + packAfter + " hotbar " + hotbarAfter + " chest " + filled);
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(2);
			context.takeScreenshot("chest-move-filled");
			context.runOnClient(mc -> MapSortTestHooks.closeWindow());
			context.runOnClient(mc -> MapSortTestHooks.sortSettings(true, 50, false, "hypixel.net"));
		}
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	private static void waitFor(ClientGameTestContext context, java.util.function.BooleanSupplier done, String what) {
		for (int i = 0; i < 200; i++) {
			if (done.getAsBoolean()) return;
			context.waitTicks(2);
		}
		throw new AssertionError(what);
	}
}
