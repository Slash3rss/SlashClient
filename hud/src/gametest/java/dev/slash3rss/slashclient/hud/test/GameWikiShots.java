package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.gamehud.GameParts;
import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.testing.MapSortTestHooks;
import dev.slash3rss.slashclient.hud.testing.NowPlayingTestHooks;
import dev.slash3rss.slashclient.hud.testing.StreamChatTestHooks;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;

/**
 * The pictures of the website's wiki (its HUD part): every module on its own over a real world in
 * daylight, the editor and its pages, the maps, the menus and the in-game windows. Each picture is
 * "wiki-<name>"; where a picture is only a part of the screen (a small module), the part goes into
 * screenshots/wiki-boxes.txt ("name x y w h" in window pixels), which scripts/wiki/hud-shots.py
 * reads to cut it out. Run alone: ./gradlew runClientGameTest -Pmc=26.3 -Ptests=GameWikiShots
 */
public class GameWikiShots implements FabricClientGameTest {
	private static final int WIDTH = 1920, HEIGHT = 1080, GUI = 3;
	/** The lines of wiki-boxes.txt, as the pictures are taken. */
	private final List<String> boxes = new ArrayList<>();
	/** Pictures that could not be made (the test fails at the end, after all the others). */
	private final List<String> failed = new ArrayList<>();

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.getInput().resizeWindow(WIDTH, HEIGHT);
		context.runOnClient(mc -> {
			TestHooks.guiScale(GUI);
			TestHooks.defaults();
			TestHooks.slashMenu();
		});
		language(context, "pl_pl");
		context.waitTicks(20);

