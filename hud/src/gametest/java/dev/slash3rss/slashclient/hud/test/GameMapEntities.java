package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Players and mobs on the minimap and the full map: two hostile mobs (a creeper, a spider), three
 * others (a cow, a pig, a sheep), another player and a server's NPC (not shown) around the player.
 * Each kind switched off goes away; then the full map shows the same with the player's nick.
 */
public class GameMapEntities implements FabricClientGameTest {
	/** How the test's mobs are drawn: their faces (every mob but the ender dragon has one). */
	private static final String FACES = "cow:head,creeper:head,pig:head,sheep:head,silverfish:head,spider:head,zombie:head,";
	/** Every mob with a face, for the picture of them all. */
	private static final String[] ALL = { "zombie", "husk", "drowned", "skeleton", "stray", "wither_skeleton", "bogged", "creeper", "spider",
		"cave_spider", "enderman", "slime", "magma_cube", "blaze", "phantom", "guardian", "elder_guardian", "warden",
		"witch", "pillager", "vindicator", "evoker", "illusioner", "piglin", "zombified_piglin", "piglin_brute", "hoglin", "zoglin", "vex",
		"villager", "wandering_trader", "zombie_villager", "iron_golem", "snow_golem", "cow", "mooshroom", "pig", "sheep",
		"chicken", "horse", "donkey", "mule", "wolf", "cat", "ocelot", "fox", "rabbit", "bee", "axolotl", "turtle",
		"frog", "llama", "goat", "polar_bear", "panda", "squid", "glow_squid", "ghast", "giant", "allay", "armadillo", "bat", "breeze", "camel",
		"cod", "salmon", "tropical_fish", "pufferfish", "tadpole", "dolphin", "silverfish", "endermite", "creaking", "copper_golem", "happy_ghast",
		"parrot", "nautilus", "zombie_nautilus", "ravager", "shulker", "sniffer", "strider", "sulfur_cube", "camel_husk" };

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
			// a zombie under a roof (the sun would burn it) and a silverfish
			server.runCommand(String.format("setblock %d %d %d stone", 3, y + 3, 6));
			server.runCommand(String.format(mob, "zombie", 3, y + 1, 6));
			server.runCommand(String.format(mob, "silverfish", -12, y + 1, 7));
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
			if (!shown.equals("1,4,3:Gracz_Testowy,")) throw new AssertionError("Players and mobs on the minimap: " + shown);
			// the mobs we know get their faces, cut from the texture they are drawn with
			String marks = context.computeOnClient(mc -> MapSortTestHooks.markers(false));
			System.out.println("SlashClient test: minimap markers " + marks + " textures " + context.computeOnClient(mc -> MapSortTestHooks.faceTextures(false)));
			if (!marks.equals(FACES)) throw new AssertionError("Mob faces on the minimap: " + marks);
			// the sulfur cube spawns as a monster but never attacks: a green frame, not a red one (where the game has it)
			if (net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.containsKey(net.minecraft.resources.Identifier.withDefaultNamespace("sulfur_cube"))) {
				server.runCommand(String.format(mob, "sulfur_cube", -4, y + 1, 5));
				context.waitTicks(20);
				String withCube = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
				if (!withCube.equals("1,4,4:Gracz_Testowy,")) throw new AssertionError("The sulfur cube is not a passive mob on the minimap: " + withCube);
				server.runCommand("kill @e[type=sulfur_cube]");
				context.waitTicks(20);
			}
			context.takeScreenshot("map-entities-minimap");

			// each kind switched off goes away
			context.runOnClient(mc -> MapSortTestHooks.mapEntities(true, false, true));
			context.waitTicks(3);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			if (!shown.equals("1,0,3:Gracz_Testowy,")) throw new AssertionError("Hostile mobs switched off are still shown: " + shown);
			context.runOnClient(mc -> MapSortTestHooks.mapEntities(false, true, false));
			context.waitTicks(3);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			if (!shown.equals("0,4,0:")) throw new AssertionError("Players and other mobs switched off are still shown: " + shown);
			context.runOnClient(mc -> MapSortTestHooks.mapEntities(true, true, true));

			// round and turning with the player: the same things
			server.runCommand(String.format("tp @a 0 %d 0 45 40", y + 1));
			context.runOnClient(mc -> TestHooks.minimap(true, "circle", true, 2f, 140));
			context.waitTicks(10);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnMinimap());
			if (!shown.equals("1,4,3:Gracz_Testowy,")) throw new AssertionError("Players and mobs on the round minimap: " + shown);
			context.takeScreenshot("map-entities-minimap-round");

			// the full map
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.map.WorldMapScreen(null));
			context.waitTicks(10);
			context.runOnClient(mc -> MapSortTestHooks.mapCenter(0, 0, 4f));
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(5);
			shown = context.computeOnClient(mc -> MapSortTestHooks.entitiesOnWorldMap());
			System.out.println("SlashClient test: world map entities " + shown);
			if (!shown.equals("1,4,3:Gracz_Testowy,")) throw new AssertionError("Players and mobs on the full map: " + shown);
			marks = context.computeOnClient(mc -> MapSortTestHooks.markers(true));
			if (!marks.equals(FACES)) throw new AssertionError("Mob faces on the full map: " + marks);
			context.takeScreenshot("map-entities-worldmap");
			context.setScreen(() -> null);

			// every mob with a face of its own side by side, at night (the sun would burn the undead)
			context.runOnClient(mc -> MapSortTestHooks.fakePlayersGone());
			server.runCommand("kill @e[type=!player]");
			server.runCommand("time set 18000");
			server.runCommand(String.format("tp @a 0 %d -3 180 40", y + 1));
			context.waitTicks(5);
			StringBuilder expected = new StringBuilder();
			// only the mobs this version of the game has
			String[] all = java.util.Arrays.stream(ALL).filter(id -> net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.containsKey(net.minecraft.resources.Identifier.withDefaultNamespace(id))).toArray(String[]::new);
			java.util.List<String> sorted = new java.util.ArrayList<>(java.util.List.of(all));
			sorted.sort(null);
			for (String id : sorted) expected.append(id).append(":head,");
			for (int i = 0; i < all.length; i++) {
				String extra = all[i].equals("slime") || all[i].equals("magma_cube") ? ",Size:1" : "";
				server.runCommand(String.format("summon %s %d %d %d {NoAI:1b,Silent:1b,PersistenceRequired:1b,Invulnerable:1b%s}", all[i], -12 + (i % 9) * 3, y + 1, -12 + (i / 9) * 3, extra));
			}
			context.waitTicks(40);
			context.runOnClient(mc -> TestHooks.minimap(true, "square", false, 3f, 160));
			context.waitTicks(5);
			context.takeScreenshot("map-entities-heads-minimap");
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.map.WorldMapScreen(null));
			context.waitTicks(10);
			context.runOnClient(mc -> MapSortTestHooks.mapCenter(0, -3, 5f));
			context.getInput().setCursorPos(4, 4);
			context.waitTicks(5);
			marks = context.computeOnClient(mc -> MapSortTestHooks.markers(true));
			System.out.println("SlashClient test: world map faces " + marks + " textures " + context.computeOnClient(mc -> MapSortTestHooks.faceTextures(true)));
			if (!marks.equals(expected.toString())) throw new AssertionError("Mob faces of every kind on the full map: " + marks);
			context.takeScreenshot("map-entities-heads");
			// the same faces large, to see each is cut right
			context.setScreen(MapSortTestHooks::facesSheet);
			context.waitTicks(5);
			context.takeScreenshot("map-entities-faces");
			context.setScreen(() -> null);
			server.runCommand("time set 6000");

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
