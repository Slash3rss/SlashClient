package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.players.TabStatus;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * Statuses from the tab list: SkyUp's rule as the server serves it (seeded there), read from SkyUp's
 * real header (colours, » «) set on the game's tab list; every sector, the lobby, a strange header
 * and another server. Then the friends window with a friend on SkyUp in sector S3, on the list and in
 * the chat's header ("Gra na SkyUp.pl · S3 (Wyspy)"). The layout audit runs over it.
 * A dungeon's level comes from the boss bar ("Dungeon poz. 3"), for Discord's small picture.
 * A job from the boss bar is a variant: it changes the status only after its 10 seconds on screen, a job
 * shown for a moment does not, and in a dungeon the dungeon stays.
 */
public class GameTabStatus implements FabricClientGameTest {
	private static final String ALA = "ala-sky", BOB = "bob-menu";

	/** The rules JSON as GET /v1/status-rules gives SkyUp's (server/src/statusRules.ts, SKYUP_RULE). */
	static String rulesJson() {
		JsonObject rule = new JsonObject();
		rule.addProperty("server", "skyup.pl");
		rule.addProperty("name", "SkyUp.pl");
		rule.addProperty("strip", "»« ");
		JsonArray ex = new JsonArray();
		ex.add(extractor(1, "^Sky[Uu][Pp] - (?<mode>[^»«]{1,32})$"));
		ex.add(extractor(2, "^(?<sector>LOBBY|Lobby|S\\d{1,2}(?: \\([^()]{1,24}\\))?)$"));
		JsonObject dungeon = extractor(0, "Dungeon\\s+poz\\.?\\s*(?<dungeon>\\d{1,3})");
		dungeon.addProperty("source", "bossbar");
		ex.add(dungeon);
		JsonObject job = extractor(0, "Praca: (?<job>\\w{1,20})(?: poz\\. (?<jobLevel>\\d{1,3}))?");
		job.addProperty("source", "bossbar");
		ex.add(job);
		rule.add("extractors", ex);
		JsonObject discord = new JsonObject();
		discord.addProperty("badgeWhen", "dungeon");
		rule.add("discord", discord);
		JsonObject working = new JsonObject();
		working.addProperty("when", "job");
		working.addProperty("hold", 10);
		working.addProperty("template", "{sector} · {job} poz. {jobLevel}");
		JsonArray variants = new JsonArray();
		variants.add(working);
		rule.add("variants", variants);
		JsonObject map = new JsonObject();
		map.addProperty("LOBBY", "Lobby");
		rule.add("map", map);
		rule.addProperty("template", "{sector}");
		JsonArray rules = new JsonArray();
		rules.add(rule);
		JsonObject root = new JsonObject();
		root.addProperty("version", "test");
		root.add("rules", rules);
		return root.toString();
	}

	private static JsonObject extractor(int line, String pattern) {
		JsonObject x = new JsonObject();
		x.addProperty("source", "header");
		x.addProperty("line", line);
		x.addProperty("pattern", pattern);
		return x;
	}

	/** SkyUp's header as its server builds it: coloured parts, the sector on the second line. */
	private static Component header(String sector) {
		return Component.literal("» ").withStyle(ChatFormatting.DARK_GRAY)
			.append(Component.literal("SkyUP").withStyle(ChatFormatting.AQUA, ChatFormatting.BOLD))
			.append(Component.literal(" - ").withStyle(ChatFormatting.GRAY))
			.append(Component.literal("AnyBlock").withStyle(ChatFormatting.WHITE))
			.append(Component.literal(" «\n» ").withStyle(ChatFormatting.DARK_GRAY))
			.append(Component.literal(sector).withStyle(ChatFormatting.YELLOW))
			.append(Component.literal(" «").withStyle(ChatFormatting.DARK_GRAY));
	}

