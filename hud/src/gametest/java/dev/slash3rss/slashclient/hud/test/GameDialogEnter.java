package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.testing.DeathInfoTestHooks;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Text fields: a server's login window takes Enter in its password field as a press of "Zaloguj
 * się" (the first button, not the second), and a chat tab's long hint scrolls in its field.
 */
public class GameDialogEnter implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> TestHooks.endOnVanillaMenu());
		// sliding text bounces: a pause at the start, along, a pause at the end, and back the same way
		String bounce = context.computeOnClient(mc -> {
			StringBuilder s = new StringBuilder();
			for (long ms : new long[] { 0, 1200, 1800, 2900, 3400 }) s.append(dev.slash3rss.slashclient.hud.ui.Ui.bounce(ms, 100, 700, 1000)).append(' ');
			return s.toString().strip();
		});
		if (!bounce.equals("0 50 100 50 0")) throw new AssertionError("Sliding text: " + bounce);
		// a chat tab with nothing in it yet: its hint is longer than the field and scrolls
		context.runOnClient(mc -> {
			SlashHud.config.chatTabs.clear();
			SlashHud.config.chatTabs.add(new HudConfig.ChatTab("SPY", false));
		});
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("chatTabs"));
		context.waitTicks(10);
		context.takeScreenshot("hint-scroll-start");
		context.waitTicks(60);
		context.takeScreenshot("hint-scroll-later");
		context.setScreen(() -> null);
		//#if MC >= 1.21.6
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("dialog show @a {type:\"minecraft:multi_action\",title:\"SkyUP » Logowanie\",inputs:[{type:\"minecraft:text\",key:\"pw\",label:\"Hasło\"}],"
				+ "actions:[{label:\"Zaloguj się\",action:{type:\"copy_to_clipboard\",value:\"first\"}},{label:\"Nie pamiętasz hasła?\",action:{type:\"copy_to_clipboard\",value:\"second\"}}]}");
			context.waitTicks(20);
			check(context.computeOnClient(mc -> Compat.screen(mc) instanceof net.minecraft.client.gui.screens.dialog.DialogScreen<?>), "the login window did not open");
			context.runOnClient(mc -> mc.keyboardHandler.setClipboard("none"));
			// into the field, a password, Enter
			double[] field = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.ui.DialogEnter.firstFieldPoint(Compat.screen(mc)));
			check(field != null, "no field to type in");
			context.getInput().setCursorPos(field[0], field[1]);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(2);
			context.getInput().typeChars("haslo123");
			context.waitTicks(3);
			context.takeScreenshot("dialog-login");
			context.getInput().pressKey(InputConstants.KEY_RETURN);
			context.waitTicks(10);
			String copied = context.computeOnClient(mc -> DeathInfoTestHooks.clipboard());
			check(copied.equals("first"), "Enter pressed: " + copied);
			check(context.computeOnClient(mc -> !(Compat.screen(mc) instanceof net.minecraft.client.gui.screens.dialog.DialogScreen<?>)), "the window stayed open");
		}
		//#endif
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError("Text fields, " + what);
	}
}
