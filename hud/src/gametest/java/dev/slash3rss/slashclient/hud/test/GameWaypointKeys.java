package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.map.DeathPoint;
import dev.slash3rss.slashclient.hud.TabStatus;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.map.WaypointKeys;
import dev.slash3rss.slashclient.hud.map.WaypointKeysTestHooks;
import dev.slash3rss.slashclient.hud.map.Waypoints;
import dev.slash3rss.slashclient.hud.map.WaypointsScreen;
import dev.slash3rss.slashclient.hud.social.SharedWaypoints;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.storage.LevelResource;

import java.nio.file.Files;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Waypoint keys: server addresses written one way (case, port 25565, a dot at the end, an
 * international name), the old file's lists of one server put together with a backup kept, a
 * singleplayer world kept by its folder (its points under the old name moved there, not when two
 * worlds share the name), the modes of a server network read from SkyUp's tab list (new points per
 * mode, the points from before in every mode, "only this mode", the death point and the explored map
 * per mode, the split switched off), shared points carrying the server and the mode, and the screen:
 * the place over the list, "Move…" with its list of other places, clicked.
 */
public class GameWaypointKeys implements FabricClientGameTest {
	private static final String OVERWORLD = "ResourceKey[minecraft:dimension / minecraft:overworld]";
	private static final String S3 = "server:skyup.pl#anyblock · s3 (wyspy)", S0 = "server:skyup.pl#anyblock · s0 (spawn)";

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		normalisation(context);
		// a name no other world in the test folder has: its points under the name move to the folder by themselves
		String name = "Waypointy " + Long.toString(System.currentTimeMillis(), 36);
		try (TestSingleplayerContext world = context.worldBuilder().adjustSettings(s -> s.setName(name)).create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("gamemode creative @a");
			String before = context.computeOnClient(mc -> read(WaypointKeysTestHooks.file()));
			try {
				migration(context);
				singleplayer(context);
				modes(context);
				sharing(context);
				screens(context);
			} finally {
				context.setScreen(() -> null);
				context.runOnClient(mc -> {
					WaypointKeys.resetForTest();
					WaypointKeys.setSplit("server:skyup.pl", true);
					TabStatus.rulesForTest("{\"rules\":[]}");
					var tab = Compat.tabList(mc);
					tab.setHeader(null);
					tab.setFooter(null);
					try {
						if (before == null) Files.deleteIfExists(WaypointKeysTestHooks.file());
						else WaypointKeysTestHooks.write(before);
					} catch (Exception e) {
						throw new RuntimeException(e);
					}
					WaypointKeysTestHooks.reload();
				});
			}
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static String read(java.nio.file.Path p) {
		try {
			return Files.exists(p) ? Files.readString(p) : null;
		} catch (Exception e) {
			throw new RuntimeException(e);
		}
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	private static void same(Object want, Object got, String what) {
		if (!Objects.equals(want, got)) throw new AssertionError(what + ": expected '" + want + "', got '" + got + "'");
	}

	// ---------- addresses ----------

	private static void normalisation(ClientGameTestContext context) {
		context.runOnClient(mc -> {
			for (String a : new String[] { "skyup.pl", "SkyUp.pl", "skyup.pl:25565", "SKYUP.PL.", "skyup.pl.:25565", " skyup.pl ", "skyup.pl..", "skyup.pl:" })
				same("skyup.pl", WaypointKeys.address(a), "Address " + a);
			same("server:skyup.pl", WaypointKeys.serverKey("SkyUp.pl:25565"), "The server's key");
			same("play.skyup.pl", WaypointKeys.address("Play.SkyUp.pl:25565"), "A subdomain stays itself");
			same("skyup.pl:25566", WaypointKeys.address("SkyUp.pl:25566"), "Another port stays");
			same("[::1]", WaypointKeys.address("[::1]:25565"), "IPv6 with the default port");
			same("[::1]:25570", WaypointKeys.address("[::1]:25570"), "IPv6 with a port");
			String idn = WaypointKeys.address("Zażółć.pl");
			check(idn.startsWith("xn--") && idn.endsWith(".pl") && idn.chars().allMatch(c -> c < 128), "An international name in ASCII: " + idn);
			same(idn, WaypointKeys.address("zażółć.pl.:25565"), "An international name, any spelling");
			same(idn, WaypointKeys.address(idn.toUpperCase(java.util.Locale.ROOT)), "An international name and its ASCII form");
			same("server:skyup.pl#anyblock · s3 (wyspy)", WaypointKeys.normalize("server:SkyUp.pl:25565#AnyBlock · S3 (Wyspy)"), "A key with a mode");
			same("save:Nowy świat", WaypointKeys.normalize("save:Nowy świat"), "A world's key stays as it is");
			same("world:Mój Świat", WaypointKeys.normalize("world:Mój Świat"), "An old world key stays as it is");
		});
	}

	// ---------- the old file ----------

	private static String point(String name, int x) {
		return "{\"name\":\"" + name + "\",\"x\":" + x + ",\"y\":70,\"z\":" + (x * 2) + ",\"dimension\":\"" + OVERWORLD + "\",\"color\":-10443526,\"visible\":true,\"death\":false}";
	}

	private static void migration(ClientGameTestContext context) {
		String old = "{\n"
			+ "  \"server:SkyUp.pl\": [" + point("A", 1) + "],\n"
			+ "  \"server:skyup.pl:25565\": [" + point("B", 2) + "," + point("A", 1) + "],\n"
			+ "  \"server:skyup.pl.\": [" + point("C", 3) + "],\n"
			+ "  \"server:play.skyup.pl\": [" + point("P", 4) + "],\n"
			+ "  \"world:Stara nazwa\": [" + point("W", 5) + "]\n"
			+ "}";
		context.runOnClient(mc -> {
			try {
				Files.deleteIfExists(WaypointKeysTestHooks.backup());
				WaypointKeysTestHooks.write(old);
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
			WaypointKeysTestHooks.reload();
			same("A,B,C", WaypointKeysTestHooks.names("server:skyup.pl"), "Lists of one server put together");
			same("P", WaypointKeysTestHooks.names("server:play.skyup.pl"), "A subdomain kept apart");
			same("W", WaypointKeysTestHooks.names("world:Stara nazwa"), "An old world key left");
			for (String k : List.of("server:SkyUp.pl", "server:skyup.pl:25565", "server:skyup.pl."))
				check(!WaypointKeysTestHooks.lists().containsKey(k), "Old spelling still there: " + k);
			same(old, read(WaypointKeysTestHooks.backup()), "The backup is the file from before");
			String now = read(WaypointKeysTestHooks.file());
			check(now.contains("\"server:skyup.pl\"") && !now.contains("server:SkyUp.pl"), "The file written with one spelling: " + now);
			// read again: nothing more changes, the backup stays the first one
			WaypointKeysTestHooks.reload();
			same("A,B,C", WaypointKeysTestHooks.names("server:skyup.pl"), "Read again");
			same(old, read(WaypointKeysTestHooks.backup()), "The backup is kept once");
		});
	}

	// ---------- singleplayer ----------

	private static void singleplayer(ClientGameTestContext context) {
		String[] world = context.computeOnClient(mc -> {
			var server = mc.getSingleplayerServer();
			String folder = server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().getFileName().toString();
			return new String[] { folder, server.getWorldData().getLevelName() };
		});
		String base = "save:" + world[0];
		System.out.println("SlashClient test: world folder '" + world[0] + "', name '" + world[1] + "'");
		context.runOnClient(mc -> {
			same(base, WaypointKeys.baseKey(mc), "A singleplayer world is its folder");
			same(base, Waypoints.worldKey(mc), "No mode in singleplayer");
			same("world:" + world[1], WaypointKeys.sharedWorld(mc), "Shared as the world's name, as older SlashClients read it");
			// points under the world's name from before: moved to its folder when it opens
			WaypointKeysTestHooks.lists().remove(base);
			WaypointKeysTestHooks.lists().put("world:" + world[1], new ArrayList<>(List.of(WaypointKeysTestHooks.point("Stary dom", 10, 10))));
			WaypointKeysTestHooks.rerunSingleplayer();
		});
		context.waitTicks(40);
		context.runOnClient(mc -> {
			same("Stary dom", WaypointKeysTestHooks.names(base), "Points under the name moved to the folder");
			check(!WaypointKeysTestHooks.lists().containsKey("world:" + world[1]), "The name's list is gone");
			same("Stary dom", WaypointKeysTestHooks.shown(mc), "Shown in the world");
			// a rename: the key stays the folder, the name shown follows
			WaypointKeys.rememberName(world[0], "Nowa nazwa");
			same("Nowa nazwa", WaypointKeys.describe(WaypointKeys.baseKey(mc)), "The new name shown");
			same(base, WaypointKeys.baseKey(mc), "The key after a rename");
			WaypointKeys.rememberName(world[0], world[1]);
			// two worlds of one name: nothing moved by itself
			Map<String, List<Waypoints.Point>> map = new LinkedHashMap<>();
			map.put("world:Dwa", new ArrayList<>(List.of(WaypointKeysTestHooks.point("X", 1, 1))));
			check(!WaypointKeys.moveOldWorld(map, "Dwa", "Dwa", List.of("Dwa", "Dwa (1)")), "Moved although two worlds have the name");
			check(map.containsKey("world:Dwa") && !map.containsKey("save:Dwa"), "Two worlds of one name: left for the move by hand");
			check(WaypointKeys.moveOldWorld(map, "Dwa (1)", "Dwa", List.of("Dwa (1)")), "One world of the name: moved");
			same(1, map.get("save:Dwa (1)").size(), "Moved to the folder");
			// the renamed world's old points wait in "Move…"
			check(WaypointKeys.others(mc).contains("world:Stara nazwa"), "The old name's points offered for the move: " + WaypointKeys.others(mc));
		});
	}

	// ---------- modes ----------

	private static Component header(String sector) {
		return Component.literal("» ").withStyle(ChatFormatting.DARK_GRAY)
			.append(Component.literal("SkyUP").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD))
			.append(Component.literal(" - ").withStyle(ChatFormatting.GRAY))
			.append(Component.literal("AnyBlock").withStyle(ChatFormatting.WHITE))
			.append(Component.literal(" «\n» ").withStyle(ChatFormatting.DARK_GRAY))
			.append(Component.literal(sector).withStyle(ChatFormatting.YELLOW))
			.append(Component.literal(" «").withStyle(ChatFormatting.DARK_GRAY));
	}

	private static void in(Minecraft mc, String sector) {
		Compat.tabList(mc).setHeader(header(sector));
		WaypointKeys.readModeNow(mc);
	}

	private static void modes(ClientGameTestContext context) {
		context.runOnClient(mc -> {
			WaypointKeys.serverForTest = "SkyUp.pl:25565";
			TabStatus.rulesForTest(GameTabStatus.rulesJson());
			Compat.tabList(mc).setHeader(null);
			WaypointKeys.readModeNow(mc);
			// no header yet: the server's own list, as on a server without modes
			same(null, WaypointKeys.mode(mc), "A mode without a header");
			same("server:skyup.pl", Waypoints.worldKey(mc), "The key without a mode");
			same("A,B,C", WaypointKeysTestHooks.shown(mc), "The points from before");

			in(mc, "S3 (Wyspy)");
			same("AnyBlock · S3 (Wyspy)", WaypointKeys.mode(mc), "SkyUp's mode");
			same(S3, Waypoints.worldKey(mc), "The key with the mode");
			same("skyup.pl · AnyBlock · S3 (Wyspy)", WaypointKeys.describe(Waypoints.worldKey(mc)), "The key as shown");
			mc.player.setPos(100, 80, 100);
			Waypoints.add(mc, "Wyspa");
			same("Wyspa", WaypointKeysTestHooks.names(S3), "A new point belongs to the mode");
			same("Wyspa,A,B,C", WaypointKeysTestHooks.shown(mc), "The mode's points and those from before");

			in(mc, "S0 (Spawn)");
			same(S0, Waypoints.worldKey(mc), "Another mode");
			same("A,B,C", WaypointKeysTestHooks.shown(mc), "Another mode: not the other mode's point, those from before still");
			Waypoints.add(mc, "Spawn");

			in(mc, "LOBBY");
			same("AnyBlock · Lobby", WaypointKeys.mode(mc), "The lobby");

			in(mc, "S3 (Wyspy)");
			same("Wyspa,A,B,C", WaypointKeysTestHooks.shown(mc), "Back in S3");
			// "only this mode"
			WaypointKeys.onlyThisMode(mc, WaypointKeysTestHooks.find(mc, "A"));
			same("Wyspa,A", WaypointKeysTestHooks.names(S3), "A given to S3");
			check(!WaypointKeys.everyMode(mc, WaypointKeysTestHooks.find(mc, "A")) && WaypointKeys.everyMode(mc, WaypointKeysTestHooks.find(mc, "B")), "Every mode or this one");
			in(mc, "S0 (Spawn)");
			same("Spawn,B,C", WaypointKeysTestHooks.shown(mc), "A gone from S0");

			// a death in S0: its point there, none in S3
			WaypointKeysTestHooks.placeDeath(mc);
			check(DeathPoint.current(mc) != null && WaypointKeysTestHooks.lists().get(S0).stream().anyMatch(p -> p.death), "A death point in S0");
			in(mc, "S3 (Wyspy)");
			same(null, DeathPoint.current(mc), "No death point of S0 in S3");
		});
		// the explored map follows the mode
		context.waitTicks(5);
		context.runOnClient(mc -> {
			same(S3, WaypointKeysTestHooks.exploredWorld(), "The explored map's key");
			in(mc, "S0 (Spawn)");
		});
		context.waitTicks(5);
		context.runOnClient(mc -> {
			same(S0, WaypointKeysTestHooks.exploredWorld(), "The explored map's key in another mode");
			// the split switched off: one list for the server again, every mode's points shown
			WaypointKeys.setSplit("server:skyup.pl", false);
			same("server:skyup.pl", Waypoints.worldKey(mc), "No split: the server's key");
			String shown = WaypointKeysTestHooks.shown(mc);
			for (String n : List.of("Wyspa", "A", "B", "C", "Spawn")) check(shown.contains(n), "No split: " + n + " shown (" + shown + ")");
			same(S0, WaypointKeys.terrainKey(mc), "The explored map stays per mode");
			WaypointKeys.setSplit("server:skyup.pl", true);
			// a server where the tab list says no mode: one list, as before
			WaypointKeys.serverForTest = "mc.example.com";
			WaypointKeys.readModeNow(mc);
			same(null, WaypointKeys.mode(mc), "No mode on another server");
			same("server:mc.example.com", Waypoints.worldKey(mc), "Another server's key");
			WaypointKeys.serverForTest = "skyup.pl";
			in(mc, "S3 (Wyspy)");
		});
	}

	// ---------- shared points ----------

	private static void sharing(ClientGameTestContext context) {
		context.runOnClient(mc -> {
			String own = SharedWaypoints.bodyForTest(mc, WaypointKeysTestHooks.find(mc, "Wyspa"));
			check(own.contains("\"world\":\"server:skyup.pl\"") && own.contains("\"mode\":\"AnyBlock · S3 (Wyspy)\""), "A mode's point shared: " + own);
			String every = SharedWaypoints.bodyForTest(mc, WaypointKeysTestHooks.find(mc, "B"));
			check(every.contains("\"world\":\"server:skyup.pl\"") && !every.contains("\"mode\""), "A point of every mode shared: " + every);
			// from a friend in another mode, under another spelling of the server
			SharedWaypoints.Received r = new SharedWaypoints.Received();
			r.id = 9001;
			r.from = "Kumpel";
			r.name = "Od kumpla";
			r.x = 5;
			r.y = 70;
			r.z = 5;
			r.dimension = "minecraft:overworld";
			r.world = "server:SKYUP.PL:25565";
			r.mode = "AnyBlock · S0 (Spawn)";
			SharedWaypoints.accept(r);
			check(WaypointKeysTestHooks.names(S0).contains("Od kumpla"), "A friend's point into its mode: " + WaypointKeysTestHooks.names(S0));
			// from an older SlashClient: no mode, so every mode
			r.id = 9002;
			r.name = "Stary klient";
			r.mode = null;
			SharedWaypoints.accept(r);
			check(WaypointKeysTestHooks.names("server:skyup.pl").contains("Stary klient"), "An older client's point into every mode");
			same("skyup.pl · AnyBlock · S0 (Spawn)", SharedWaypoints.worldName("server:SkyUp.pl", "AnyBlock · S0 (Spawn)"), "A received point's place");
		});
	}

	// ---------- the screen ----------

	private static void click(ClientGameTestContext context, int[] gui) {
		double scale = context.computeOnClient(mc -> mc.getWindow().getGuiScale());
		context.getInput().setCursorPos(gui[0] * scale, gui[1] * scale);
		context.waitTicks(2);
		context.getInput().pressMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(3);
	}

	private static void screens(ClientGameTestContext context) {
		context.runOnClient(mc -> TestHooks.audit(true));
		context.setScreen(WaypointsScreen::new);
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(10);
		context.takeScreenshot("waypoints-keys-mode");
		// "only this mode" clicked on B, with its hint over the button
		int[] lock = context.computeOnClient(mc -> ((WaypointsScreen) Compat.screen(mc)).spot("mode:B"));
		check(lock != null, "No \"only this mode\" button on B");
		double scale = context.computeOnClient(mc -> mc.getWindow().getGuiScale());
		context.getInput().setCursorPos(lock[0] * scale, lock[1] * scale);
		context.waitTicks(5);
		context.takeScreenshot("waypoints-keys-only-this-mode");
		click(context, lock);
		check(context.computeOnClient(mc -> WaypointKeysTestHooks.names(S3)).contains("B"), "B given to S3 by the button");

		// "Move…": the other places, and one moved here with its button
		int[] move = context.computeOnClient(mc -> ((WaypointsScreen) Compat.screen(mc)).spot("move"));
		click(context, move);
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(5);
		context.takeScreenshot("waypoints-keys-move");
		int[] here = context.computeOnClient(mc -> ((WaypointsScreen) Compat.screen(mc)).spot("moveHere:server:play.skyup.pl"));
		check(here != null, "play.skyup.pl not offered for the move");
		click(context, here);
		context.runOnClient(mc -> {
			check(WaypointKeysTestHooks.names("server:skyup.pl").contains("P"), "play.skyup.pl's point moved to skyup.pl");
			check(!WaypointKeysTestHooks.lists().containsKey("server:play.skyup.pl"), "play.skyup.pl's list gone");
			check(WaypointKeysTestHooks.shown(mc).contains("P"), "The moved point shows in this mode");
		});
		context.getInput().setCursorPos(5, 5);
		context.waitTicks(5);
		context.takeScreenshot("waypoints-keys-moved");

		context.runOnClient(mc -> TestHooks.reportAudit());
		String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
		context.runOnClient(mc -> TestHooks.audit(false));
		if (!problems.isEmpty()) throw new AssertionError("Layout problems in the waypoints window:\n" + problems);
	}
}
