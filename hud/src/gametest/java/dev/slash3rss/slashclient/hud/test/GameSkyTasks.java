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
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 26.3
		// the test ends on the game's own title screen
		context.runOnClient(mc -> TestHooks.vanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("gamemode survival @a");
			world.getServer().runCommand("give @a iron_ingot 5");
			// a furnace with Fortune I (SkyUp's "Piec przynajmniej Szczęście I") and one without
			world.getServer().runCommand("give @a furnace[enchantments={\"minecraft:fortune\":1}]");
			world.getServer().runCommand("give @a furnace");
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false, true));
			context.waitTicks(15);
			// read from the GUI: twelve tasks (the sign is none), their sections and numbers
			String tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			String[] lines = tasks.strip().split("\n");
			check(lines.length == 12, "twelve tasks", tasks);
			check(tasks.contains("Nowicjusz|Podstawowy kamieniołom: Zbierz[") && tasks.contains(" 28/128] rewards=3"), "the quarry", tasks);
			check(tasks.contains("Nowicjusz|A co tutaj tak ciemno?: Stwórz[") && tasks.contains(" 0/64] Postaw["), "the torches", tasks);
			check(tasks.contains("Nowicjusz|Huta: Posiadaj w ekwipunku(inv)[") && tasks.contains(" -1/16] rewards=3"), "the furnace", tasks);
			check(tasks.contains("Nowicjusz|Dobra praca się opłaca: Posiadaj poziom dowolnej pracy[Posiadaj poziom dowolnej pracy -1/5 poz.]"), "the job level", tasks);
			check(tasks.contains("Stacja inkubacja: Posiadaj w ekwipunku(inv)[Kaktus -1/16] Posiadaj na wyspie co najmniej[kaktus -1/1 poz.] rewards=2 takes"), "the cactus", tasks);
			// the same items in a chest of another name are no challenges: Huta missing there leaves it known
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.skyOtherChest());
			context.waitTicks(15);
			String other = context.computeOnClient(mc -> TestHooks.skyTasks());
			check(other.equals(tasks), "another chest left alone", other);
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false, false));
			context.waitTicks(15);
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
			check(tracked.equals("Nowicjusz|Podstawowy kamieniołom,Nowicjusz|Huta"), "tracked", tracked);
			// the menu: each category's tasks left, and the daily task (a task like the others)
			context.runOnClient(mc -> TestHooks.skyMenuScreen(5));
			context.waitTicks(10);
			String categories = context.computeOnClient(mc -> TestHooks.skyCategories());
			check(categories.equals("{Nowicjusz=5, Wirtuoz=16}"), "categories", categories);
			tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			check(tasks.contains("Wyzwania|Zadanie codzienne: Zbierz[Buraki 0/3888]") && tasks.strip().split("\n").length == 13, "daily task", tasks);
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false, false));
			// the GUI with the gold marks and the hint for the task under the mouse
			context.getInput().setCursorPos(huta[0], huta[1]);
			context.waitTicks(5);
			context.takeScreenshot("skytasks-toggle");
			// on the HUD: the category, the two tasks, the iron counted from the inventory
			context.setScreen(() -> null);
			context.runOnClient(mc -> TestHooks.skyTasksOptions(true, false));
			context.waitTicks(10);
			String rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(rows.contains("Nowicjusz | ") && rows.contains("Podstawowy kamieniołom") && rows.contains(" | 28/128") && rows.contains("Huta") && rows.contains(" | 5/16"), "HUD rows", rows);
			context.takeScreenshot("skytasks-hud");
			// narrow: rows too long slide along (two moments apart), instead of ending with "…"
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.skyTasksWidth = 120);
			context.waitTicks(30);
			context.takeScreenshot("skytasks-scroll-1");
			context.waitTicks(30);
			context.takeScreenshot("skytasks-scroll-2");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.skyTasksWidth = 220);
			// the progress is on disk, in the playing account's own file, and comes back from it
			String reload = context.computeOnClient(mc -> TestHooks.skyTasksReload());
			String[] r = reload.split(" ");
			if (r[0].equals("0") || !r[0].equals(r[1]) || !r[2].startsWith("zadania-") || r[2].length() != "zadania-".length() + 32 + ".json".length()) throw new AssertionError("Saved progress: " + reload);
			// after joining again, before the menu is opened: the last known numbers, marked "~"
			String stale = context.computeOnClient(mc -> TestHooks.skyTasksStaleRows());
			if (!stale.contains("| ~") || stale.contains("Not loaded") || stale.contains("Nie wczytano")) throw new AssertionError("Last known progress: " + stale);
			context.takeScreenshot("skytasks-last-known");
			// what the player does counts on top of the server's numbers until the GUI is open again:
			// three stone mined, twelve torches crafted (a shift-click), two chests close by
			world.getServer().runCommand("execute at @p run setblock ~2 ~ ~ chest");
			world.getServer().runCommand("execute at @p run setblock ~-2 ~ ~ chest");
			context.runOnClient(mc -> TestHooks.skyEvents());
			// SkyUp's sidebar: the island's level, and one job's
			String[][] sidebar = { { "a", "» Wyspa", "4" }, { "b", "Poziom: 20", "3" }, { "c", "» Prace", "2" }, { "d", "Rybak: 7 poz.", "1" } };
			world.getServer().runCommand("scoreboard objectives add sky dummy \"SkyUP.pl\"");
			world.getServer().runCommand("scoreboard objectives setdisplay sidebar sky");
			for (String[] line : sidebar) {
				world.getServer().runCommand("scoreboard players set " + line[0] + " sky " + line[2]);
				world.getServer().runCommand("scoreboard players display name " + line[0] + " sky \"" + line[1] + "\"");
			}
			context.waitTicks(30);
			String progress = context.computeOnClient(mc -> TestHooks.skyProgress());
			check(progress.contains(" ~31/128") && progress.contains("A co tutaj tak ciemno?: ") && progress.contains(" ~12/64") && progress.contains(" ~2/64") && progress.contains("Składzik: ") && progress.contains(" ~2/8")
				&& progress.contains("Ciasno, ale własno: Posiadaj poziom wyspy 20/20") && progress.contains("Dobra praca się opłaca: Posiadaj poziom dowolnej pracy ~7/5")
				&& progress.contains("Moczykij: Dowolna ryba ~1/24") && progress.contains("Rybak: Wyłów ~8090/200000") && progress.contains("Mamut morski: Wyłów conajmniej ogromne ~1/45")
				&& progress.contains("Piecoznawstwo: Piec przynajmniej Szczęście I 1/1"), "counted", progress);
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(rows.contains(" | ~31/128"), "HUD estimate", rows);
			// the fish counter: the catch from the chat, its weight, size, species and quality
			String fish = context.computeOnClient(mc -> TestHooks.skyFish());
			check(fish.startsWith("session 1/8090g/") && fish.contains("lifetime 1/8090g/") && fish.contains("sizes {ogromny=1}")
				&& fish.contains("species {Halibut atlantycki=1}") && fish.contains("qualities {niezjadliwy=1}"), "fish counter", fish);
			// on another server neither shows
			String elsewhere = context.computeOnClient(mc -> TestHooks.skyElsewhere(true));
			check(elsewhere.equals("tasks false fish false"), "off SkyUp", elsewhere);
			elsewhere = context.computeOnClient(mc -> TestHooks.skyElsewhere(false));
			check(elsewhere.equals("tasks true fish true"), "back on SkyUp", elsewhere);
			// the jobs' levels from their window and a job's boss bar; a needed task done turns its line green
			String jobs = context.computeOnClient(mc -> TestHooks.skyJobsAndNeeds());
			check(jobs.equals("7 9 false | bar 10 | needs 'Zmory podziemi' false -> true"), "jobs and needed tasks", jobs);
			context.takeScreenshot("skytasks-estimate");
			// ready to hand in: the job's and the island's level (the sidebar) and the furnace with Fortune
			// (the inventory) lit green in the GUI
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false, false));
			context.waitTicks(15);
			String lit = context.computeOnClient(mc -> TestHooks.skyHighlighted());
			check(lit.equals("4,7,11"), "ready slots lit", lit);
			String done = context.computeOnClient(mc -> TestHooks.skyHandedIn());
			check(done.equals("12"), "handed-in slot marked apart", done);
			context.getInput().setCursorPos(2, 2);
			context.waitTicks(3);
			context.takeScreenshot("skyready-colors");
			// Składzik, Ciasno, ale własno and Piecoznawstwo tracked too
			for (int slot : new int[] { 6, 7, 11 }) {
				double[] at = context.computeOnClient(mc -> TestHooks.slotPoint(slot));
				context.getInput().setCursorPos(at[0], at[1]);
				context.waitTicks(3);
				context.getInput().pressKey(options -> TestHooks.skyTrackKey());
				context.waitTicks(3);
			}
			context.waitTicks(5);
			context.takeScreenshot("skyready-gui");
			// on the HUD the ready ones first, on a green band with "Hand in!"
			context.setScreen(() -> null);
			context.waitTicks(5);
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			int ready = rows.indexOf("✔ Ciasno, ale własno | Hand in! [lit]"), furnace = rows.indexOf("✔ Piecoznawstwo | Hand in! [lit]"), notYet = rows.indexOf("Podstawowy kamieniołom");
			// at the very top, above the categories, and without their requirements
			check(ready == 0 && furnace > ready && notYet > furnace && !rows.contains("Składzik | Hand in!") && rows.contains("Składzik | ")
				&& !rows.contains("Posiadaj poziom wyspy") && !rows.contains("Piec przynajmniej"), "ready tasks marked and on top", rows);
			context.takeScreenshot("skyready-hud");
			// the compact mode: the badge only
			context.runOnClient(mc -> TestHooks.skyTasksOptions(true, true));
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(rows.contains("✔ Ciasno, ale własno | Hand in!\n") && !rows.contains("[lit]"), "compact ready", rows);
			context.waitTicks(3);
			context.takeScreenshot("skyready-hud-compact");
			context.runOnClient(mc -> TestHooks.skyTasksOptions(true, false));
			// SkyUp's line after handing Składzik in: gone from the list, the tracking and the HUD at once
			context.runOnClient(mc -> TestHooks.skyCompletedChat("Składzik"));
			context.waitTicks(3);
			tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			tracked = context.computeOnClient(mc -> TestHooks.skyTracked());
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			categories = context.computeOnClient(mc -> TestHooks.skyCategories());
			check(!tasks.contains("|Składzik:") && !tracked.contains("Składzik") && !rows.contains("Składzik") && tracked.contains("Nowicjusz|Ciasno, ale własno")
				&& categories.equals("{Nowicjusz=4, Wirtuoz=16}"), "handed in from the chat", tasks + tracked + "\n" + rows + categories);
			context.takeScreenshot("skyready-handed-in");
			// another chest's line of the same words is no completion
			context.runOnClient(mc -> TestHooks.skyChat("Ukończono zadanie Huta!"));
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.skyTasks()).contains("|Huta:"), "not SkyUp's line", "");
			check(context.computeOnClient(mc -> TestHooks.skyCompletedIsNoTask()), "a handed-in task in the GUI is no task", "");
			// the dungeon's level: the highest seen on its boss bar
			String dungeon = context.computeOnClient(mc -> TestHooks.skyDungeonLevel());
			check(dungeon.endsWith(" 7/10") && !dungeon.startsWith("7 "), "dungeon level from the boss bar (the highest seen)", dungeon);
			String anyBlock = context.computeOnClient(mc -> TestHooks.skyAnyBlock());
			check(anyBlock.equals("true true false true"), "\"Dowolny blok\" is any block", anyBlock);
			String hint = context.computeOnClient(mc -> TestHooks.skyCommandHint());
			check(hint.equals("Stwórz[Stojak na zbroję 3/12;] Stwórz[Stojak na zbroję 3/12;]"), "\"(/recipe)\" in the task's text left out", hint);
			// the two ready ones untracked again (the rest of the test tracks the quarry and Huta only)
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false, false));
			context.waitTicks(15);
			for (int slot : new int[] { 7, 11 }) {
				double[] at = context.computeOnClient(mc -> TestHooks.slotPoint(slot));
				context.getInput().setCursorPos(at[0], at[1]);
				context.waitTicks(3);
				context.getInput().pressKey(options -> TestHooks.skyTrackKey());
				context.waitTicks(3);
			}
			tracked = context.computeOnClient(mc -> TestHooks.skyTracked());
			check(tracked.equals("Nowicjusz|Podstawowy kamieniołom,Nowicjusz|Huta"), "tracked again", tracked);
			context.setScreen(() -> null);
			// the furnace completed: the GUI without it, and the HUD without it
			context.runOnClient(mc -> TestHooks.skyTasksScreen(true, false));
			context.waitTicks(15);
			context.setScreen(() -> null);
			context.waitTicks(5);
			tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			check(!tasks.contains("|Huta:") && tasks.strip().split("\n").length == 12, "completed task gone", tasks);
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(!rows.contains("Huta") && rows.contains("Podstawowy kamieniołom") && rows.contains(" | 28/128"), "HUD after completing (the server's number again)", rows);
			// whole categories tracked from the menu: Wirtuoz (never opened) with the key, Nowicjusz with the middle button
			context.runOnClient(mc -> TestHooks.skyMenuScreen(5));
			context.waitTicks(10);
			// a generator's window: the points spent (the time at 3, coal at 4 of which 1 is free, iron's free 1)
			int spentPoints = context.computeOnClient(mc -> TestHooks.skyGeneratorSpent(3, 4));
			check(spentPoints == 6, "the generator's spent points", String.valueOf(spentPoints));
			// an incubator's window: cocoa in its cost is the sugar cane one, at level 5 (its speed-up); no cactus one seen
			String incubator = context.computeOnClient(mc -> TestHooks.skyIncubator());
			check(incubator.equals("5 -1 dynia wodorosty null"), "the incubator's level", incubator);
			// shamanism: the witch's recipe under the task (nothing in hand: all missing), then a summon counted
			String shaman = context.computeOnClient(mc -> TestHooks.skyShaman());
			check(shaman.contains("✖ Redstone Torch") && shaman.contains("✖ Glass Bottle") && shaman.contains("Rotten Flesh 0/20") && shaman.endsWith("count 1"), "shamanism", shaman);
			// the daily task: nothing to remind of until it is tracked, then what is left of it
			String daily = context.computeOnClient(mc -> TestHooks.skyDaily());
			check(daily.equals("null | Still to do: Buraki 0/3888"), "the daily task's reminder (untracked | tracked)", daily);
			String sounds = context.computeOnClient(mc -> TestHooks.skyDailySound("default") + "|" + TestHooks.skyDailySound("orb") + "|" + TestHooks.skyDailySound("none"));
			check(sounds.equals("|orb|none"), "the daily reminder's sound", sounds);
			double[] wirtuoz = context.computeOnClient(mc -> TestHooks.slotPoint(14));
			double[] nowicjusz = context.computeOnClient(mc -> TestHooks.slotPoint(12));
			context.getInput().setCursorPos(wirtuoz[0], wirtuoz[1]);
			context.waitTicks(3);
			context.getInput().pressKey(options -> TestHooks.skyTrackKey());
			context.waitTicks(3);
			String state = context.computeOnClient(mc -> TestHooks.skyCategoryState());
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(state.equals("Wirtuoz visible true") && rows.startsWith("Wirtuoz | 16 left\nopen the category to load its tasks | \n"), "a category never opened, at once", state + "\n" + rows);
			context.getInput().setCursorPos(nowicjusz[0], nowicjusz[1]);
			context.waitTicks(3);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_MIDDLE);
			context.waitTicks(3);
			state = context.computeOnClient(mc -> TestHooks.skyCategoryState());
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			// the whole of Nowicjusz on the HUD under its row, Od czego zacząć? too (never tracked on its own)
			// the ready tasks above the categories
			check(state.equals("Nowicjusz,Wirtuoz visible true") && rows.contains("\nNowicjusz | 5 left · ") && rows.startsWith("✔ ") && rows.contains("Od czego zacząć?") && rows.contains("Wirtuoz | 16 left"), "two categories", state + "\n" + rows);
			// the daily task, tracked, above the categories
			String top = context.computeOnClient(mc -> TestHooks.skyDailyOnTop());
			// under the ready ones, above the categories
			int dailyAt = top.indexOf("Zadanie codzienne"), categoryAt = top.indexOf("Nowicjusz |"), readyAt = top.indexOf("✔ ");
			check(dailyAt > readyAt && readyAt == 0 && dailyAt < categoryAt, "the daily task on top", top);
			context.getInput().setCursorPos(wirtuoz[0], wirtuoz[1]);
			context.waitTicks(5);
			context.takeScreenshot("skytasks-category-menu");
			context.setScreen(() -> null);
			context.waitTicks(5);
			context.takeScreenshot("skytasks-category-hud");
			// Nowicjusz unticked: its row and the tasks it brought gone at once, Wirtuoz stays
			context.runOnClient(mc -> TestHooks.skyMenuScreen(5));
			context.waitTicks(10);
			context.getInput().setCursorPos(nowicjusz[0], nowicjusz[1]);
			context.waitTicks(3);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_MIDDLE);
			context.waitTicks(3);
			state = context.computeOnClient(mc -> TestHooks.skyCategoryState());
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(state.equals("Wirtuoz visible true") && !rows.contains("Nowicjusz |") && !rows.contains("Od czego zacząć?") && rows.contains("Podstawowy kamieniołom"), "Nowicjusz unticked", state + "\n" + rows);
			context.setScreen(() -> null);
			context.waitTicks(5);
			context.takeScreenshot("skytasks-category-untracked");
			// Wirtuoz unticked too, and Nowicjusz opened again: no category row comes back
			context.runOnClient(mc -> TestHooks.skyMenuScreen(5));
			context.waitTicks(10);
			context.getInput().setCursorPos(wirtuoz[0], wirtuoz[1]);
			context.waitTicks(3);
			context.getInput().pressKey(options -> TestHooks.skyTrackKey());
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.skyTasksScreen(true, false));
			context.waitTicks(15);
			// and the quarry, the last task tracked: the module is gone
			context.getInput().setCursorPos(quarry[0], quarry[1]);
			context.waitTicks(3);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_MIDDLE);
			context.waitTicks(3);
			context.setScreen(() -> null);
			context.waitTicks(5);
			state = context.computeOnClient(mc -> TestHooks.skyCategoryState());
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(state.equals(" visible false") && rows.isEmpty(), "nothing tracked", state + "\n" + rows);
			// the hand-in line with another arrow, SkyUp's glyph and a decorated name: still found
			check(context.computeOnClient(mc -> TestHooks.skyTasks()).contains("|Podstawowy kamieniołom:"), "the quarry still listed", "");
			context.runOnClient(mc -> TestHooks.skyChat(" Wyzwania >> Ukończono zadanie » Podstawowy kamieniołom «!"));
			context.waitTicks(3);
			check(!context.computeOnClient(mc -> TestHooks.skyTasks()).contains("|Podstawowy kamieniołom:"), "handed in, other arrows", context.computeOnClient(mc -> TestHooks.skyTasks()));
			// Nowicjusz tracked, then the menu says it is done ("Kategoria ukończona!"): no longer tracked, its tasks gone
			context.runOnClient(mc -> TestHooks.skyMenuScreen(5));
			context.waitTicks(10);
			context.getInput().setCursorPos(nowicjusz[0], nowicjusz[1]);
			context.waitTicks(3);
			context.getInput().pressMouse(InputConstants.MOUSE_BUTTON_MIDDLE);
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.skyCategoryState()).startsWith("Nowicjusz"), "Nowicjusz tracked again", "");
			context.runOnClient(mc -> TestHooks.skyMenuScreen(0));
			context.waitTicks(10);
			context.setScreen(() -> null);
			context.waitTicks(3);
			state = context.computeOnClient(mc -> TestHooks.skyCategoryState());
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(!state.startsWith("Nowicjusz") && !rows.contains("Nowicjusz") && !context.computeOnClient(mc -> TestHooks.skyTasks()).contains("Nowicjusz|"), "a category done", state + "\n" + rows);
			context.runOnClient(mc -> TestHooks.skyTasksOptions(false, false));
		}
		//#endif
	}

	private static void check(boolean ok, String what, String got) {
		if (!ok) throw new AssertionError("SkyUp tasks, " + what + ":\n" + got);
	}
}
