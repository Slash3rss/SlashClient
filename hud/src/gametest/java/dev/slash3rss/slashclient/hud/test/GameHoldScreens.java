package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.PauseScreen;
import net.minecraft.client.gui.screens.inventory.InventoryScreen;
import net.minecraft.core.BlockPos;

/**
 * A button held by its key goes on with the inventory open: the block in front is dug away and the
 * snowballs in hand are thrown while the player looks into the backpack. Switched off in the
 * settings it stops at the screen as before, and nothing stays pressed afterwards. The pause menu:
 * nothing while it pauses the game (singleplayer), digging once the world is open to LAN and the
 * menu no longer pauses it (as on a server).
 */
public class GameHoldScreens implements FabricClientGameTest {
	private static final BlockPos AHEAD = new BlockPos(0, 101, 1);

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			server.runCommand("gamemode survival @a");
			server.runCommand("clear @a");
			server.runCommand("fill -3 99 -3 3 99 5 stone");
			server.runCommand("fill -3 100 -3 3 103 5 air");
			server.runCommand("tp @a 0 100 0 0 0");
			server.runCommand("item replace entity @a hotbar.0 with diamond_pickaxe");
			context.runOnClient(mc -> TestHooks.firstPerson());
			server.runCommand("setblock 0 101 1 deepslate");
			context.waitTicks(20);
			check(!air(context), "no block in front of us");

