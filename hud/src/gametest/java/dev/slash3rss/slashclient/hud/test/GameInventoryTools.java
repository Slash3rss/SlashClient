package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.HudEditScreen;
//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.inventory.InvToolsTestHooks;
//#endif
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The inventory tools in a survival world: a shulker box's contents in its tooltip, the search
 * box framing what matches, Shift held and the mouse swept over slots moving each of them, a locked hotbar slot (its lock drawn, Q, the number keys and the
 * offhand key stopped on it, while an unlocked slot still drops), the inventory module on the
 * HUD and in the editor, and F2's screenshot with its caption drawn in.
 */
public class GameInventoryTools implements FabricClientGameTest {
	private static final String SHULKER = "minecraft:red_shulker_box[container=["
		+ "{slot:0,item:{id:\"minecraft:diamond\",count:64}},{slot:1,item:{id:\"minecraft:diamond\",count:23}},"
		+ "{slot:4,item:{id:\"minecraft:golden_apple\",count:12}},{slot:8,item:{id:\"minecraft:ender_pearl\",count:16}},"
		+ "{slot:10,item:{id:\"minecraft:diamond_sword\",count:1}},{slot:13,item:{id:\"minecraft:totem_of_undying\",count:1}},"
		+ "{slot:16,item:{id:\"minecraft:experience_bottle\",count:40}},{slot:18,item:{id:\"minecraft:oak_log\",count:64}},"
		+ "{slot:22,item:{id:\"minecraft:netherite_ingot\",count:3}},{slot:26,item:{id:\"minecraft:cooked_beef\",count:32}}]]";

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		// the tests end on the game's own title screen
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			// auto tool takes a worn pickaxe like any other: it does not keep a tool from breaking
			String speeds = context.computeOnClient(mc -> {
				var stone = net.minecraft.world.level.block.Blocks.STONE.defaultBlockState();
				var fresh = new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.DIAMOND_PICKAXE);
				var worn = fresh.copy();
				worn.setDamageValue(worn.getMaxDamage() - 1);
				return TestHooks.autoToolSpeed(fresh, stone) + " " + TestHooks.autoToolSpeed(worn, stone);
			});
			String[] sp = speeds.split(" ");
			if (!sp[0].equals(sp[1]) || Float.parseFloat(sp[1]) <= 1f) throw new AssertionError("A worn pickaxe for auto tool: " + speeds);
			// a pickaxe only in the backpack is found too (and one on the hotbar wins when equal)
			String slots = context.computeOnClient(mc -> {
				var stone = net.minecraft.world.level.block.Blocks.STONE.defaultBlockState();
				// the player's own inventory, put back as it was afterwards
				var inv = mc.player.getInventory();
				var keep3 = inv.getItem(3).copy();
				var keep20 = inv.getItem(20).copy();
				inv.setItem(3, net.minecraft.world.item.ItemStack.EMPTY);
				inv.setItem(20, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.IRON_PICKAXE));
				int fromBackpack = TestHooks.autoToolSlot(inv, stone);
				inv.setItem(3, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.IRON_PICKAXE));
				int fromHotbar = TestHooks.autoToolSlot(inv, stone);
				inv.setItem(3, keep3);
				inv.setItem(20, keep20);
				return fromBackpack + " " + fromHotbar;
			});
			if (!slots.equals("20 3")) throw new AssertionError("Auto tool slots (backpack, then hotbar): " + slots);
			// leaves: the shears are the fastest, a hoe when hoes are preferred for leaves; stone is not leaves
			String preferred = context.computeOnClient(mc -> {
				var inv = mc.player.getInventory();
				var cfg = dev.slash3rss.slashclient.hud.SlashHud.config;
				var keep3 = inv.getItem(3).copy();
				var keep20 = inv.getItem(20).copy();
				inv.setItem(3, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.SHEARS));
				inv.setItem(20, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.IRON_HOE));
				var leaves = net.minecraft.world.level.block.Blocks.OAK_LEAVES.defaultBlockState();
				String out = TestHooks.autoToolSlot(inv, leaves) + "";
				cfg.autoToolLeaves = "hoe";
				out += " " + TestHooks.autoToolSlot(inv, leaves);
				out += " " + TestHooks.autoToolSlot(inv, net.minecraft.world.level.block.Blocks.DIRT.defaultBlockState());
				cfg.autoToolLeaves = "fastest";
				inv.setItem(3, keep3);
				inv.setItem(20, keep20);
				return out;
			});
			if (!preferred.equals("3 20 " + context.computeOnClient(mc -> mc.player.getInventory().getSelectedSlot())))
				throw new AssertionError("Auto tool on leaves (fastest, hoe preferred) and dirt: " + preferred);
			// for a hit: the weapon that hits hardest (a diamond axe in the backpack over an iron sword on the
			// hotbar); for a sheep: the shears
			String weapons = context.computeOnClient(mc -> {
				var inv = mc.player.getInventory();
				var keep3 = inv.getItem(3).copy();
				var keep20 = inv.getItem(20).copy();
				var keep25 = inv.getItem(25).copy();
				inv.setItem(3, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.IRON_SWORD));
				inv.setItem(20, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.DIAMOND_AXE));
				String out = TestHooks.autoToolWeapon(inv) + " " + TestHooks.weaponDamage(inv.getItem(3)) + " " + TestHooks.weaponDamage(inv.getItem(20))
					+ " " + TestHooks.weaponDamage(net.minecraft.world.item.ItemStack.EMPTY);
				// a sword preferred: the iron sword, though the axe hits harder
				dev.slash3rss.slashclient.hud.SlashHud.config.autoToolWeapon = "sword";
				out += " " + TestHooks.autoToolWeapon(inv);
				dev.slash3rss.slashclient.hud.SlashHud.config.autoToolWeapon = "strongest";
				inv.setItem(3, keep3);
				inv.setItem(20, keep20);
				inv.setItem(25, keep25);
				return out;
			});
			if (!weapons.equals("20 5.0 8.0 0.0 3")) throw new AssertionError("Auto tool for a hit (weapon slot, damages, a sword preferred): " + weapons);
			// a right click on a mob: shears for the sheep, the bucket for the cow; with milking off the cow
			// gets its food (feeding switched on), with feeding off nothing
			world.getServer().runCommand("summon minecraft:sheep ~3 ~ ~");
			world.getServer().runCommand("summon minecraft:cow ~-3 ~ ~");
			context.waitTicks(20);
			String uses = context.computeOnClient(mc -> {
				var inv = mc.player.getInventory();
				var cfg = dev.slash3rss.slashclient.hud.SlashHud.config;
				net.minecraft.world.entity.Entity sheep = null, cow = null;
				for (var e : mc.level.entitiesForRendering()) {
					String id = net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath();
					if (id.equals("sheep")) sheep = e;
					if (id.equals("cow")) cow = e;
				}
				if (sheep == null || cow == null) return "no mobs";
				int[] spots = { 25, 26, 27 };
				var keep = new net.minecraft.world.item.ItemStack[3];
				for (int i = 0; i < 3; i++) keep[i] = inv.getItem(spots[i]).copy();
				inv.setItem(25, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.SHEARS));
				inv.setItem(26, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.BUCKET));
				inv.setItem(27, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.WHEAT));
				boolean milk = cfg.autoToolMilk, feed = cfg.autoToolFeed;
				cfg.autoToolFeed = true;
				String out = TestHooks.autoToolFor(inv, sheep) + " " + TestHooks.autoToolFor(inv, cow);
				cfg.autoToolMilk = false;
				out += " " + TestHooks.autoToolFor(inv, cow);
				cfg.autoToolFeed = false;
				out += " " + TestHooks.autoToolFor(inv, cow);
				cfg.autoToolMilk = milk;
				cfg.autoToolFeed = feed;
				for (int i = 0; i < 3; i++) inv.setItem(spots[i], keep[i]);
				return out;
			});
			if (!uses.equals("25 26 27 -1")) throw new AssertionError("Auto tool for a right click (sheep, cow, cow fed, cow left be): " + uses);
			world.getServer().runCommand("kill @e[type=!player]");
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode survival @a");
			server.runCommand("clear @a");
			server.runCommand("item replace entity @p hotbar.0 with " + SHULKER);
			server.runCommand("item replace entity @p hotbar.1 with minecraft:dirt 32");
			server.runCommand("item replace entity @p hotbar.2 with minecraft:cobblestone 20");
			server.runCommand("item replace entity @p hotbar.3 with minecraft:diamond_pickaxe");
			server.runCommand("item replace entity @p inventory.0 with minecraft:diamond 7");
			server.runCommand("item replace entity @p inventory.4 with minecraft:bread 16");
			server.runCommand("item replace entity @p inventory.10 with minecraft:torch 48");
			server.runCommand("item replace entity @p inventory.20 with minecraft:iron_ingot 30");
			context.runOnClient(mc -> InvToolsTestHooks.reset());
			context.waitTicks(20);
			context.runOnClient(mc -> InvToolsTestHooks.quiet());

			// the shulker box's tooltip: a grid of what is inside, the game's list of names gone
			String shulker = context.computeOnClient(mc -> InvToolsTestHooks.shulker(0));
			System.out.println("SlashClient test: shulker tooltip " + shulker);
			if (!shulker.startsWith("ff") || !shulker.contains(":0=64,1=23,4=12,") || shulker.contains("x64") || shulker.contains("x23"))
				throw new AssertionError("The shulker box's tooltip: " + shulker);
			context.runOnClient(mc -> InvToolsTestHooks.openInventory());
			context.waitTicks(5);
			if (context.computeOnClient(mc -> InvToolsTestHooks.searchFocused())) throw new AssertionError("The search box takes the keys before it is clicked");
			int[] box = context.computeOnClient(mc -> InvToolsTestHooks.slotOnWindow(0));
			context.getInput().setCursorPos(box[0], box[1]);
			context.waitTicks(5);
			context.takeScreenshot("invtools-shulker-tooltip");

			// the search: the diamond, the pickaxe and the box with diamonds inside
			int found = context.computeOnClient(mc -> InvToolsTestHooks.search("diamond"));
			if (found != 3) throw new AssertionError("The search for diamond matched " + found + " slots");
			// enchantments and lore typed without Polish letters, and the server's colour codes left out
			if (!context.computeOnClient(mc -> InvToolsTestHooks.searchFinds("§7Ostrość V", "ostrosc v") && InvToolsTestHooks.searchFinds("Złota łuska", "zlota LUSKA")))
				throw new AssertionError("The search without Polish letters");
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(5);
			context.takeScreenshot("invtools-search");
			// pinned with a double click: the next window opened has it already; a double click again unpins
			String pin = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.inventory.InventorySearch.doubleClickForTest());
			context.setScreen(() -> null);
			context.waitTicks(2);
			context.runOnClient(mc -> InvToolsTestHooks.openInventory());
			context.waitTicks(5);
			String kept = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.inventory.InventorySearch.boxText());
			context.takeScreenshot("invtools-search-pinned");
			String unpinned = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.inventory.InventorySearch.doubleClickForTest());
			if (!pin.equals("diamond") || !kept.equals("diamond") || !unpinned.isEmpty())
				throw new AssertionError("The pinned search (pinned, in the next window, after unpinning): " + pin + " | " + kept + " | " + unpinned);
			context.computeOnClient(mc -> InvToolsTestHooks.search(""));

			// Shift held and the left button swept along a row of the backpack: every slot passed over
			// goes to the hotbar, also those the cursor jumped across between two frames
			server.runCommand("item replace entity @p inventory.12 with minecraft:stick 5");
			server.runCommand("item replace entity @p inventory.13 with minecraft:string 6");
			server.runCommand("item replace entity @p inventory.14 with minecraft:feather 7");
			server.runCommand("item replace entity @p inventory.15 with minecraft:bone 8");
			context.waitTicks(5);
			// the press on the empty slot before them (the test's clicks carry no Shift for the game's
			// own Shift-click, which moves the first slot when a player does it)
			int[] first = context.computeOnClient(mc -> InvToolsTestHooks.slotOnWindow(20));
			int[] last = context.computeOnClient(mc -> InvToolsTestHooks.slotOnWindow(24));
			context.getInput().setCursorPos(first[0], first[1]);
			context.waitTicks(2);
			context.getInput().holdKey(InputConstants.KEY_LSHIFT);
			context.getInput().holdMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(2);
			// three slots in one step, then the last one
			int step = (last[0] - first[0]) / 4;
			context.getInput().moveCursor(step * 3, 0);
			context.waitTicks(2);
			context.getInput().moveCursor(last[0] - first[0] - step * 3, 0);
			context.waitTicks(2);
			context.getInput().releaseMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.getInput().releaseKey(InputConstants.KEY_LSHIFT);
			context.waitTicks(10);
			String swept = context.computeOnClient(mc -> InvToolsTestHooks.item(21) + "," + InvToolsTestHooks.item(22) + "," + InvToolsTestHooks.item(23) + "," + InvToolsTestHooks.item(24)
				+ "|" + InvToolsTestHooks.item(4) + "," + InvToolsTestHooks.item(5) + "," + InvToolsTestHooks.item(6) + "," + InvToolsTestHooks.item(7));
			System.out.println("SlashClient test: Shift-drag " + swept);
			if (!swept.equals("empty,empty,empty,empty|stick x5,string x6,feather x7,bone x8")) throw new AssertionError("Shift-drag over the backpack: " + swept);
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(3);
			// the recipes the new items unlocked: no toast over the next pictures
			context.runOnClient(mc -> InvToolsTestHooks.quiet());
			context.takeScreenshot("invtools-shift-drag");

			// a locked slot: its lock in the inventory, Q over it and the number key 2 over the diamond do nothing
			context.runOnClient(mc -> InvToolsTestHooks.lock(1));
			int[] dirt = context.computeOnClient(mc -> InvToolsTestHooks.slotOnWindow(1));
			context.getInput().setCursorPos(dirt[0], dirt[1]);
			context.waitTicks(3);
			context.getInput().pressKey(InputConstants.KEY_Q);
			context.waitTicks(10);
			int[] diamond = context.computeOnClient(mc -> InvToolsTestHooks.slotOnWindow(9));
			context.getInput().setCursorPos(diamond[0], diamond[1]);
			context.waitTicks(3);
			context.getInput().pressKey(InputConstants.KEY_2);
			context.waitTicks(10);
			String afterScreen = context.computeOnClient(mc -> InvToolsTestHooks.item(1) + "," + InvToolsTestHooks.item(9));
			if (!afterScreen.equals("dirt x32,diamond x7")) throw new AssertionError("A locked slot changed in the inventory: " + afterScreen);
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(3);
			context.takeScreenshot("invtools-lock-inventory");
			context.setScreen(() -> null);
			context.waitTicks(5);

			// in the world: Q and the offhand key on the locked slot do nothing, Q on the next slot drops one
			context.getInput().pressKey(InputConstants.KEY_2);
			context.waitTicks(3);
			context.getInput().pressKey(InputConstants.KEY_Q);
			context.waitTicks(3);
			context.getInput().pressKey(InputConstants.KEY_F);
			context.waitTicks(10);
			context.takeScreenshot("invtools-lock-hotbar");
			context.getInput().pressKey(InputConstants.KEY_3);
			context.waitTicks(3);
			context.getInput().pressKey(InputConstants.KEY_Q);
			context.waitTicks(10);
			String afterWorld = context.computeOnClient(mc -> InvToolsTestHooks.item(1) + "," + InvToolsTestHooks.offhand() + "," + InvToolsTestHooks.item(2));
			if (!afterWorld.equals("dirt x32,empty,cobblestone x19")) throw new AssertionError("Locked slot in the world: " + afterWorld);
			// K unlocks the slot in hand
			context.getInput().pressKey(InputConstants.KEY_2);
			context.waitTicks(3);
			context.getInput().pressKey(InputConstants.KEY_K);
			context.waitTicks(3);
			if (context.computeOnClient(mc -> InvToolsTestHooks.locked(1))) throw new AssertionError("K did not unlock the slot in hand");
			context.runOnClient(mc -> InvToolsTestHooks.lock(1));

			// the inventory module on the HUD, then in the editor
			context.runOnClient(mc -> InvToolsTestHooks.inventoryModule(true));
			context.waitTicks(5);
			context.takeScreenshot("invtools-hud-module");
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("invtools-hud-editor");
			// the caption's options
			context.setScreen(() -> new HudEditScreen("screenshotCaption"));
			context.waitTicks(5);
			context.takeScreenshot("invtools-settings-caption");
			context.setScreen(() -> null);
			context.runOnClient(mc -> InvToolsTestHooks.inventoryModule(false));

			// F2 with the caption on: it is drawn into the saved picture
			context.runOnClient(mc -> InvToolsTestHooks.caption(true));
			context.waitTicks(5);
			context.getInput().pressKey(InputConstants.KEY_F2);
			for (int i = 0; i < 100 && context.computeOnClient(mc -> InvToolsTestHooks.lastCaption()).isEmpty(); i++) context.waitTicks(2);
			String caption = context.computeOnClient(mc -> InvToolsTestHooks.lastCaption());
			System.out.println("SlashClient test: screenshot caption\n" + caption);
			if (!caption.contains("X ") || !caption.contains(" Z ") || !caption.matches("(?s).*\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d.*"))
				throw new AssertionError("The screenshot's caption: " + caption);
			context.runOnClient(mc -> InvToolsTestHooks.caption(false));
			context.runOnClient(mc -> InvToolsTestHooks.reset());
		}
	}
}