	private static final Component FOOTER = Component.literal("🕐 16:45:54 | ⇄ 81ms\n» Discord: dc.skyup.pl «\n» Strona: skyup.pl «").withStyle(ChatFormatting.GRAY);

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> TabStatus.rulesForTest(rulesJson()));

			String[][] cases = {{"S0 (Spawn)", "S0 (Spawn)"}, {"S3 (Wyspy)", "S3 (Wyspy)"}, {"S7 (Wyspy)", "S7 (Wyspy)"}, {"S8 (Dungeon)", "S8 (Dungeon)"},
				{"S9 (Event)", "S9 (Event)"}, {"S10 (Budowlany)", "S10 (Budowlany)"}, {"S11 (Testowy)", "S11 (Testowy)"}, {"LOBBY", "Lobby"}};
			for (String[] c : cases) {
				String got = context.computeOnClient(mc -> {
					var tab = Compat.tabList(mc);
					tab.setHeader(header(c[0]));
					tab.setFooter(FOOTER);
					return TabStatus.readTabForTest(mc, "play.SkyUp.pl:25565");
				});
				if (!c[1].equals(got)) throw new AssertionError("Sector " + c[0] + " read as '" + got + "'");
			}
			// legacy § codes in the text itself, as some plugins send them
			String legacy = context.computeOnClient(mc -> TabStatus.readForTest("skyup.pl", "§8» §b§lSkyUP §7- §fAnyBlock §8«\n§8» §eS8 (Dungeon) §8«", ""));
			if (!"S8 (Dungeon)".equals(legacy)) throw new AssertionError("Legacy formatting read as '" + legacy + "'");
			// a header that is not SkyUp's sectors, and another server: nothing
			String strange = context.computeOnClient(mc -> TabStatus.readForTest("skyup.pl", "Witaj!\nGraczy online: 81", ""));
			if (!strange.isEmpty()) throw new AssertionError("A strange header gave '" + strange + "'");
			String other = context.computeOnClient(mc -> TabStatus.readForTest("mc.example.com", "» SkyUP - AnyBlock «\n» S3 (Wyspy) «", ""));
			if (!other.isEmpty()) throw new AssertionError("Another server gave '" + other + "'");

			// a job from the boss bar: only after 10 s on screen, a moment of it changes nothing
			String isles = "» SkyUP - AnyBlock «\n» S3 (Wyspy) «", dng = "» SkyUP - AnyBlock «\n» S8 (Dungeon) «";
			long t = 1_000_000;
			String[][] steps = {
				{isles, "", "0", "S3 (Wyspy)"}, {isles, "Praca: Gornik poz. 7", "1", "S3 (Wyspy)"}, {isles, "", "3", "S3 (Wyspy)"},
				{isles, "Praca: Gornik poz. 7", "4", "S3 (Wyspy)"}, {isles, "Praca: Gornik poz. 7", "13", "S3 (Wyspy)"},
				{isles, "Praca: Gornik poz. 7", "14", "S3 (Wyspy) · Gornik poz. 7"},
				// another job starts its time again
				{isles, "Praca: Drwal poz. 2", "15", "S3 (Wyspy)"}, {isles, "Praca: Drwal poz. 2", "25", "S3 (Wyspy) · Drwal poz. 2"},
				// in a dungeon the job does not take its place
				{dng, "Praca: Drwal poz. 2\nDungeon poz. 3", "26", "S8 (Dungeon)"}};
			for (int i = 0; i < steps.length; i++) {
				String[] st = steps[i];
				boolean first = i == 0;
				long at = t + Long.parseLong(st[2]) * 1000;
				String got = context.computeOnClient(mc -> TabStatus.heldForTest("skyup.pl", st[0], "", st[1], at, first));
				if (!st[3].equals(got)) throw new AssertionError("At " + st[2] + " s with '" + st[1] + "' the status is '" + got + "', not '" + st[3] + "'");
			}

			// in a dungeon: the boss bar says its level
			context.runOnClient(mc -> Compat.tabList(mc).setHeader(header("S8 (Dungeon)")));
			world.getServer().runCommand("bossbar add slashtest:dng \"Dungeon poz. 3\"");
			world.getServer().runCommand("bossbar set slashtest:dng players @a");
			context.waitTicks(10);
			String inDungeon = context.computeOnClient(mc -> TabStatus.valuesOnScreenForTest(mc, "skyup.pl"));
			if (!inDungeon.contains("dungeon=3") || !inDungeon.contains("sector=S8 (Dungeon)")) throw new AssertionError("In a dungeon the values are " + inDungeon);
			world.getServer().runCommand("bossbar remove slashtest:dng");
			context.waitTicks(10);
			String left = context.computeOnClient(mc -> TabStatus.valuesOnScreenForTest(mc, "skyup.pl"));
			if (left.contains("dungeon")) throw new AssertionError("Out of the dungeon the values are " + left);

			// the tab list with SkyUp's header, held open
			context.runOnClient(mc -> {
				var tab = Compat.tabList(mc);
				tab.setHeader(header("S3 (Wyspy)"));
				tab.setFooter(FOOTER);
			});

			// the friends window: Ala on SkyUp in sector S3, on the list and in her chat's header
			long now = System.currentTimeMillis();
			context.runOnClient(mc -> {
				Social.sampleForTest(List.of(
					new Social.Friend(ALA, "AlaGra", "alagra", "online", "server", "play.skyup.pl", 0, now),
					new Social.Friend(BOB, "BobMenu", "bobmenu", "online", "menu", "", 0, now - 60_000)),
					List.of(new Social.Message(1, ALA, "me", "Jestem na wyspach, wbijaj!", now - 120_000, true, "", "", "", null, null)), "me");
				Social.detailForTest(ALA, "SkyUp.pl", "S3 (Wyspy)");
			});
			String line = context.computeOnClient(mc -> Social.activity(Social.friend(ALA)).getString());
			if (!line.contains("SkyUp.pl") || !line.contains("S3 (Wyspy)")) throw new AssertionError("The friend's status line is '" + line + "'");
			// two friend requests on top of the list, to take or turn down from the game
			context.runOnClient(mc -> Social.incomingForTest(List.of(new Social.Request("u-zosia", "Zosia", "zosia"), new Social.Request("u-marek", "MarekBudowniczy", "marek_b"))));
			context.runOnClient(mc -> TestHooks.audit(true));
			context.setScreen(() -> {
				Social.viewing = ALA;
				return new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("friends-tab-status");

			context.runOnClient(mc -> TestHooks.reportAudit());
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems in the friends window with a tab status:\n" + problems);

			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				Social.viewing = null;
				var tab = Compat.tabList(mc);
				tab.setHeader(null);
				tab.setFooter(null);
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
