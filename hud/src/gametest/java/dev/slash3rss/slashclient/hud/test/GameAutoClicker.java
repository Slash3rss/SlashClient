package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * The autoclicker as other mods have it: held, it clicks while the mouse buttons are held (the left one
 * hits a husk in front of us, also only with it under the crosshair; the right one clicks too) and
 * nothing once they are let go; in the toggle mode its key starts the clicking with no button held;
 * switched off, nothing. The key holding a button lets go of it over a window too.
 */
public class GameAutoClicker implements FabricClientGameTest {
	/** A text as a command's NBT takes it: SNBT from 1.21.5 on, a JSON string in quotes before. */
	private static String nbtText(String s) {
		//#if MC >= 1.21.5
		return "\"" + s + "\"";
		//#else
		//$ return "'\"" + s.replace("\\n", "\\\\n") + "\"'";
		//#endif
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("execute at @a run summon husk ~ ~ ~2 {NoAI:1b,Silent:1b,PersistenceRequired:1b,Health:200f,attributes:[{id:\"minecraft:max_health\",base:200}]}");
			context.runOnClient(mc -> { TestHooks.firstPerson(); TestHooks.lookSouth(); });
			context.waitTicks(10);
			float start = context.computeOnClient(mc -> TestHooks.nearestHealth());
			if (start < 100) throw new AssertionError("No husk in front of us: " + start);

			// the Target box names a mob with no name of its own (a server's model) by the name tag over its head
			world.getServer().runCommand("data merge entity @e[type=husk,limit=1] {CustomName:" + nbtText("") + "}");
			world.getServer().runCommand("execute as @e[type=husk,limit=1] at @s run summon armor_stand ~ ~2.2 ~ {Invisible:1b,Marker:1b,NoGravity:1b,CustomNameVisible:1b,CustomName:" + nbtText("26.0 ❤ | Giermek poz. 4") + "}");
			context.waitTicks(10);
			String targetName = context.computeOnClient(mc -> TestHooks.shownTargetName());
			if (!targetName.equals("Giermek poz. 4")) throw new AssertionError("The Target box's name for a mob named over its head: '" + targetName + "'");
			// a name with nothing to read (an NPC's hidden one) is looked past
			String readable = context.computeOnClient(mc -> TestHooks.targetReadable());
			if (!readable.equals("1100000")) throw new AssertionError("Names the Target box reads: " + readable);
			// or by a text display over it (two lines: the first is the name)
			world.getServer().runCommand("kill @e[type=armor_stand]");
			world.getServer().runCommand("execute as @e[type=husk,limit=1] at @s run summon text_display ~ ~2.4 ~ {text:" + nbtText("27.98 ❤ | Rozbitek poz. 3\\nBoss") + "}");
			context.waitTicks(10);
			String displayName = context.computeOnClient(mc -> TestHooks.shownTargetName());
			if (!displayName.equals("Rozbitek poz. 3")) throw new AssertionError("The Target box's name from a text display: '" + displayName + "'");
			world.getServer().runCommand("kill @e[type=text_display]");
			// held: no button held, no clicks
			context.runOnClient(mc -> TestHooks.autoClicker(true, "hold", true, true, false, 10));
			context.waitTicks(20);
			String idle = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!idle.equals("0/0")) throw new AssertionError("Clicked with no button held: " + idle);
			// both buttons held: the husk is hit and the right button clicks
			context.runOnClient(mc -> TestHooks.holdButtons(true, true));
			context.waitTicks(40);
			// the CPS shown counts its clicks too
			String shown = context.computeOnClient(mc -> TestHooks.shownCps());
			if (Integer.parseInt(shown.split("/")[0]) < 5 || Integer.parseInt(shown.split("/")[1]) < 5) throw new AssertionError("The CPS shown misses its clicks: " + shown);
			context.runOnClient(mc -> TestHooks.holdButtons(false, false));
			String clicks = context.computeOnClient(mc -> TestHooks.autoClicks());
			float hit = context.computeOnClient(mc -> TestHooks.nearestHealth());
			String[] lr = clicks.split("/");
			if (Integer.parseInt(lr[0]) < 10 || Integer.parseInt(lr[1]) < 10) throw new AssertionError("Too few clicks in 2 s: " + clicks);
			if (hit >= start) throw new AssertionError("The husk was not hit: " + start + " -> " + hit);

