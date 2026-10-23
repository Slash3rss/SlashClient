package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.loader.api.FabricLoader;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Which tests this game runs: all of them, only the ones named (-Ptests=GameProps,HudScreenshots)
 * or its share of a run split over several games side by side (-Pshard=2/4, gametest.sh). A test
 * not run here returns at once, on the vanilla title screen like every test ends. Each test also
 * logs how long the one before it took, to keep the shares even.
 */
final class TestFilter {
	private TestFilter() {}

	/** Seconds per test on 26.3 as logged (a new one counts as DEFAULT), for splitting into even shares. */
	private static final Map<String, Integer> SECONDS = Map.ofEntries(
		Map.entry("GameCosmeticsScreen", 189), Map.entry("HudScreenshots", 73), Map.entry("WebsiteShots", 69),
		Map.entry("GameWorldAids", 47), Map.entry("GameBenchmark", 37), Map.entry("GameBenchScene", 90), Map.entry("GameKillEffects", 33),
		Map.entry("GameRingMoves", 30), Map.entry("GameAutumnLeaves", 35), Map.entry("GameMinimap", 30), Map.entry("GameHeadwear", 29),
		Map.entry("GameLimbWear", 29), Map.entry("GameDungeon", 27), Map.entry("GameSuits", 27),
		Map.entry("GameCosmetics", 26), Map.entry("GameGear", 24), Map.entry("GameAllCosmetics", 23),
		Map.entry("GameExtras", 18), Map.entry("GameStreamChat", 18), Map.entry("GameHeldSkins", 17),
		Map.entry("FriendsChat", 16), Map.entry("GameProps", 15), Map.entry("GameFriendExtras", 14),
		Map.entry("GameClothing", 11), Map.entry("GameInventoryTools", 11), Map.entry("GameServerPacks", 11),
		Map.entry("GameSkyTasks", 11), Map.entry("GameSkyCase", 10), Map.entry("GameAutoClicker", 8), Map.entry("GameHudParts", 10), Map.entry("GameClips", 9), Map.entry("GameReplay", 30),
		Map.entry("GameSprays", 8), Map.entry("GameGroupsClans", 7), Map.entry("GameModules", 7),
		Map.entry("GameServerLayouts", 7), Map.entry("GameHandView", 6), Map.entry("GameLiveCosmetics", 6),
		Map.entry("GameAids", 5), Map.entry("GameLootHighlight", 20), Map.entry("GameHideArmor", 9), Map.entry("GameHitMarker", 15), Map.entry("GameWaypointKeys", 15), Map.entry("GameChatCoords", 15), Map.entry("GameSessionRenew", 12));
	private static final int DEFAULT = 25;

	private static Set<String> mine;
	private static long lastStart;
	private static String lastName;

	/** True when this test is not this game's: it has already gone back to the title screen. */
	static boolean skip(ClientGameTestContext context, Class<? extends FabricClientGameTest> test) {
		String name = test.getSimpleName();
		long now = System.currentTimeMillis();
		if (lastName != null) System.out.printf("SlashClient test time: %s %d s%n", lastName, (now - lastStart) / 1000);
		if (mine == null) {
			mine = choose();
			// the last test's time, when the game closes
			Runtime.getRuntime().addShutdownHook(new Thread(() -> {
				if (lastName != null) System.out.printf("SlashClient test time: %s %d s%n", lastName, (System.currentTimeMillis() - lastStart) / 1000);
			}));
		}
		if (mine.contains(name)) {
			lastName = name;
			lastStart = now;
			return false;
		}
		lastName = null;
		context.runOnClient(mc -> TestHooks.vanillaMenu());
		return true;
	}

	private static Set<String> choose() {
		List<String> all = new ArrayList<>();
		for (var e : FabricLoader.getInstance().getEntrypointContainers("fabric-client-gametest", FabricClientGameTest.class)) {
			if (e.getProvider().getMetadata().getId().equals("slashclient-hud-test")) all.add(e.getEntrypoint().getClass().getSimpleName());
		}
		String only = System.getProperty("slashclient.test.only", "").trim();
		if (!only.isEmpty()) {
			Set<String> picked = new HashSet<>(Arrays.asList(only.split("\\s*,\\s*")));
			picked.removeIf(n -> !all.contains(n) && warn(n));
			all.removeIf(n -> !picked.contains(n));
		}
		String shard = System.getProperty("slashclient.test.shard", "").trim();
		if (!shard.matches("\\d+/\\d+")) return new HashSet<>(all);
		int part = Integer.parseInt(shard.split("/")[0]), parts = Integer.parseInt(shard.split("/")[1]);
		// the longest first, each to the share with the least time so far: the same split in every game
		List<String> order = new ArrayList<>(all);
		order.sort((a, b) -> Integer.compare(SECONDS.getOrDefault(b, DEFAULT), SECONDS.getOrDefault(a, DEFAULT)));
		int[] load = new int[parts];
		Set<String> picked = new HashSet<>();
		for (String n : order) {
			int to = 0;
			for (int i = 1; i < parts; i++) if (load[i] < load[to]) to = i;
			load[to] += SECONDS.getOrDefault(n, DEFAULT);
			if (to == part - 1) picked.add(n);
		}
		System.out.println("SlashClient tests in share " + shard + ": " + picked);
		return picked;
	}

	private static boolean warn(String name) {
		System.out.println("SlashClient tests: no test called " + name);
		return true;
	}
}
