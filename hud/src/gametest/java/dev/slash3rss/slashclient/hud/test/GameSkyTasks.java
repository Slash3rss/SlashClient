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
		// the daily task tracked by hand like the others (its switch is checked on its own, see skyDaily)
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.skyTasksAutoDaily = false);
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
			// "Stój obok" counts creatures too: an iron golem nearby
			world.getServer().runCommand("execute at @p run summon iron_golem ~3 ~ ~3 {NoAI:1b}");
			context.waitTicks(40);
			long golems = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCounters.aroundForTest("Żelazny golem"));
			check(golems == 1, "an iron golem nearby", String.valueOf(golems));
			world.getServer().runCommand("kill @e[type=iron_golem]");
			// and things that stand there: an end crystal ("Jaki skyblock, taki smok")
			world.getServer().runCommand("execute at @p run summon end_crystal ~3 ~ ~-3 {ShowBottom:0b}");
			context.waitTicks(40);
			long crystals = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCounters.aroundForTest("Kryształ Endu"));
			check(crystals == 1, "an end crystal nearby", String.valueOf(crystals));
			world.getServer().runCommand("kill @e[type=end_crystal]");
			// a stacked mob: its number in the name (SkyUp's "Sztuk: 5"); each one off it is a kill, and so is the last one dying
			String stacks = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCounters.stacksForTest("Sztuk: 10", "§6Sztuk: §e3", "x11 Krowa", "Krowa x11",
				"11x Krowa", "Krowa [x4]", "§ex7 §fŚwinia", "Krowa", "Zombie poz. 5"));
			check(stacks.equals("10 3 11 11 11 4 7 1 1"), "stacked mobs' numbers", stacks);
			world.getServer().runCommand("execute at @p run summon cow ~2 ~ ~2 {NoAI:1b,CustomName:\"Sztuk: 5\"}");
			context.waitTicks(10);
			long killsBefore = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCounters.killedForTest);
			context.runOnClient(mc -> TestHooks.skyStackedCowHit());
			world.getServer().runCommand("data merge entity @e[type=cow,limit=1] {CustomName:\"Sztuk: 3\"}");
			context.waitTicks(10);
			world.getServer().runCommand("data merge entity @e[type=cow,limit=1] {CustomName:\"Sztuk: 1\"}");
			context.waitTicks(10);
			world.getServer().runCommand("kill @e[type=cow]");
			context.waitTicks(10);
			long stackKills = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCounters.killedForTest) - killsBefore;
			check(stackKills == 5, "kills of a stacked cow (5 in it)", String.valueOf(stackKills));
			// in a dungeon a kill counts for no task
			String dungeonKills = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCounters.dungeonKillForTest());
			check(dungeonKills.equals("0 1"), "kills in a dungeon (in, out)", dungeonKills);
			rows = context.computeOnClient(mc -> TestHooks.skyRows());
			check(rows.contains(" | ~31/128"), "HUD estimate", rows);
			// the fish counter: the catch from the chat, its weight, size, species and quality
			String fish = context.computeOnClient(mc -> TestHooks.skyFish());
			check(fish.startsWith("trip 1/8090g/") && fish.contains("session 1/8090g/") && fish.contains("lifetime 1/8090g/") && fish.contains("sizes {ogromny=1}")
				&& fish.contains("species {Halibut atlantycki=1}") && fish.contains("qualities {niezjadliwy=1}"), "fish counter", fish);
			// a long pause, then a fish: a new fishing trip, the game's session goes on
			fish = context.computeOnClient(mc -> TestHooks.skyFishAfterPause());
			check(fish.startsWith("trip 1/1000g/") && fish.contains("session 2/9090g/") && fish.contains("lifetime 2/9090g/"), "fishing trip", fish);
			// on another server neither shows
			String elsewhere = context.computeOnClient(mc -> TestHooks.skyElsewhere(true));
			check(elsewhere.equals("tasks false fish false"), "off SkyUp", elsewhere);
			elsewhere = context.computeOnClient(mc -> TestHooks.skyElsewhere(false));
			check(elsewhere.equals("tasks true fish true"), "back on SkyUp", elsewhere);
			// the jobs' levels from their window and a job's boss bar; a needed task done turns its line green
			String jobs = context.computeOnClient(mc -> TestHooks.skyJobsAndNeeds());
			check(jobs.equals("7 9 false | bar 10 | needs 'Zmory podziemi' false -> true | long ago 'Szamaństwo' false -> true [pierwsze drzewo, szamaństwo, zmory podziemi]"), "jobs and needed tasks", jobs);
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
			// marked as a background behind the item instead of a frame
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.skyTasksMark = "background");
			context.waitTicks(3);
			context.takeScreenshot("skyready-gui-background");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.skyTasksMark = "frame");
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
			// the window opened again still shows Składzik as it was (SkyUp updates it later): it does not come back
			context.runOnClient(mc -> TestHooks.skyTasksScreen(false, false));
			context.waitTicks(15);
			String reread = context.computeOnClient(mc -> TestHooks.skyTasks());
			check(!reread.contains("|Składzik:") && reread.contains("|Ciasno, ale własno:"), "handed in, then the window read again", reread);
			context.setScreen(() -> null);
			context.waitTicks(3);
			// another chest's line of the same words is no completion
			context.runOnClient(mc -> TestHooks.skyChat("Ukończono zadanie Huta!"));
			context.waitTicks(3);
			check(context.computeOnClient(mc -> TestHooks.skyTasks()).contains("|Huta:"), "not SkyUp's line", "");
			check(context.computeOnClient(mc -> TestHooks.skyCompletedIsNoTask()), "a handed-in task in the GUI is no task", "");
			// the dungeon's level: the highest seen on its boss bar
			String dungeon = context.computeOnClient(mc -> TestHooks.skyDungeonLevel());
			check(dungeon.endsWith(" 7/10") && !dungeon.startsWith("7 "), "dungeon level from the boss bar (the highest seen)", dungeon);
			String anyBlock = context.computeOnClient(mc -> TestHooks.skyAnyBlock());
			check(anyBlock.equals("true true false true true true false"), "\"Dowolny blok\" is any block, \"Dowolne jajko\" any egg", anyBlock);
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
			// the furnace completed: the GUI without it, and the HUD without it (nor Składzik, handed in from the chat though the window still shows it)
			context.runOnClient(mc -> TestHooks.skyTasksScreen(true, false));
			context.waitTicks(15);
			context.setScreen(() -> null);
			context.waitTicks(5);
			tasks = context.computeOnClient(mc -> TestHooks.skyTasks());
			check(!tasks.contains("|Huta:") && !tasks.contains("|Składzik:") && tasks.strip().split("\n").length == 11, "completed task gone", tasks);
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
			// more counted live: a bell rung, a sheep shorn, the level, a case opened by hand
			context.runOnClient(mc -> TestHooks.skyMoreTasks());
			world.getServer().runCommand("xp set @a 61 levels");
			world.getServer().runCommand("execute at @p run setblock ^ ^1 ^2 bell");
			context.runOnClient(mc -> { mc.player.setXRot(0f); mc.player.setYRot(mc.player.getYRot()); });
			context.waitTicks(10);
			// a click the server refused (no swing, no sound): nothing counted
			context.runOnClient(mc -> TestHooks.skyUseRefused());
			context.waitTicks(10);
			String refused = context.computeOnClient(mc -> TestHooks.skyMoreProgress());
			check(refused.startsWith("Uderz w dzwony=0 "), "a bell the server did not ring", refused);
			context.runOnClient(mc -> TestHooks.skyUse());
			context.waitTicks(10);
			// the case's chest clicked (the bell is a block too), then SkyUp's win line
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.skyup.SkyCase.onChat("SkyCase » Wygrano: 5x Zaklęta butelka!"));
			world.getServer().runCommand("execute at @p run setblock ^ ^1 ^2 air");
			world.getServer().runCommand("execute at @p run summon sheep ^ ^ ^2 {NoAI:1b}");
			world.getServer().runCommand("item replace entity @a weapon.mainhand with shears"); context.runOnClient(mc -> mc.player.setXRot(35f));
			context.waitTicks(10);
			context.runOnClient(mc -> TestHooks.skyUse());
			context.waitTicks(10);
			String more = context.computeOnClient(mc -> TestHooks.skyMoreProgress());
			check(more.equals("Uderz w dzwony=1 Ostrzyż=1 Otwórz SkyCase=1 Handluj z piglinami=0 Posiadaj poziom=61"), "bells, sheep, a case by hand, the level", more);
			// a stacked sheep ("Sztuk: 4") shorn whole counts four; one the server does not shear (a sheep already shorn) none
			world.getServer().runCommand("kill @e[type=sheep]");
			// summoned where the first one stood (in front at eye level, not where the lowered look points)
			world.getServer().runCommand("execute at @p rotated ~ 0 run summon sheep ^ ^ ^2 {NoAI:1b,CustomName:\"Sztuk: 4\"}");
			context.waitTicks(30);
			context.runOnClient(mc -> TestHooks.skyUse());
			context.waitTicks(10);
			String stacked = context.computeOnClient(mc -> TestHooks.skyMoreProgress());
			check(stacked.contains("Ostrzyż=5 "), "a stacked sheep shorn", stacked);
			context.runOnClient(mc -> TestHooks.skyUse());
			context.waitTicks(10);
			String again = context.computeOnClient(mc -> TestHooks.skyMoreProgress());
			check(again.contains("Ostrzyż=5 "), "a shorn sheep clicked again", again);
			world.getServer().runCommand("kill @e[type=sheep]");
			// gold given to a piglin by hand: once it lets go of it and throws what it gives, one trade
			// (not in peaceful, which takes piglins away; gold worn, so it does not turn on the player afterwards)
			world.getServer().runCommand("difficulty easy");
			world.getServer().runCommand("item replace entity @a armor.head with golden_helmet");
			world.getServer().runCommand("execute at @p rotated ~ 0 run summon piglin ^ ^ ^2 {IsImmuneToZombification:1b,PersistenceRequired:1b,IsBaby:0b}");
			world.getServer().runCommand("item replace entity @a weapon.mainhand with gold_ingot");
			context.runOnClient(mc -> mc.player.setXRot(0f));
			context.waitTicks(3);
			context.runOnClient(mc -> TestHooks.skyUse());
			String bartered = "";
			for (int i = 0; i < 30 && !bartered.contains("Handluj z piglinami=1 "); i++) {
				context.waitTicks(10);
				bartered = context.computeOnClient(mc -> TestHooks.skyMoreProgress());
			}
			check(bartered.contains("Handluj z piglinami=1 "), "a trade with a piglin", bartered + " | " + context.computeOnClient(mc -> { StringBuilder o = new StringBuilder(); for (var e : mc.level.entitiesForRendering()) if (e instanceof net.minecraft.world.entity.monster.piglin.Piglin pg) o.append("piglin ").append(pg.getOffhandItem()).append(" baby ").append(pg.isBaby()).append(" at ").append(pg.distanceTo(mc.player)).append("; "); else if (e instanceof net.minecraft.world.entity.item.ItemEntity it) o.append("item ").append(it.getItem()).append("; "); return o + " hand " + mc.player.getMainHandItem() + " hit " + mc.hitResult.getType(); }));
			world.getServer().runCommand("kill @e[type=piglin]");
			world.getServer().runCommand("kill @e[type=item]");
			world.getServer().runCommand("item replace entity @a armor.head with air");
			world.getServer().runCommand("difficulty peaceful");
			world.getServer().runCommand("item replace entity @a weapon.mainhand with air");
			String shaman = context.computeOnClient(mc -> TestHooks.skyShaman());
			check(shaman.contains("✖ Redstone Torch") && shaman.contains("✖ Glass Bottle") && shaman.contains("Rotten Flesh 0/20") && shaman.contains("✔ Rotten Flesh 20/20") && shaman.endsWith("count 1"), "shamanism", shaman);
			// the daily task: nothing to remind of until it is tracked, then what is left of it
			String daily = context.computeOnClient(mc -> TestHooks.skyDaily());
			check(daily.equals("null | Still to do: Buraki 0/3888 | auto true false"), "the daily task's reminder (untracked | tracked | tracked by itself, then taken off)", daily);
			// the daily bonus: due until its window shows today's gift taken, due again the next day
			String bonus = context.computeOnClient(mc -> TestHooks.skyBonus());
			check(bonus.equals("true true true false false true"), "the daily bonus's reminder", bonus);
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
			// SkyUp's shamanism window: each mob's recipe read from it (a name the game does not know kept as it is)
			String shamanRead = context.computeOnClient(mc -> TestHooks.skyShamanWindow());
			check(shamanRead.equals("1 x Wiedźma redstone_torch/glass_bottle 10 {bone=10, rotten_flesh=20} | 2 x Świnia stick/carrot_on_a_stick 15 {bone=16, wheat=128} | "
				+ "1 x Kostka siarki end_rod/slime_ball 40 {name:Pył siarkowy=3} | none | "), "the shamanism window's recipes", shamanRead);
			// the witch tracked with the key; her things carried and held: ready in the window, ready to summon in the module
			world.getServer().runCommand("item replace entity @a weapon.mainhand with redstone_torch");
			world.getServer().runCommand("item replace entity @a weapon.offhand with glass_bottle");
			world.getServer().runCommand("give @a bone 10");
			world.getServer().runCommand("give @a rotten_flesh 20");
			context.waitTicks(10);
			double[] witch = context.computeOnClient(mc -> TestHooks.slotPoint(0));
			context.getInput().setCursorPos(witch[0], witch[1]);
			context.waitTicks(3);
			context.getInput().pressKey(options -> TestHooks.skyTrackKey());
			context.waitTicks(3);
			context.takeScreenshot("skyup-shaman-window");
			String shamanRows = context.computeOnClient(mc -> TestHooks.skyShamanModule());
			check(shamanRows.startsWith("Wiedźma | Ready – right-click the campfire | Świnia ×2 | ")
				&& shamanRows.contains("Wand: Stick ✖") && shamanRows.contains("Bone 10/16") && shamanRows.contains("Wheat 0/128")
				&& shamanRows.contains("Kostka siarki") && shamanRows.contains("Pył siarkowy 0/3") && shamanRows.endsWith("lit [0]"), "the shamanism module", shamanRows);
			context.waitTicks(3);
			context.setScreen(() -> null);
			context.waitTicks(3);
			context.takeScreenshot("skyup-shaman-module");
			// the daily bonus's reminder: SkyUp's banner slid down to the top of the screen
			check(context.computeOnClient(mc -> TestHooks.skyBonusReminder(false)), "the bonus reminder shown", "");
			context.waitTicks(15);
			context.takeScreenshot("skyup-bonus-reminder");
			// the daily task's in its own colour
			check(context.computeOnClient(mc -> TestHooks.skyBonusReminder(true)), "the daily task reminder shown", "");
			context.waitTicks(15);
			context.takeScreenshot("skyup-daily-reminder");
			// the plan of the week: read from the wiki's table, the next three, and a banner for the fishing contest only when wanted
			String plan = context.computeOnClient(mc -> TestHooks.skyPlan());
			System.out.println("SlashClient plan of the week: " + plan);
			check(plan.startsWith("MONDAY 19:00 Eventy;TUESDAY 21:00 Boss arena;|WEDNESDAY 19:00 Zawody wędkarskie;WEDNESDAY 20:00 Boss arena;WEDNESDAY 21:00 Eventy;|")
				&& plan.endsWith("|-,Zawody wędkarskie,-"), "the plan of the week", plan);
			context.waitTicks(15);
			context.takeScreenshot("skyup-plan");
			world.getServer().runCommand("clear @a");
			context.runOnClient(mc -> TestHooks.skyTasksOptions(false, false));
			// the shamanism and plan modules shown here would lie over other modules in the next tests' editor
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SlashHud.config.placement("skyshaman").enabled = false;
				dev.slash3rss.slashclient.hud.SlashHud.config.placement("skyplan").enabled = false;
			});
		}
		//#endif
	}

	private static void check(boolean ok, String what, String got) {
		if (!ok) throw new AssertionError("SkyUp tasks, " + what + ":\n" + got);
	}
}