		// before any world: SlashClient's main menu and server list
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.getInput().setCursorPos(760, 520);
		context.waitTicks(60);
		full(context, "menu-glowne");
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.SlashServerScreen(new net.minecraft.client.gui.screens.TitleScreen()));
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(30);
		full(context, "lista-serwerow");
		context.setScreen(() -> null);

		try (TestSingleplayerContext world = context.worldBuilder().setUseConsistentSettings(false).adjustSettings(s -> s.setSeed("slashclient")).create()) {
			context.waitTicks(100);
			var server = world.getServer();
			for (String cmd : new String[] {
				"time set 1000", "weather clear", "gamerule doDaylightCycle false", "gamerule advance_time false",
				"gamerule doWeatherCycle false", "gamerule advance_weather false",
				"gamerule show_advancement_messages false", "gamerule announceAdvancements false",
				"gamerule doMobSpawning false", "gamerule spawn_mobs false",
				"difficulty easy", "gamemode survival @a",
				// on a small tower above the trees, looking out over the land
				"spreadplayers 0 0 0 40 false @a",
				"execute at @a run fill ~-1 ~ ~-1 ~1 ~9 ~1 stone_bricks",
				"execute at @a run tp @a ~ ~10 ~ 135 12",
				// standing still even with W held (the keystrokes show it pressed)
				"attribute @a minecraft:movement_speed base set 0",
			}) server.runCommand(cmd);
			context.runOnClient(mc -> {
				TestHooks.renderDistance(12);
				MapSortTestHooks.clearWaypoints();
			});
			context.waitTicks(200);

			gear(server);
			modulePictures(context, server);
			combatPictures(context, server);
			mapPictures(context, server);
			gamePictures(context, server);
			chatPictures(context, server);
			editorPictures(context);
			windowPictures(context, server);
			inventoryPictures(context, server);
			extrasPictures(context, server);

			context.runOnClient(mc -> {
				MapSortTestHooks.clearWaypoints();
				MapSortTestHooks.friendsClear();
				NowPlayingTestHooks.reset();
				StreamChatTestHooks.reset();
				TestHooks.sneak(false);
				TestHooks.defaults();
				TestHooks.renderDistance(8);
			});
		}
		writeBoxes();
		language(context, "en_us");
		context.getInput().resizeWindow(854, 480);
		context.runOnClient(mc -> {
			TestHooks.guiScale(2);
			TestHooks.vanillaMenu();
		});
		if (!failed.isEmpty()) throw new AssertionError("Wiki pictures not made: " + failed);
	}

	// ---------- the pictures ----------

	/** Armour, a sword and things to count: what the combat modules show. */
	private static void gear(TestServerContext server) {
		for (String cmd : new String[] {
			"clear @a",
			"item replace entity @a armor.head with diamond_helmet",
			"item replace entity @a armor.chest with diamond_chestplate",
			"item replace entity @a armor.legs with iron_leggings",
			"item replace entity @a armor.feet with diamond_boots",
			"item replace entity @a weapon.mainhand with diamond_sword[damage=700]",
			"item replace entity @a weapon.offhand with golden_apple 6",
			"item replace entity @a hotbar.1 with bow",
			"item replace entity @a hotbar.2 with ender_pearl 16",
			"item replace entity @a hotbar.3 with totem_of_undying",
			"item replace entity @a hotbar.4 with cooked_beef 24",
			"item replace entity @a hotbar.5 with stone_bricks 64",
			"item replace entity @a hotbar.6 with torch 32",
			"item replace entity @a inventory.0 with arrow 64",
			"item replace entity @a inventory.1 with arrow 23",
			"item replace entity @a inventory.2 with experience_bottle 32",
			"item replace entity @a inventory.3 with firework_rocket 48",
			"effect give @a speed 900 1 true",
			"effect give @a strength 900 0 true",
			"effect give @a regeneration 900 0 true",
			"effect give @a fire_resistance 900 0 true",
		}) server.runCommand(cmd);
	}

	/** The information modules, one (or a few) at a time, over the world. */
	private void modulePictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> {
			HudConfig c = SlashHud.config;
			c.clockDate = true;
			c.daytimeWarn = true;
			c.lightSplit = true;
			c.fpsGraphMinMax = true;
			c.compassDegrees = true;
		});
		module(context, "fps", false, "fps");
		module(context, "wykres-fps", false, "fpsgraph");
		module(context, "wspolrzedne", false, "coords");
		module(context, "wspolrzedne-netheru", false, "nethercoords");
		module(context, "predkosc", false, "speed");
		module(context, "zegar", false, "clock", "session");
		module(context, "komputer", false, "memory", "cpu", "gpu");
		module(context, "kompas", false, "compass");
		module(context, "swiat", false, "biome", "daytime", "light", "sky");
		module(context, "nasycenie", false, "saturation");
		module(context, "ekwipunek-modul", false, "inventory");
		// the multiplayer ones show their sample in the editor (singleplayer has no network)
		module(context, "serwer", true, "server", "players", "ping", "tps");
		module(context, "siec", true, "network", "pinggraph");
		module(context, "znajomi-online", true, "friends");
		module(context, "elytra", true, "elytra");

		// what plays on this computer, and a stream's chat (as the launcher and Twitch would send them)
		context.runOnClient(mc -> {
			NowPlayingTestHooks.configure("card", true, 36, true, true, true, "spotify", 220, true);
			NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "Kopalnia o świcie", true, 61_000, 200_000, "Gracz", "DJ Kubełek"));
		});
		context.waitTicks(10);
		module(context, "teraz-gra", false, "spotify");

		// sneaking: the sprint and sneak indicators
		context.runOnClient(mc -> TestHooks.sneak(true));
		context.waitTicks(10);
		module(context, "sprint", false, "sprint");
		context.runOnClient(mc -> TestHooks.sneak(false));

		// a block of wheat on farmland just ahead, looked at: the block info
		server.runCommand("execute as @p at @s rotated ~ 0 run setblock ^ ^ ^2 farmland");
		server.runCommand("execute as @p at @s rotated ~ 0 run setblock ^ ^1 ^2 wheat[age=5]");
		context.waitTicks(10);
		System.out.println("SlashClient wiki: block info " + context.computeOnClient(mc -> TestHooks.blockInfoLines()));
		module(context, "informacje-o-bloku", false, "block");
		server.runCommand("execute as @p at @s rotated ~ 0 run setblock ^ ^1 ^2 air");
		server.runCommand("execute as @p at @s rotated ~ 0 run setblock ^ ^ ^2 air");
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ 135 12");
		context.waitTicks(5);
	}

	/** A husk in front (it does not burn in the sun) hit a few times: the combat modules, the hit marker, damage numbers. */
	private void combatPictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> SlashHud.config.compassDegrees = false);
		module(context, "pancerz", false, "armor");
		module(context, "efekty", false, "effects");
		module(context, "licznik-przedmiotow", false, "items");
		module(context, "wytrzymalosc", false, "durability");
		context.getInput().holdKey(o -> o.keyUp);
		context.waitTicks(3);
		module(context, "klawisze", false, "keystrokes");
		context.getInput().releaseKey(o -> o.keyUp);
		module(context, "cps", false, "cps", "attackindicator");
		context.runOnClient(mc -> TestHooks.selectSlot(1));
		context.waitTicks(5);
		module(context, "amunicja", false, "ammo");
		context.runOnClient(mc -> TestHooks.selectSlot(0));

		server.runCommand("execute as @p at @s rotated ~ 0 run summon husk ^ ^ ^3 {NoAI:1b,NoGravity:1b,PersistenceRequired:1b,Silent:1b,Health:200f,attributes:[{id:\"minecraft:max_health\",base:200}]}");
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ ~ 5");
		context.waitTicks(10);
		System.out.println("SlashClient wiki: target " + context.computeOnClient(mc -> TestHooks.shownTargetName()));
		context.runOnClient(mc -> {
			SlashHud.config.hitMarker = true;
			SlashHud.config.hitMarkerStyle = "bold";
			SlashHud.config.damageNumbers = true;
			TestHooks.crosshairStyle("plusdot");
			SlashHud.config.crosshairColor = 0xFF55FF55;
		});
		module(context, "cel", false, "target");
		for (int i = 0; i < 3; i++) {
			context.runOnClient(mc -> TestHooks.attackNearest());
			context.waitTicks(14);
		}
		context.runOnClient(mc -> TestHooks.attackNearest());
		context.waitTicks(2);
		module(context, "cios", false, "hits", "combo", "reach", "kd");
		context.runOnClient(mc -> TestHooks.attackNearest());
		context.waitTicks(3);
		region(context, "trafienie", 0.5, 0.5, 260, 150);
		server.runCommand("kill @e[type=husk]");
		context.runOnClient(mc -> {
			SlashHud.config.crosshair = "vanilla";
			SlashHud.config.hitMarker = false;
		});
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ 135 12");

		// the crosshairs: a few of the shapes one after the other
		for (String style : new String[] { "circledot", "corners", "xdot" }) {
			context.runOnClient(mc -> {
				TestHooks.crosshairStyle(style);
				SlashHud.config.crosshairColor = 0xFF55FFFF;
			});
			context.waitTicks(3);
			region(context, "celownik-" + style, 0.5, 0.5, 120, 80);
		}
		context.runOnClient(mc -> SlashHud.config.crosshair = "vanilla");

		// TNT with its fuse counted down
		context.runOnClient(mc -> SlashHud.config.tntTimer = true);
		server.runCommand("execute as @p at @s rotated ~ 0 run summon tnt ^ ^ ^4 {fuse:200,NoGravity:1b}");
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ facing entity @e[type=tnt,limit=1] feet");
		context.waitTicks(20);
		region(context, "tnt", 0.5, 0.5, 300, 200);
		server.runCommand("kill @e[type=tnt]");
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ 135 12");
		context.waitTicks(5);

		// a tool about to break
		context.runOnClient(mc -> SlashHud.config.toolWarning = true);
		server.runCommand("item replace entity @p weapon.mainhand with diamond_pickaxe[damage=1555]");
		context.waitTicks(10);
		region(context, "ostrzezenie-narzedzie", 0.5, 0.81, 300, 60);
		server.runCommand("item replace entity @p weapon.mainhand with diamond_sword[damage=700]");
	}

	/** The minimap, the map over the whole screen, the waypoints and friends on them. */
	private void mapPictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> {
			var p = mc.player;
			int x = (int) Math.floor(p.getX()), y = (int) Math.floor(p.getY()), z = (int) Math.floor(p.getZ());
			MapSortTestHooks.clearWaypoints();
			TestHooks.minimapWaypoint("Dom", x - 26, y - 10, z + 30);
			TestHooks.minimapWaypoint("Kopalnia", x + 40, y - 20, z - 18);
			TestHooks.minimapWaypoint("Wioska", x - 380, 70, z - 250);
			MapSortTestHooks.sharedWaypoint("Baza Oli", x + 70, 70, z + 55, "Ola");
			SlashHud.config.waypoints = true;
			MapSortTestHooks.worldMap(true, 2f);
			MapSortTestHooks.friendsOnMap(true);
			TestHooks.minimap(true, "square", false, 1.5f, 140);
		});
		context.waitTicks(120);
		context.runOnClient(mc -> {
			var p = mc.player;
			MapSortTestHooks.friend("kumpel", "Kumpel", "minecraft:overworld", p.getX() + 22, p.getY() - 8, p.getZ() - 14);
			MapSortTestHooks.friend("ola", "Ola", "minecraft:overworld", p.getX() + 600, 70, p.getZ() + 300);
		});
		context.waitTicks(3);
		module(context, "minimapa", false, "minimap");
		context.runOnClient(mc -> TestHooks.minimap(true, "circle", true, 2f, 140));
		context.waitTicks(10);
		module(context, "minimapa-okragla", false, "minimap");
		// the waypoints in the world: their markers with names and distances
		context.runOnClient(mc -> TestHooks.onlyModules());
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ facing " + "~-26 ~-10 ~30");
		context.waitTicks(10);
		full(context, "waypointy-w-swiecie");
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ 135 12");
		// M: the map over the whole screen
		context.runOnClient(mc -> {
			var p = mc.player;
			MapSortTestHooks.friend("kumpel", "Kumpel", "minecraft:overworld", p.getX() + 22, p.getY() - 8, p.getZ() - 14);
			MapSortTestHooks.friend("ola", "Ola", "minecraft:overworld", p.getX() + 600, 70, p.getZ() + 300);
		});
		context.getInput().pressKey(InputConstants.KEY_M);
		context.waitTicks(10);
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(5);
		full(context, "mapa-swiata");
		context.setScreen(() -> null);
		// B: the waypoints' list
		context.setScreen(dev.slash3rss.slashclient.hud.map.WaypointsScreen::new);
		context.getInput().setCursorPos(4, 4);
		context.waitTicks(10);
		full(context, "lista-waypointow");
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.minimap(false, "square", false, 1.5f, 140));
	}

	/** The game's own parts moved and scaled, the hearts stacked and the food previewed. */
	private void gamePictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> {
			TestHooks.onlyModules();
			gameParts(true);
			SlashHud.config.compactHearts = true;
			SlashHud.config.foodPreview = true;
		});
		for (String cmd : new String[] {
			"scoreboard objectives add wiki dummy \"SlashClient\"",
			"scoreboard objectives setdisplay sidebar wiki",
			"scoreboard players set Gracz wiki 12",
			"scoreboard players set Steve wiki 9",
			"scoreboard players set Alex wiki 4",
			"bossbar add wiki \"Smok Kresu\"",
			"bossbar set wiki players @a",
			"bossbar set wiki color purple",
			"bossbar set wiki value 70",
			"attribute @p minecraft:max_health base set 60",
			"effect give @p instant_health 1 20 true",
			"effect give @p absorption 120 1 true",
			"effect give @p hunger 3 255 true",
		}) server.runCommand(cmd);
		context.waitTicks(80);
		server.runCommand("effect clear @p hunger");
		server.runCommand("item replace entity @p weapon.mainhand with cooked_beef 24");
		context.waitTicks(10);
		full(context, "interfejs-gry");
		region(context, "serca-i-jedzenie", 0.5, 1.0, 230, 64);
		server.runCommand("scoreboard objectives remove wiki");
		server.runCommand("bossbar remove wiki");
		server.runCommand("attribute @p minecraft:max_health base set 20");
		server.runCommand("effect clear @p absorption");
		server.runCommand("effect give @p saturation 5 20 true");
		server.runCommand("item replace entity @p weapon.mainhand with diamond_sword[damage=700]");
		context.runOnClient(mc -> SlashHud.config.compactHearts = false);
		context.waitTicks(5);
	}

	/** The chat: hours, repeats joined, coordinates to click, a tab, the search. */
	private void chatPictures(ClientGameTestContext context, TestServerContext server) {
		server.runCommand("item replace entity @p weapon.offhand with air");
		context.runOnClient(mc -> {
			TestHooks.cleanScreen();
			SlashHud.config.chatTimestamps = true;
			SlashHud.config.chatStack = true;
			SlashHud.config.chatCoords = true;
			TestHooks.sampleChatTab();
		});
		for (String line : new String[] { "<Steve> Cześć wszystkim!", "<Alex> Hej, kto idzie do kopalni?", "[Party] Steve: idziemy za 5 minut",
			"<Steve> Spotkajmy się przy 120 64 -340", "Serwer: Zapisz się na event!", "Serwer: Zapisz się na event!", "Serwer: Zapisz się na event!",
			"<Alex> gg" }) {
			server.runCommand("tellraw @a \"" + line + "\"");
			context.waitTicks(2);
		}
		context.setScreen(() -> dev.slash3rss.slashclient.hud.Compat.chatScreen());
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(5);
		region(context, "czat", 0.0, 1.0, 250, 100);
		context.runOnClient(mc -> TestHooks.chatSearch("event"));
		context.waitTicks(5);
		region(context, "czat-szukaj", 0.0, 1.0, 250, 100);
		context.setScreen(() -> null);
		context.runOnClient(mc -> SlashHud.config.chatTabs.clear());
	}

	/** The HUD editor: the layout with the usual modules, the settings window and its pages. */
	private void editorPictures(ClientGameTestContext context) {
		context.runOnClient(mc -> {
			TestHooks.cleanScreen();
			TestHooks.defaults();
			TestHooks.minimap(true, "square", false, 1.5f, 100);
			SlashHud.config.placement("keystrokes").enabled = true;
			SlashHud.config.placement("armor").enabled = true;
			SlashHud.config.placement("compass").enabled = true;
			for (String id : new String[] { "dungeonmap", "dungeonloot", "skytasks", "skyfish", "skycase", "skywardrobe", "skyxp", "skyshaman", "skyplan" })
				SlashHud.config.placement(id).enabled = false;
			SlashHud.config.placement("effects").dy = 140;
		});
		context.waitTicks(10);
		full(context, "hud-w-grze");
		context.setScreen(HudEditScreen::new);
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(10);
		full(context, "edytor-ukladu");
		context.setScreen(HudEditScreen::settingsWindow);
		context.waitTicks(10);
		full(context, "ustawienia");
		for (String cat : new String[] { "hud", "combat", "world", "game", "extras", "chat", "share" }) {
			context.setScreen(() -> HudEditScreen.category(cat));
			context.waitTicks(8);
			full(context, "kategoria-" + cat);
		}
		for (String entry : new String[] { "coords", "minimap", "crosshair", "appearance", "chatTabs", "notifications", "zoom", "clips" }) {
			context.setScreen(() -> new HudEditScreen(entry));
			context.waitTicks(8);
			full(context, "opcje-" + entry.toLowerCase(java.util.Locale.ROOT));
		}
		context.setScreen(() -> null);
	}

	/** SlashClient's windows in the game: pause, keys, friends, emotes, cosmetics, calculator. */
	private void windowPictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> TestHooks.onlyModules());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashPauseScreen::new);
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(10);
		full(context, "menu-pauzy");
		context.runOnClient(mc -> TestHooks.openKeybinds());
		context.waitTicks(10);
		full(context, "okno-klawiszy");
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.config.KeyPresetsScreen(null));
		context.waitTicks(10);
		full(context, "presety-klawiszy");
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.world.XpCalcScreen(null));
		context.waitTicks(10);
		full(context, "kalkulator-xp");
		String friend = context.computeOnClient(mc -> TestHooks.sampleInvites());
		context.setScreen(() -> {
			dev.slash3rss.slashclient.hud.social.Social.viewing = friend;
			return new dev.slash3rss.slashclient.hud.social.FriendsScreen(null);
		});
		context.waitTicks(10);
		full(context, "znajomi");
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.emoteWheel());
		context.getInput().setCursorPos(1060, 380);
		context.waitTicks(10);
		full(context, "emotki");
		context.setScreen(() -> null);
	}

	/** The inventory's helpers: search, sorting button, a locked slot, enchantments' colours, a shulker's contents. */
	private void inventoryPictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> {
			HudConfig c = SlashHud.config;
			c.inventorySearch = c.inventorySort = c.sortButton = c.slotLock = c.enchantColors = c.shulkerPreview = true;
		});
		// an enchanted sword (the enchant command works on the hand) put in the hotbar, a full shulker box beside it
		server.runCommand("item replace entity @p weapon.mainhand with diamond_sword");
		for (String e : new String[] { "sharpness 5", "unbreaking 3", "mending", "looting 2", "fire_aspect 1" }) server.runCommand("enchant @p minecraft:" + e);
		server.runCommand("item replace entity @p hotbar.7 from entity @p weapon.mainhand");
		server.runCommand("item replace entity @p weapon.mainhand with diamond_sword[damage=700]");
		server.runCommand("item replace entity @p hotbar.8 with shulker_box[container=[{slot:0,item:{id:\"minecraft:diamond\",count:12}},{slot:1,item:{id:\"minecraft:golden_apple\",count:3}},"
			+ "{slot:2,item:{id:\"minecraft:ender_pearl\",count:16}},{slot:4,item:{id:\"minecraft:obsidian\",count:64}},{slot:9,item:{id:\"minecraft:torch\",count:48}}]]");
		// a locked slot: its padlock on the hotbar and in the inventory
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.inventory.InvToolsTestHooks.lock(5));
		context.waitTicks(5);
		context.runOnClient(mc -> TestHooks.openInventory());
		context.waitTicks(10);
		double[] sword = context.computeOnClient(mc -> TestHooks.slotOnWindow(43));
		context.getInput().setCursorPos(sword[0], sword[1]);
		context.waitTicks(5);
		full(context, "ekwipunek-zaklecia");
		double[] shulker = context.computeOnClient(mc -> TestHooks.slotOnWindow(44));
		context.getInput().setCursorPos(shulker[0], shulker[1]);
		context.waitTicks(5);
		full(context, "ekwipunek-shulker");
		context.setScreen(() -> null);
		// the game's windows in dark grey
		var dark = context.computeOnClient(mc -> TestHooks.darkGui(true, "dark"));
		for (int i = 0; i < 600 && (!dark.isDone() || context.computeOnClient(mc -> TestHooks.reloading())); i++) context.waitTick();
		context.waitTicks(20);
		context.runOnClient(mc -> TestHooks.openWindow("crafting"));
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(10);
		region(context, "ciemne-okna", 0.5, 0.5, 260, 200);
		context.setScreen(() -> null);
		var light = context.computeOnClient(mc -> TestHooks.darkGui(false, "dark"));
		for (int i = 0; i < 600 && (!light.isDone() || context.computeOnClient(mc -> TestHooks.reloading())); i++) context.waitTick();
		context.waitTicks(20);
	}

	/** Zoom, the light level overlay at night, the death screen. */
	private void extrasPictures(ClientGameTestContext context, TestServerContext server) {
		context.runOnClient(mc -> TestHooks.onlyModules());
		context.waitTicks(5);
		full(context, "bez-przyblizenia");
		context.getInput().holdKey(TestHooks::zoomKey);
		context.waitTicks(30);
		full(context, "przyblizenie");
		context.getInput().releaseKey(TestHooks::zoomKey);

		// a floor in the sky with a torch, at night only for us: the light levels on it
		server.runCommand("execute as @p at @s run fill ~-8 ~-1 ~-8 ~8 ~-1 ~8 grass_block");
		server.runCommand("execute as @p at @s run setblock ~3 ~ ~3 torch");
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ 135 35");
		context.runOnClient(mc -> {
			SlashHud.config.timeChanger = true;
			SlashHud.config.fixedTime = 18000;
			SlashHud.config.lightOverlay = true;
			SlashHud.config.lightOverlayRadius = 12;
		});
		context.waitTicks(20);
		full(context, "nakladka-swiatla");
		context.runOnClient(mc -> {
			SlashHud.config.lightOverlay = false;
			SlashHud.config.fullbright = true;
		});
		context.waitTicks(10);
		context.runOnClient(mc -> {
			SlashHud.config.fullbright = false;
			SlashHud.config.timeChanger = false;
		});
		server.runCommand("execute as @p at @s run tp @s ~ ~ ~ 135 12");

		// the death screen: where, how long, and the place kept
		context.runOnClient(mc -> SlashHud.config.deathScreen = true);
		server.runCommand("kill @a");
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(30);
		full(context, "ekran-smierci");
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.testing.WorldAidsTestHooks.respawn());
		context.waitTicks(20);
		context.setScreen(() -> null);
	}

	// ---------- taking them ----------

	/** The game's own parts (chat, scoreboard, …) shown or not. */
	private static void gameParts(boolean on) {
		for (HudModule m : SlashHud.MODULES) if (m instanceof GameParts.Part) SlashHud.config.placement(m.id()).enabled = on;
	}

	/**
	 * Only these modules on, one under another a little above the middle of the screen, and the
	 * picture with their box; `preview` takes it in the editor, where a module shows its sample.
	 */
	private void module(ClientGameTestContext context, String name, boolean preview, String... ids) {
		try {
			int[] box = context.computeOnClient(mc -> {
				TestHooks.cleanScreen();
				TestHooks.onlyModules(ids);
				int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
				int top = Math.round(sh * (preview ? 0.05f : 0.45f)), y = top, minX = sw, maxX = 0;
				for (String id : ids) {
					HudModule m = SlashHud.MODULES.stream().filter(x -> x.id().equals(id)).findFirst().orElseThrow();
					HudConfig.Placement p = SlashHud.config.placement(id);
					p.ax = 0.5f;
					p.ay = 0f;
					p.dx = 0;
					p.dy = y;
					int[] size = SlashHud.size(m, mc, p);
					int[] at = SlashHud.position(p, size[0], size[1], sw, sh);
					minX = Math.min(minX, at[0]);
					maxX = Math.max(maxX, at[0] + size[0]);
					y += size[1] + 4;
				}
				return new int[] { minX, top, maxX - minX, y - 4 - top };
			});
			if (preview) {
				context.setScreen(HudEditScreen::new);
				context.getInput().setCursorPos(2, 2);
			}
			context.waitTicks(preview ? 8 : 4);
			context.runOnClient(mc -> TestHooks.cleanScreen());
			context.takeScreenshot("wiki-" + name);
			boxes.add(name + " " + box[0] * GUI + " " + box[1] * GUI + " " + box[2] * GUI + " " + box[3] * GUI);
			if (preview) context.setScreen(() -> null);
		} catch (RuntimeException e) {
			failed.add(name + ": " + e);
		}
	}

	/**
	 * A part of the screen around a point (fractions of the screen, the box `w`×`h` GUI pixels
	 * kept inside it).
	 */
	private void region(ClientGameTestContext context, String name, double fx, double fy, int w, int h) {
		try {
			int[] box = context.computeOnClient(mc -> {
				TestHooks.onlyModules();
				gameParts(true);
				int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
				int x = (int) Math.round(fx * sw - w / 2.0), y = (int) Math.round(fy * sh - h / 2.0);
				x = Math.max(0, Math.min(sw - w, x));
				y = Math.max(0, Math.min(sh - h, y));
				return new int[] { x, y, w, h };
			});
			context.waitTicks(2);
			context.takeScreenshot("wiki-" + name);
			boxes.add(name + " " + box[0] * GUI + " " + box[1] * GUI + " " + box[2] * GUI + " " + box[3] * GUI);
		} catch (RuntimeException e) {
			failed.add(name + ": " + e);
		}
	}

	/** The whole screen. */
	private void full(ClientGameTestContext context, String name) {
		try {
			context.takeScreenshot("wiki-" + name);
			boxes.add(name + " full");
		} catch (RuntimeException e) {
			failed.add(name + ": " + e);
		}
	}

	/** The game in this language, once its resources are loaded again. */
	private static void language(ClientGameTestContext context, String code) {
		var done = context.computeOnClient(mc -> TestHooks.language(code));
		for (int i = 0; i < 600 && (!done.isDone() || context.computeOnClient(mc -> TestHooks.reloading())); i++) context.waitTick();
		context.waitTicks(10);
	}

	private void writeBoxes() {
		try {
			var dir = FabricLoader.getInstance().getGameDir().resolve("screenshots");
			Files.createDirectories(dir);
			Files.writeString(dir.resolve("wiki-boxes.txt"), String.join("\n", boxes) + "\n", StandardCharsets.UTF_8);
		} catch (IOException e) {
			failed.add("wiki-boxes.txt: " + e);
		}
	}
}
