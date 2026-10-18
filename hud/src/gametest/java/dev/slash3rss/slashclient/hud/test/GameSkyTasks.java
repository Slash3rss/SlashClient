package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
//#if MC >= 26.3
import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
//#endif

/**
 * SkyUp's island tasks (26.3 only): a tasks GUI as in the owner's screenshots, read by the tracker;
 * two tasks tracked from it (the key and the middle button), shown on the HUD with the iron counted
 * from the inventory; then the GUI again without one of them (completed): it leaves the list.
 */
public class GameSkyTasks implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		//#if MC >= 26.3
		// the test ends on the game's own title screen
		context.runOnClient(mc -> TestHooks.vanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("give @a iron_ingot 5");
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false));
			context.waitTicks(15);
			// read from the GUI: six tasks (the sign is none), their sections and numbers
			String tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			String[] lines = tasks.strip().split("\n");
			check(lines.length == 6, "six tasks", tasks);
			check(tasks.contains("NOWICJUSZ|Podstawowy kamieniołom: Zbierz[Kamień 28/128] rewards=3"), "the quarry", tasks);
			check(tasks.contains("NOWICJUSZ|A co tutaj tak ciemno?: Stwórz[Pochodnia 0/64] Postaw[Pochodnia 0/64]"), "the torches", tasks);
			check(tasks.contains("NOWICJUSZ|Huta: Posiadaj w ekwipunku(inv)[") && tasks.contains(" -1/16] rewards=3"), "the furnace", tasks);
			check(tasks.contains("NOWICJUSZ|Dobra praca się opłaca: Posiadaj poziom dowolnej pracy[Posiadaj poziom dowolnej pracy -1/5 poz.]"), "the job level", tasks);
			check(tasks.contains("Stacja inkubacja: Posiadaj w ekwipunku(inv)[Kaktus -1/16] Posiadaj na wyspie co najmniej[kaktus -1/1 poz.] rewards=2 takes"), "the cactus", tasks);
			// the furnace tracked with the key, the quarry with the middle button, the cursor on each
			double[] huta = context.computeOnClient(mc -> TestHooks.slotPoint(3));
			context.getInput().setCursorPos(huta[0], huta[1]);
			context.waitTicks(3);
			context.getInput().pressKey(options -> TestHooks.skyTrackKey());
			context.waitTicks(3);
			double[] quarry = context.computeOnClient(mc -> TestHooks.slotPoint(1));
			context.getInput().setCursorPos(quarry[0], quarry[1]);
			context.waitTicks(3);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_MIDDLE);
			context.waitTicks(3);
			String tracked = context.computeOnClient(mc -> TestHooks.skyTracked());
			check(tracked.equals("NOWICJUSZ|Podstawowy kamieniołom,NOWICJUSZ|Huta"), "tracked", tracked);
			// the GUI with the gold marks and the hint for the task under the mouse
			context.getInput().setCursorPos(huta[0], huta[1]);
			context.waitTicks(5);
			context.takeScreenshot("skytasks-toggle");
			// on the HUD: the category, the two tasks, the iron counted from the inventory
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.skyTasksOptions(true, false));
			context.waitTicks(10);
			String rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(rows.contains("NOWICJUSZ | ") && rows.contains("Podstawowy kamieniołom") && rows.contains("Kamień | 28/128") && rows.contains("Huta") && rows.contains(" | 5/16"), "HUD rows", rows);
			context.takeScreenshot("skytasks-hud");
			// the furnace completed: the GUI without it, and the HUD without it
			context.runOnClient(mc -> TestHooks.skyTasksScreen(true));
			context.waitTicks(15);
			context.setScreen(() -> null);
			context.waitTicks(5);
			tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			check(!tasks.contains("|Huta:") && tasks.strip().split("\n").length == 5, "completed task gone", tasks);
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(!rows.contains("Huta") && rows.contains("Podstawowy kamieniołom"), "HUD after completing", rows);
			context.runOnClient(mc -> TestHooks.skyTasksOptions(false, false));
		}
		//#endif
	}

	private static void check(boolean ok, String what, String got) {
		if (!ok) throw new AssertionError("SkyUp tasks, " + what + ":\n" + got);
	}
}
