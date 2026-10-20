package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.SkyCaseTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
//#endif

/**
 * SkyUp's case counter (26.3 only), with the real rewards of the owner's GUI dumps: wins from the
 * chat told to their case by the reward (one case gives it), by the case looked at last (more give
 * it) or left unassigned; preview windows updating what a case gives (a reward gone from it keeps
 * its wins, Platinum's two pages replace only once both were seen); a new case from its window;
 * the counts saved; then the HUD module and the detail window.
 */
public class GameSkyCase implements FabricClientGameTest {
	//#if MC >= 26.3
	/** Górniczy's preview without "Krzemień" (as if SkyUp took it out). */
	private static final String[] GORNICZY = {
		"minecraft:quartz|♦ Klejnot klucznika ♦|1", "minecraft:paper|Kask Górnika|1", "minecraft:copper_ingot|Sztabka miedzi|1", "minecraft:experience_bottle|5x Zaklęta butelka|5",
		"minecraft:experience_bottle|7x Zaklęta butelka|7", "minecraft:experience_bottle|9x Zaklęta butelka|9", "minecraft:experience_bottle|11x Zaklęta butelka|11", "minecraft:experience_bottle|13x Zaklęta butelka|13",
		"minecraft:cobblestone|64x Bruk|64", "minecraft:iron_ingot|Sztabka żelaza|1", "minecraft:iron_ingot|2x Sztabka żelaza|2", "minecraft:iron_ingot|3x Sztabka żelaza|3",
		"minecraft:iron_ingot|4x Sztabka żelaza|4", "minecraft:iron_ingot|5x Sztabka żelaza|5", "minecraft:gold_ingot|Sztabka złota|1", "minecraft:gold_ingot|2x Sztabka złota|2",
		"minecraft:gold_ingot|3x Sztabka złota|3", "minecraft:gold_ingot|4x Sztabka złota|4", "minecraft:gold_ingot|5x Sztabka złota|5", "minecraft:diamond|Diament|1",
		"minecraft:diamond|2x Diament|2", "minecraft:diamond|3x Diament|3", "minecraft:diamond|4x Diament|4", "minecraft:diamond|5x Diament|5",
		"minecraft:emerald|Szmaragd|1", "minecraft:emerald|2x Szmaragd|2", "minecraft:emerald|3x Szmaragd|3", "minecraft:emerald|4x Szmaragd|4",
		"minecraft:emerald|5x Szmaragd|5", "minecraft:redstone|Sproszkowany redstone|1", "minecraft:redstone|2x Sproszkowany redstone|2", "minecraft:redstone|3x Sproszkowany redstone|3",
		"minecraft:redstone|4x Sproszkowany redstone|4", "minecraft:redstone|5x Sproszkowany redstone|5", "minecraft:torch|16x Pochodnia|16" };
	private static final String[] LOWIECKI = {
		"minecraft:quartz|♦ Klejnot klucznika ♦|1", "minecraft:paper|Bandana Łowcy|1", "minecraft:potion|Specjał Awanturnika|1", "minecraft:potion|Wywar Topornika|1",
		"minecraft:potion|Mikstura Knura|1", "minecraft:splash_potion|Dekot Arcylisza|1", "minecraft:potion|Wsparcie Komandosa|1", "minecraft:splash_potion|Jad Tarantuli|1",
		"minecraft:gold_ingot|5x Sztabka złota|5", "minecraft:diamond|Diament|1", "minecraft:diamond|2x Diament|2", "minecraft:diamond|3x Diament|3",
		"minecraft:diamond|4x Diament|4", "minecraft:honey_bottle|Butelka miodu|1", "minecraft:honey_bottle|3x Butelka miodu|3", "minecraft:honey_bottle|5x Butelka miodu|5",
		"minecraft:cooked_beef|2x Pieczona wołowina|2", "minecraft:cooked_beef|3x Pieczona wołowina|3", "minecraft:rabbit_foot|Królicza łapka|1", "minecraft:rabbit_foot|3x Królicza łapka|3",
		"minecraft:ender_pearl|Enderperła|1", "minecraft:ender_pearl|2x Enderperła|2", "minecraft:ender_pearl|3x Enderperła|3", "minecraft:ender_pearl|4x Enderperła|4",
		"minecraft:ender_pearl|5x Enderperła|5", "minecraft:spider_eye|4x Oko pająka|4", "minecraft:blaze_rod|8x Płomienna różdżka|8", "minecraft:shield|Tarcza|1",
		"minecraft:totem_of_undying|Totem nieśmiertelności|1", "minecraft:experience_bottle|6x Zaklęta butelka|6", "minecraft:experience_bottle|7x Zaklęta butelka|7", "minecraft:experience_bottle|8x Zaklęta butelka|8",
		"minecraft:experience_bottle|9x Zaklęta butelka|9", "minecraft:experience_bottle|10x Zaklęta butelka|10", "minecraft:experience_bottle|11x Zaklęta butelka|11", "minecraft:experience_bottle|12x Zaklęta butelka|12" };
	/** Platinum's first page, whole and without "Blok redstone"; its second without "Siodło". */
	private static final String[] PLATINUM_1 = {
		"minecraft:player_head|Klucz do Elementium SkyCase|1", "minecraft:quartz|♦ Wzmocniony klejnot klucznika ♦|1", "minecraft:experience_bottle|5x Zaklęta butelka|5", "minecraft:experience_bottle|15x Zaklęta butelka|15",
		"minecraft:experience_bottle|25x Zaklęta butelka|25", "minecraft:experience_bottle|35x Zaklęta butelka|35", "minecraft:experience_bottle|45x Zaklęta butelka|45", "minecraft:experience_bottle|55x Zaklęta butelka|55",
		"minecraft:experience_bottle|64x Zaklęta butelka|64", "minecraft:emerald_block|Blok szmaragdu|1", "minecraft:emerald_block|2x Blok szmaragdu|2", "minecraft:emerald_block|3x Blok szmaragdu|3",
		"minecraft:emerald_block|4x Blok szmaragdu|4", "minecraft:emerald_block|5x Blok szmaragdu|5", "minecraft:gold_block|Blok złota|1", "minecraft:gold_block|2x Blok złota|2",
		"minecraft:gold_block|3x Blok złota|3", "minecraft:gold_block|4x Blok złota|4", "minecraft:gold_block|5x Blok złota|5", "minecraft:gold_block|6x Blok złota|6",
		"minecraft:gold_block|7x Blok złota|7", "minecraft:iron_block|Blok żelaza|1", "minecraft:iron_block|2x Blok żelaza|2", "minecraft:iron_block|3x Blok żelaza|3",
		"minecraft:iron_block|4x Blok żelaza|4", "minecraft:iron_block|5x Blok żelaza|5", "minecraft:iron_block|6x Blok żelaza|6", "minecraft:redstone_block|Blok redstone|1",
		"minecraft:redstone_block|2x Blok redstone|2", "minecraft:redstone_block|3x Blok redstone|3", "minecraft:redstone_block|4x Blok redstone|4", "minecraft:amethyst_shard|8x Odłamek ametystu|8",
		"minecraft:amethyst_shard|10x Odłamek ametystu|10", "minecraft:amethyst_shard|12x Odłamek ametystu|12", "minecraft:amethyst_shard|14x Odłamek ametystu|14", "minecraft:amethyst_shard|16x Odłamek ametystu|16" };
	private static final String[] PLATINUM_1_LESS = {
		"minecraft:player_head|Klucz do Elementium SkyCase|1", "minecraft:quartz|♦ Wzmocniony klejnot klucznika ♦|1", "minecraft:experience_bottle|5x Zaklęta butelka|5", "minecraft:experience_bottle|15x Zaklęta butelka|15",
		"minecraft:experience_bottle|25x Zaklęta butelka|25", "minecraft:experience_bottle|35x Zaklęta butelka|35", "minecraft:experience_bottle|45x Zaklęta butelka|45", "minecraft:experience_bottle|55x Zaklęta butelka|55",
		"minecraft:experience_bottle|64x Zaklęta butelka|64", "minecraft:emerald_block|Blok szmaragdu|1", "minecraft:emerald_block|2x Blok szmaragdu|2", "minecraft:emerald_block|3x Blok szmaragdu|3",
		"minecraft:emerald_block|4x Blok szmaragdu|4", "minecraft:emerald_block|5x Blok szmaragdu|5", "minecraft:gold_block|Blok złota|1", "minecraft:gold_block|2x Blok złota|2",
		"minecraft:gold_block|3x Blok złota|3", "minecraft:gold_block|4x Blok złota|4", "minecraft:gold_block|5x Blok złota|5", "minecraft:gold_block|6x Blok złota|6",
		"minecraft:gold_block|7x Blok złota|7", "minecraft:iron_block|Blok żelaza|1", "minecraft:iron_block|2x Blok żelaza|2", "minecraft:iron_block|3x Blok żelaza|3",
		"minecraft:iron_block|4x Blok żelaza|4", "minecraft:iron_block|5x Blok żelaza|5", "minecraft:iron_block|6x Blok żelaza|6", "minecraft:redstone_block|2x Blok redstone|2",
		"minecraft:redstone_block|3x Blok redstone|3", "minecraft:redstone_block|4x Blok redstone|4", "minecraft:amethyst_shard|8x Odłamek ametystu|8", "minecraft:amethyst_shard|10x Odłamek ametystu|10",
		"minecraft:amethyst_shard|12x Odłamek ametystu|12", "minecraft:amethyst_shard|14x Odłamek ametystu|14", "minecraft:amethyst_shard|16x Odłamek ametystu|16" };
	private static final String[] PLATINUM_2 = {
		"minecraft:dirt|10x Ziemia|10", "minecraft:dirt|15x Ziemia|15", "minecraft:dirt|20x Ziemia|20", "minecraft:dirt|25x Ziemia|25",
		"minecraft:dirt|30x Ziemia|30", "minecraft:grass_block|10x Blok trawy|10", "minecraft:grass_block|15x Blok trawy|15", "minecraft:grass_block|20x Blok trawy|20",
		"minecraft:grass_block|25x Blok trawy|25", "minecraft:sand|10x Piasek|10", "minecraft:sand|20x Piasek|20", "minecraft:sand|30x Piasek|30",
		"minecraft:gravel|10x Żwir|10", "minecraft:gravel|20x Żwir|20", "minecraft:gravel|30x Żwir|30", "minecraft:totem_of_undying|Totem nieśmiertelności|1",
		"minecraft:enchanted_book|Zaklęta książka (Naprawa I)|1", "minecraft:enchanted_book|Zaklęta książka (Wydajność IV)|1", "minecraft:enchanted_book|Zaklęta książka (Wydajność V)|1", "minecraft:enchanted_book|Zaklęta książka (Niezniszczalność III)|1",
		"minecraft:enchanted_book|Zaklęta książka (Szczęście III)|1", "minecraft:enchanted_book|Zaklęta książka (Ochrona IV)|1", "minecraft:enchanted_book|Zaklęta książka (Ostrość IV)|1", "minecraft:enchanted_book|Zaklęta książka (Ostrość V)|1",
		"minecraft:enchanted_book|Zaklęta książka (Zaklęty ogień II)|1", "minecraft:enchanted_book|Zaklęta książka (Jedwabny dotyk I)|1" };
	//#endif

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 26.3
		// the test ends on the game's own title screen
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.TestHooks.vanillaMenu());
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> SkyCaseTestHooks.reset());
			// the line as SkyUp writes it (with "&" codes), the count kept in the name, the decorations off
			parsed(context, "&6&lSkyCase &8&l» &e&aWygrano: &e5x Zaklęta butelka&a!", "5x Zaklęta butelka");
			parsed(context, "SkyCase » Wygrano: :: Karambit ::!", "Karambit");
			parsed(context, "SkyCase » Wygrano: ♦ Klejnot klucznika ♦!", "Klejnot klucznika");
			parsed(context, "SkyCase » Wygrano: Diament x4!", "4x Diament");
			parsed(context, "Wędkarstwo » Wyłowiono: Sum!", "null");

			// a reward only Górniczy gives, then ones more cases give: Górniczy's too, it was opened just now
			for (String r : new String[] { "Kask Górnika", "Diament", "Krzemień", "5x Zaklęta butelka", "13x Zaklęta butelka" }) context.runOnClient(mc -> SkyCaseTestHooks.win(r));
			// long after: "4x Diament" (Górniczy, Łowiecki, Czarodziejski) and the totem (Platinum, Łowiecki) are no case's
			context.runOnClient(mc -> SkyCaseTestHooks.forget());
			context.runOnClient(mc -> SkyCaseTestHooks.win("4x Diament"));
			context.runOnClient(mc -> SkyCaseTestHooks.win("Totem nieśmiertelności"));
			// Elementium's ":: Karambit ::", Drwalski's hat and then the key gem every job case gives
			context.runOnClient(mc -> SkyCaseTestHooks.win(":: Karambit ::"));
			context.runOnClient(mc -> SkyCaseTestHooks.win("Czapka Drwala"));
			context.runOnClient(mc -> SkyCaseTestHooks.win("♦ Klejnot klucznika ♦"));
			// Łowiecki's preview looked at: a diamond after it is Łowiecki's
			context.runOnClient(mc -> SkyCaseTestHooks.forget());
			context.runOnClient(mc -> SkyCaseTestHooks.preview("Łowiecki SkyCase", false, false, LOWIECKI));
			context.waitTicks(12);
			context.setScreen(() -> null);
			context.runOnClient(mc -> SkyCaseTestHooks.win("Diament"));
			// on another server nothing is counted
			context.runOnClient(mc -> SkyCaseTestHooks.onSkyUp(false));
			context.runOnClient(mc -> SkyCaseTestHooks.win("Kask Górnika"));
			context.runOnClient(mc -> SkyCaseTestHooks.onSkyUp(true));
			String counted = context.computeOnClient(mc -> SkyCaseTestHooks.counted());
			check(counted.contains("Górniczy: 5/5 {Kask Górnika=1, Diament=1, Krzemień=1, 5x Zaklęta butelka=1, 13x Zaklęta butelka=1}"), "Górniczy", counted);
			check(counted.contains("?: 2/2 {4x Diament=1, Totem nieśmiertelności=1}"), "unassigned", counted);
			check(counted.contains("Elementium: 1/1 {Karambit=1}"), "Elementium", counted);
			check(counted.contains("Drwalski: 2/2 {Czapka Drwala=1, Klejnot klucznika=1}"), "Drwalski with the gem", counted);
			check(counted.contains("Łowiecki: 1/1 {Diament=1}"), "Łowiecki after its preview", counted);

			// Górniczy's preview without "Krzemień": gone from what it gives, its win kept (the title with
			// SkyUp's resource pack characters before it, as the server sends it)
			context.runOnClient(mc -> SkyCaseTestHooks.preview("\ue001\ue082\ue002Górniczy SkyCase", false, false, GORNICZY));
			context.waitTicks(12);
			context.setScreen(() -> null);
			String pool = context.computeOnClient(mc -> SkyCaseTestHooks.pool("Górniczy"));
			check(!has(pool, "Krzemień") && pool.startsWith("Klejnot klucznika|Kask Górnika|Sztabka miedzi|5x Zaklęta butelka") && pool.split("\\|").length == 35, "Górniczy's pool", pool);
			String rows = context.computeOnClient(mc -> SkyCaseTestHooks.rewards("Górniczy", false));
			check(rows.contains("Krzemień 1/1 1/1 20% removed") && rows.contains("Sztabka miedzi 0/0 0/0 0%\n") && rows.contains("Kask Górnika 1/1 1/1 20%\n"), "Górniczy's rows", rows);
			check(rows.strip().endsWith("removed"), "the removed one last", rows);
			// grouped by item: both bottles together, 18 of them
			String grouped = context.computeOnClient(mc -> SkyCaseTestHooks.rewards("Górniczy", true));
			check(grouped.contains("Zaklęta butelka 2/2 18/18 40%") && grouped.contains("\nDiament 1/1 1/1 20%"), "grouped", grouped);

			// Platinum: the first page alone only adds (page two's saddle stays, the missing redstone too)
			context.runOnClient(mc -> SkyCaseTestHooks.preview("\ue001\ue081\ue002Platinum SkyCase", false, true, PLATINUM_1_LESS));
			context.waitTicks(12);
			pool = context.computeOnClient(mc -> SkyCaseTestHooks.pool("Platinum"));
			check(has(pool, "Siodło") && has(pool, "Blok redstone") && pool.split("\\|").length == 63, "Platinum after page one", pool);
			// the second page in the same look: both seen, the pool is what they show
			context.runOnClient(mc -> SkyCaseTestHooks.preview("\ue001\ue081\ue002Platinum SkyCase", true, false, PLATINUM_2));
			context.waitTicks(12);
			context.setScreen(() -> null);
			pool = context.computeOnClient(mc -> SkyCaseTestHooks.pool("Platinum"));
			check(!has(pool, "Siodło") && !has(pool, "Blok redstone") && pool.startsWith("Klucz do Elementium SkyCase|Wzmocniony klejnot klucznika|5x Zaklęta butelka")
				&& pool.endsWith("Zaklęta książka (Jedwabny dotyk I)") && pool.split("\\|").length == 61, "Platinum after both pages", pool);
			// later, page one alone again (with the redstone): added back, the saddle still gone
			context.runOnClient(mc -> SkyCaseTestHooks.forget());
			context.runOnClient(mc -> SkyCaseTestHooks.preview("\ue001\ue081\ue002Platinum SkyCase", false, true, PLATINUM_1));
			context.waitTicks(12);
			context.setScreen(() -> null);
			pool = context.computeOnClient(mc -> SkyCaseTestHooks.pool("Platinum"));
			check(!has(pool, "Siodło") && has(pool, "Blok redstone") && pool.split("\\|").length == 62, "Platinum page one later", pool);

			// a case not known before: made from its window, its reward counted for it
			context.runOnClient(mc -> SkyCaseTestHooks.preview("Testowy SkyCase", false, false, "minecraft:nether_star|Gwiazda Netheru|1", "minecraft:diamond|3x Diament|3"));
			context.waitTicks(12);
			context.setScreen(() -> null);
			context.runOnClient(mc -> SkyCaseTestHooks.win("Gwiazda Netheru"));
			String types = context.computeOnClient(mc -> SkyCaseTestHooks.types());
			check(types.contains("Testowy") && types.endsWith(",?"), "the new case", types);
			counted = context.computeOnClient(mc -> SkyCaseTestHooks.counted());
			check(counted.contains("Testowy: 1/1 {Gwiazda Netheru=1}"), "the new case's win", counted);

			// saved: read back, the pools from the windows and the wins are there
			context.runOnClient(mc -> SkyCaseTestHooks.reload());
			pool = context.computeOnClient(mc -> SkyCaseTestHooks.pool("Platinum"));
			check(!has(pool, "Siodło") && pool.split("\\|").length == 62, "Platinum saved", pool);
			counted = context.computeOnClient(mc -> SkyCaseTestHooks.counted());
			check(counted.contains("Górniczy: 5/5 {") && counted.contains("Testowy: 1/1 {") && counted.contains("?: 2/2 {"), "wins saved", counted);

			// the detail window: Górniczy's rewards, then grouped by item, then the unassigned wins
			context.runOnClient(mc -> SkyCaseTestHooks.screen("Górniczy", false));
			context.waitTicks(5);
			context.takeScreenshot("skycase-screen");
			context.runOnClient(mc -> SkyCaseTestHooks.screen("Górniczy", true));
			context.waitTicks(5);
			context.takeScreenshot("skycase-screen-grouped");
			context.runOnClient(mc -> SkyCaseTestHooks.screen("?", false));
			context.waitTicks(5);
			context.takeScreenshot("skycase-screen-unassigned");
			context.setScreen(() -> null);

			// the HUD: the latest wins (one never won before, with its toast), then the case's most won
			context.runOnClient(mc -> SkyCaseTestHooks.newDropToast(true));
			context.runOnClient(mc -> SkyCaseTestHooks.win("Kask Górnika"));
			context.runOnClient(mc -> SkyCaseTestHooks.win("Sztabka miedzi"));
			check(context.computeOnClient(mc -> SkyCaseTestHooks.visible()), "module shown", "");
			context.waitTicks(10);
			context.takeScreenshot("skycase-hud");
			context.runOnClient(mc -> SkyCaseTestHooks.layout("top"));
			context.waitTicks(5);
			context.takeScreenshot("skycase-hud-top");
			context.runOnClient(mc -> SkyCaseTestHooks.sum(true));
			context.waitTicks(5);
			context.takeScreenshot("skycase-hud-top-sum");
			context.runOnClient(mc -> SkyCaseTestHooks.sum(false));
			context.runOnClient(mc -> SkyCaseTestHooks.layout("recent"));
			context.runOnClient(mc -> SkyCaseTestHooks.newDropToast(false));
		}
		//#endif
	}

	//#if MC >= 26.3
	private static void parsed(ClientGameTestContext context, String line, String reward) {
		String got = context.computeOnClient(mc -> SkyCaseTestHooks.parse(line));
		check(got.equals(reward), "the line \"" + line + "\"", got);
	}

	/** A reward in a pool ("a|b|c"). */
	private static boolean has(String pool, String reward) {
		return ("|" + pool + "|").contains("|" + reward + "|");
	}
	//#endif

	private static void check(boolean ok, String what, String got) {
		if (!ok) throw new AssertionError("SkyUp cases, " + what + ":\n" + got);
	}
}
