package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Players and mobs on the minimap and the full map: two hostile mobs (a creeper, a spider), three
 * others (a cow, a pig, a sheep), another player and a server's NPC (not shown) around the player.
 * Each kind switched off goes away; then the full map shows the same with the player's nick.
 */
public class GameMapEntities implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			var server = world.getServer();
			server.runCommand("time set 6000");
			// no mobs of its own coming (the rule's name changed in 26.1), only the test's
			server.runCommand("gamerule doMobSpawning false");
			server.runCommand("gamerule spawn_mobs false");
			server.runCommand("difficulty easy");
			server.runCommand("gamemode creative @a");
			server.runCommand("tp @a 0 170 0 180 40");
			context.waitTicks(60);
			int y = 150;
			server.runCommand(String.format("fill -24 %d -24 24 %d 24 grass_block", y, y));
			server.runCommand(String.format("fill -24 %d -24 24 %d 24 air", y + 1, y + 6));
			server.runCommand(String.format("tp @a 0 %d 0 180 40", y + 1));
			String mob = "summon %s %d %d %d {NoAI:1b,Silent:1b,PersistenceRequired:1b,Tags:[\"slash\"]}";
			server.runCommand(String.format(mob, "creeper", 8, y + 1, -6));
			server.runCommand(String.format(mob, "spider", -10, y + 1, -4));
			server.runCommand(String.format(mob, "cow", -7, y + 1, 9));
			server.runCommand(String.format(mob, "pig", 5, y + 1, 10));
			server.runCommand(String.format(mob, "sheep", 12, y + 1, 4));
			server.runCommand("kill @e[type=!player,tag=!slash]");
			context.runOnClient(mc -> {
				TestHooks.minimapWaypoint(null, 0, 0, 0);
				TestHooks.minimap(true, "square", false, 2f, 140);
				MapSortTestHooks.worldMap(true, 4f);
				MapSortTestHooks.friendsClear();
				MapSortTestHooks.mapEntities(true, true, true);
				MapSortTestHooks.fakePlayer("Gracz_Testowy", -6, y + 1, -12, false);
				MapSortTestHooks.fakePlayer("Sklep NPC", 4, y + 1, -14, true);
			});
			context.waitTicks(60);
			String shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			System.out.println("SlashClient test: minimap entities " + shown);
			if (!shown.equals("1,2,3:Gracz_Testowy,")) throw new AssertionError("Players and mobs on the minimap: " + shown);
			context.takeScreenshot("map-entities-minimap");

			// each kind switched off goes away
			context.runOnClient(mc -> MapSortTestHooks.mapEntities(true, false, true));
			context.waitTicks(3);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			if (!shown.equals("1,0,3:Gracz_Testowy,")) throw new AssertionError("Hostile mobs switched off are still shown: " + shown);
			context.runOnClient(mc -> MapSortTestHooks.mapEntities(false, true, false));
			context.waitTicks(3);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			if (!shown.equals("0,2,0:")) throw new AssertionError("Players and other mobs switched off are still shown: " + shown);
			context.runOnClient(mc -> MapSortTestHooks.mapEntities(true, true, true));

			// round and turning with the player: the same things
			server.runCommand(String.format("tp @a 0 %d 0 45 40", y + 1));
			context.runOnClient(mc -> TestHooks.minimap(true, "circle", true, 2f, 140));
			context.waitTicks(10);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			if (!shown.equals("1,2,3:Gracz_Testowy,")) throw new AssertionError("Players and mobs on the round minimap: " + shown);
			context.takeScreenshot("map-entities-minimap-round");

			// the full map
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.WorldMapScreen(null));
			context.waitTicks(10);
			context.runOnClient(mc -> MapSortTestHooks.mapCenter(0, 0, 4f));
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(5);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnWorldMap());
			System.out.println("SlashClient test: world map entities " + shown);
			if (!shown.equals("1,2,3:Gracz_Testowy,")) throw new AssertionError("Players and mobs on the full map: " + shown);
			context.takeScreenshot("map-entities-worldmap");
			context.setScreen(() -> null);

			context.runOnClient(mc -> {
				MapSortTestHooks.fakePlayersGone();
				TestHooks.minimap(false, "square", false, 1f, 100);
				MapSortTestHooks.worldMap(true, 2f);
			});
			server.runCommand("kill @e[type=!player]");
			context.waitTicks(5);
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