			// the toggle mode: nothing until its key, then clicks with no button held
			context.runOnClient(mc -> TestHooks.autoClicker(true, "toggle", true, false, false, 10));
			context.waitTicks(20);
			String unarmed = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!unarmed.equals("0/0")) throw new AssertionError("Clicked before its key: " + unarmed);
			context.runOnClient(mc -> TestHooks.armAutoClicker());
			context.waitTicks(20);
			String armed = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (armed.startsWith("0/")) throw new AssertionError("Did not click once its key was pressed: " + armed);

			// jumps too: on the ground it goes up
			int jumpsBefore = context.computeOnClient(mc -> TestHooks.autoClickJumps(4));
			context.waitTicks(30);
			int jumped = context.computeOnClient(mc -> TestHooks.autoClickJumps(0)) - jumpsBefore;
			if (jumped < 3) throw new AssertionError("Too few jumps in 1.5 s: " + jumped);
			// the own shield up: no hits
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "toggle", true, false, false, 10); TestHooks.armAutoClicker(); TestHooks.raiseShield(true); });
			context.waitTicks(15);
			context.runOnClient(mc -> TestHooks.autoClicker(true, "toggle", true, false, false, 10));
			context.runOnClient(mc -> TestHooks.armAutoClicker());
			context.waitTicks(20);
			String shielded = context.computeOnClient(mc -> TestHooks.autoClicks());
			context.runOnClient(mc -> TestHooks.raiseShield(false));
			if (!shielded.startsWith("0/")) throw new AssertionError("Hit with the shield up: " + shielded);
			// full hits at a mob: with a sword (charged in 0.6 s) far fewer than 10 a second, but some
			world.getServer().runCommand("item replace entity @a weapon.mainhand with iron_sword");
			context.waitTicks(5);
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "toggle", true, false, false, 10); TestHooks.autoClickCooldown(true);
				TestHooks.lookSouth(); TestHooks.armAutoClicker(); });
			context.waitTicks(40);
			int full = Integer.parseInt(context.computeOnClient(mc -> TestHooks.autoClicks()).split("/")[0]);
			world.getServer().runCommand("item replace entity @a weapon.mainhand with air");
			if (full < 2 || full > 5) throw new AssertionError("Full hits in 2 s: " + full);
			// the attack indicator under our crosshair (the game draws its own under its own)
			String indicator = context.computeOnClient(mc -> TestHooks.attackIndicator());
			if (!indicator.equals("true/false/1")) throw new AssertionError("The attack indicator (ours/the game's crosshair/its options): " + indicator);
			// in a SkyUp dungeon it rests, out of it it goes on (armed as it was)
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "toggle", true, false, false, 10); TestHooks.armAutoClicker();
				dev.slash3rss.slashclient.hud.skyup.DungeonMap.inDungeonForTest(true); });
			context.waitTicks(20);
			String inDungeon = context.computeOnClient(mc -> TestHooks.autoClicks());
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.DungeonMap.inDungeonForTest(false));
			context.waitTicks(20);
			String outOfDungeon = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!inDungeon.equals("0/0") || outOfDungeon.startsWith("0/")) throw new AssertionError("Dungeon rest: in " + inDungeon + ", out " + outOfDungeon);
			// left only with a mob under the crosshair: looking away, no clicks
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "toggle", true, false, true, 10); TestHooks.armAutoClicker(); mc.player.setYRot(180f); mc.player.setYHeadRot(180f); });
			context.waitTicks(20);
			String away = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!away.equals("0/0")) throw new AssertionError("Clicked with no mob under the crosshair: " + away);
			context.runOnClient(mc -> TestHooks.lookSouth());
			context.waitTicks(20);
			String onMob = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (onMob.startsWith("0/")) throw new AssertionError("Did not click the mob under the crosshair: " + onMob);

			// in a chest's window it clicks the slot under the mouse: armed on its own, held while the button is
			world.getServer().runCommand("execute at @a run setblock ~ ~ ~-2 chest");
			world.getServer().runCommand("execute at @a run item replace block ~ ~ ~-2 container.0 with stone 1");
			context.waitTicks(5);
			context.runOnClient(mc -> {
				net.minecraft.core.BlockPos chest = mc.player.blockPosition().north(2);
				mc.gameMode.useItemOn(mc.player, net.minecraft.world.InteractionHand.MAIN_HAND,
					new net.minecraft.world.phys.BlockHitResult(net.minecraft.world.phys.Vec3.atCenterOf(chest), net.minecraft.core.Direction.SOUTH, chest, false));
			});
			context.waitTicks(10);
			if (!context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof net.minecraft.client.gui.screens.inventory.ContainerScreen))
				throw new AssertionError("The chest did not open");
			double[] slot0 = context.computeOnClient(mc -> TestHooks.slotOnWindow(0));
			context.getInput().setCursorPos(slot0[0], slot0[1]);
			context.waitTicks(3);
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "toggle", true, false, false, 10); TestHooks.armAutoClicker(); });
			context.waitTicks(20);
			String inChest = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (Integer.parseInt(inChest.split("/")[0]) < 5) throw new AssertionError("Too few clicks on the chest's slot in 1 s: " + inChest);
			context.runOnClient(mc -> TestHooks.autoClicker(true, "hold", true, false, false, 10));
			context.waitTicks(10);
			String chestIdle = context.computeOnClient(mc -> TestHooks.autoClicks());
			// a plain click held: the item is taken in one click (the autoclicker does not put it straight back)
			world.getServer().runCommand("execute at @a run item replace block ~ ~ ~-2 container.0 with diamond 5");
			context.waitTicks(5);
			context.getInput().pressMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(3);
			String plain = context.computeOnClient(mc -> TestHooks.autoClicks() + " " + mc.player.containerMenu.getCarried().getCount());
			if (!plain.equals("0/0 5")) throw new AssertionError("A plain click in the chest with the autoclicker held (clicks, carried): " + plain);
			// and put back with a second plain click
			context.getInput().pressMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(3);
			context.getInput().holdMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(20);
			context.getInput().releaseMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			String chestHeld = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!chestIdle.equals("0/0") || Integer.parseInt(chestHeld.split("/")[0]) < 5)
				throw new AssertionError("Held in the chest (no button, button held): " + chestIdle + ", " + chestHeld);
			// held in the chest, the window closed before letting go (as a shop's window closes on a click), the button let
			// go in the game: in the chest opened again it does not click on its own
			context.getInput().holdMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(3);
			context.setScreen(() -> null);
			context.waitTicks(3);
			context.getInput().releaseMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(10);
			context.runOnClient(mc -> {
				net.minecraft.core.BlockPos chest = mc.player.blockPosition().north(2);
				mc.gameMode.useItemOn(mc.player, net.minecraft.world.InteractionHand.MAIN_HAND,
					new net.minecraft.world.phys.BlockHitResult(net.minecraft.world.phys.Vec3.atCenterOf(chest), net.minecraft.core.Direction.SOUTH, chest, false));
			});
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.autoClicker(true, "hold", true, false, false, 10));
			context.waitTicks(20);
			String reopened = context.computeOnClient(mc -> TestHooks.autoClicks() + (dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof net.minecraft.client.gui.screens.inventory.ContainerScreen ? "" : " (closed)"));
			if (!reopened.equals("0/0")) throw new AssertionError("Clicked in a chest opened again with no button held: " + reopened);
			// the right button clicking while held, the chest closed with Esc while the game still thinks the button is
			// down (it opened the chest and was let go over the window): the chest is not opened straight back
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "hold", false, true, false, 10); TestHooks.holdButtons(false, true); });
			context.waitTicks(3);
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_ESCAPE);
			context.waitTicks(20);
			String afterEsc = context.computeOnClient(mc -> TestHooks.autoClicks() + (dev.slash3rss.slashclient.hud.Compat.screen(mc) == null ? "" : " (open again)"));
			context.runOnClient(mc -> TestHooks.holdButtons(false, false));
			context.waitTicks(2);
			if (!afterEsc.equals("0/0")) throw new AssertionError("Clicked after the chest closed with Esc: " + afterEsc);
			// the player's own inventory: never
			context.setScreen(() -> new net.minecraft.client.gui.screens.inventory.InventoryScreen(net.minecraft.client.Minecraft.getInstance().player));
			context.runOnClient(mc -> { TestHooks.autoClicker(true, "toggle", true, false, false, 10); TestHooks.armAutoClicker(); });
			context.waitTicks(20);
			String inInventory = context.computeOnClient(mc -> TestHooks.autoClicks());
			context.setScreen(() -> null);
			if (!inInventory.equals("0/0")) throw new AssertionError("Clicked in the own inventory: " + inInventory);

			// switched off: nothing
			context.runOnClient(mc -> { TestHooks.autoClicker(false, "toggle", true, true, false, 10); TestHooks.armAutoClicker(); });
			context.waitTicks(20);
			String off = context.computeOnClient(mc -> TestHooks.autoClicks());
			if (!off.equals("0/0")) throw new AssertionError("Clicked while switched off: " + off);

			// holding the right button by its key, let go with the same key over a window (the inventory)
			context.runOnClient(mc -> TestHooks.bindHoldUse("key.keyboard.h"));
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_H);
			context.waitTicks(3);
			if (!context.computeOnClient(mc -> TestHooks.holdingUse())) throw new AssertionError("The key did not start holding");
			context.setScreen(() -> new net.minecraft.client.gui.screens.inventory.InventoryScreen(net.minecraft.client.Minecraft.getInstance().player));
			context.waitTicks(3);
			context.getInput().pressKey(com.mojang.blaze3d.platform.InputConstants.KEY_H);
			context.waitTicks(3);
			if (context.computeOnClient(mc -> TestHooks.holdingUse())) throw new AssertionError("The key did not let go over the inventory");
			if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) == null)) throw new AssertionError("The key reached the window (closed it)");
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.bindHoldUse(null));
			// its settings: the mode, each button's steady clicks a second, what the left one clicks at
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("autoClicker"));
			context.waitTicks(5);
			context.takeScreenshot("autoclicker-settings");
			// the rest of the card, scrolled down
			context.getInput().setCursorPos(550, 330);
			for (int page = 2; page <= 4; page++) {
				for (int i = 0; i < 4; i++) context.getInput().scroll(-1);
				context.waitTicks(5);
				context.takeScreenshot("autoclicker-settings-" + page);
			}
			context.setScreen(() -> null);
		}
	}
}