			// the inventory open first, then the left button held: the block is dug away behind the inventory
			context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.hold(true, true, true));
			context.waitTicks(9);
			context.takeScreenshot("holdscreens-inventory-digging");
			waitFor(context, () -> air(context), "the block was not dug with the inventory open");
			context.waitTicks(20);
			context.takeScreenshot("holdscreens-inventory-dug");
			context.runOnClient(mc -> TestHooks.hold(true, false, true));
			check(context.computeOnClient(mc -> TestHooks.buttonsDown()).equals("false/false"), "a button stayed down over the inventory");
			context.setScreen(() -> null);
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.buttonsDown()).equals("false/false"), "a button stayed down after the inventory closed");
			server.runCommand("setblock 0 101 1 deepslate");
			context.waitTicks(30);
			check(!air(context), "the block was dug with holding let go");

			// auto tool under the inventory too: the hand on a stick, the pickaxe two slots on, taken for the digging
			server.runCommand("item replace entity @a hotbar.0 with stick");
			server.runCommand("item replace entity @a hotbar.2 with diamond_pickaxe");
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SlashHud.config.autoTool = true;
				TestHooks.selectSlot(0);
			});
			context.waitTicks(5);
			context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.hold(true, true, true));
			context.waitTicks(10);
			int picked = context.computeOnClient(mc -> TestHooks.selectedSlot());
			waitFor(context, () -> air(context), "the block was not dug with auto tool under the inventory");
			context.runOnClient(mc -> TestHooks.hold(true, false, true));
			context.setScreen(() -> null);
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.autoTool = false);
			check(picked == 2, "auto tool under the inventory took slot " + picked + ", not the pickaxe's");
			server.runCommand("item replace entity @a hotbar.0 with diamond_pickaxe");
			server.runCommand("item replace entity @a hotbar.2 with air");
			context.runOnClient(mc -> TestHooks.selectSlot(0));
			server.runCommand("setblock 0 101 1 deepslate");
			context.waitTicks(10);

			// switched off in the settings: nothing over the inventory
			context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.hold(true, true, false));
			context.waitTicks(40);
			check(!air(context), "the block was dug over the inventory with the setting off");
			context.runOnClient(mc -> TestHooks.hold(true, false, true));
			context.setScreen(() -> null);
			context.waitTicks(3);

			// the right button: snowballs thrown with the inventory open
			server.runCommand("setblock 0 101 1 air");
			server.runCommand("item replace entity @a hotbar.0 with snowball 16");
			context.waitTicks(5);
			context.setScreen(() -> new InventoryScreen(Minecraft.getInstance().player));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.hold(false, true, true));
			context.waitTicks(30);
			int left = context.computeOnClient(mc -> mc.player.getMainHandItem().getCount());
			context.runOnClient(mc -> TestHooks.hold(false, false, true));
			check(left < 12, "too few snowballs thrown with the inventory open: " + left + " of 16 left");
			context.setScreen(() -> null);
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.buttonsDown()).equals("false/false"), "a button stayed down after throwing");

			// "places fast": the right button held by its key uses the item every tick, as a held keyboard
			// key does, instead of the game's every 4 ticks
			int slow = thrownIn(context, server, false), fast = thrownIn(context, server, true);
			check(slow >= 3 && slow <= 8, "the right button held as usual threw " + slow + " snowballs in 20 ticks");
			check(fast >= slow * 2, "the right button placing fast threw only " + fast + " snowballs in 20 ticks (as usual: " + slow + ")");
			check(context.computeOnClient(mc -> TestHooks.buttonsDown()).equals("false/false"), "a button stayed down after throwing fast");

			// the pause menu: nothing while it pauses the game, digging once the world is open to LAN
			server.runCommand("item replace entity @a hotbar.0 with diamond_pickaxe");
			server.runCommand("setblock 0 101 1 deepslate");
			context.waitTicks(5);
			context.setScreen(() -> new PauseScreen(true));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.hold(true, true, true));
			context.waitTicks(30);
			check(context.computeOnClient(mc -> mc.isPaused()), "singleplayer's pause menu did not pause the game");
			check(!air(context), "the block was dug with the game paused");
			check(context.computeOnClient(mc -> TestHooks.openToLan()), "the world did not open to LAN");
			waitFor(context, () -> air(context), "the block was not dug with the pause menu open (world open to LAN)");
			context.takeScreenshot("holdscreens-pause");
			// auto tool under the pause menu: the pickaxe from the backpack is in the hand on the server too
			// (the others see it), not only on the player's screen
			context.runOnClient(mc -> TestHooks.hold(true, false, true));
			server.runCommand("item replace entity @a hotbar.0 with stone");
			server.runCommand("item replace entity @a inventory.11 with diamond_pickaxe");
			server.runCommand("setblock 0 101 1 obsidian");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.autoTool = true);
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.hold(true, true, true));
			context.waitTicks(30);
			String held = server.computeOnServer(s -> s.getPlayerList().getPlayers().get(0).getMainHandItem().getItem().toString());
			context.runOnClient(mc -> { TestHooks.hold(true, false, true); dev.slash3rss.slashclient.hud.SlashHud.config.autoTool = false; });
			server.runCommand("setblock 0 101 1 air");
			check(held.contains("diamond_pickaxe"), "auto tool under the pause menu: the server sees " + held + " in the hand");
			context.setScreen(() -> null);
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.buttonsDown()).equals("false/false"), "a button stayed down after the pause menu");

			// the setting on the page of holding a button, under its two keys
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("holdKeys"));
			context.waitTicks(5);
			context.takeScreenshot("holdscreens-settings");
			var polish = context.computeOnClient(mc -> TestHooks.language("pl_pl"));
			context.waitFor(mc -> polish.isDone(), 1200);
			context.waitTicks(60);
			context.takeScreenshot("holdscreens-settings-pl");
			var english = context.computeOnClient(mc -> TestHooks.language("en_us"));
			context.waitFor(mc -> english.isDone(), 1200);
			context.setScreen(() -> null);
		}
	}

	/** Snowballs thrown with the right button held by its key for 20 ticks in the game, placing fast or not. */
	private static int thrownIn(ClientGameTestContext context, net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext server, boolean fast) {
		// emptied first: a stack of the same item put over it does not always reach the player's screen
		server.runCommand("clear @a");
		context.waitTicks(3);
		server.runCommand("give @a snowball 64");
		context.runOnClient(mc -> { dev.slash3rss.slashclient.hud.SlashHud.config.holdUseFast = fast; TestHooks.selectSlot(0); });
		context.waitTicks(10);
		int before = context.computeOnClient(mc -> mc.player.getMainHandItem().getCount());
		context.runOnClient(mc -> TestHooks.hold(false, true, true));
		context.waitTicks(20);
		context.runOnClient(mc -> TestHooks.hold(false, false, true));
		context.waitTicks(3);
		int left = context.computeOnClient(mc -> mc.player.getMainHandItem().getCount());
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.holdUseFast = false);
		System.out.println("SlashClient test hold: " + (fast ? "fast" : "as usual") + " " + before + " -> " + left);
		return before - left;
	}

	private static boolean air(ClientGameTestContext context) {
		return context.computeOnClient(mc -> mc.level.getBlockState(AHEAD).isAir());
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	private static void waitFor(ClientGameTestContext context, java.util.function.BooleanSupplier done, String what) {
		for (int i = 0; i < 100; i++) {
			if (done.getAsBoolean()) return;
			context.waitTicks(2);
		}
		throw new AssertionError(what);
	}
}
