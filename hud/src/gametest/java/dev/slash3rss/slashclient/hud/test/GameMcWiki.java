package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

//#if MC >= 1.21.4
import dev.slash3rss.slashclient.hud.wiki.McWikiTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
//#endif

/**
 * minecraft.wiki in the game, with real articles as the launcher hands them over (src/gametest/resources/mcwiki,
 * made by the launcher's converter), the game set to Polish: the search, an article with its infobox and tables, a
 * link to another article and back, the articles read lately, the lookup of a thing (falling back to the English
 * wiki), the language button, what the lookup key asks about; and without a launcher that has the wiki, an error.
 */
public class GameMcWiki implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 1.21.4
		Map<String, String> answers = new HashMap<>();
		answers.put("/mc-wiki/search?lang=pl&q=diament", read("search-pl-diament"));
		answers.put("/mc-wiki/article?lang=pl&title=Diament", read("article-pl-diament"));
		answers.put("/mc-wiki/article?lang=pl&title=" + LINKED_PATH, read(LINKED_FILE));
		answers.put("/mc-wiki/article?lang=en&title=Oak+Planks", read("article-en-oak-planks"));
		// the Polish wiki has no such article here: the English one
		answers.put("/mc-wiki/lookup?lang=pl&id=minecraft%3Aoak_planks&name=Deski+d%C4%99bowe", "{\"title\":\"Oak Planks\",\"lang\":\"en\"}");
		String language = context.computeOnClient(mc -> mc.options.languageCode);
		context.runOnClient(mc -> mc.options.languageCode = "pl_pl");
		context.runOnClient(mc -> McWikiTestHooks.feed(answers));
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			context.runOnClient(mc -> McWikiTestHooks.open());
			context.waitTicks(5);
			String state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.contains("article= ") || !state.contains("problem=null")) throw new AssertionError("The wiki opened on nothing: " + state);
			context.takeScreenshot("mcwiki-empty");
			// the search: its hits in the list
			context.runOnClient(mc -> McWikiTestHooks.search("diament"));
			context.waitTicks(15);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.startsWith("Diament|")) throw new AssertionError("The search's hits: " + state);
			context.takeScreenshot("mcwiki-search");
			// an article: laid out, long
			context.runOnClient(mc -> McWikiTestHooks.openArticle("pl:Diament"));
			context.waitTicks(10);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.contains("article=pl:Diament ") || height(state) < 400) throw new AssertionError("The article: " + state);
			context.takeScreenshot("mcwiki-article");
			// a link to another article of the Polish wiki, and back
			if (!context.computeOnClient(mc -> McWikiTestHooks.followLink(LINKED_TITLE))) throw new AssertionError("The article has no link to " + LINKED_TITLE);
			context.waitTicks(10);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.contains("article=pl:" + LINKED_TITLE + " ") || !state.contains("back=1")) throw new AssertionError("Following a link: " + state);
			context.runOnClient(mc -> McWikiTestHooks.back());
			context.waitTicks(10);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.contains("article=pl:Diament ") || !state.contains("back=0")) throw new AssertionError("Back: " + state);
			// nothing searched: the articles read lately
			context.runOnClient(mc -> McWikiTestHooks.search(""));
			context.waitTicks(15);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.startsWith("#Read lately|Diament|" + LINKED_TITLE + "|")) throw new AssertionError("The articles read lately: " + state);
			// the lookup: planks, here read from the English wiki ("Oak Planks" leads to "Planks")
			context.setScreen(() -> null);
			context.runOnClient(mc -> McWikiTestHooks.lookUp("minecraft:oak_planks", "Deski dębowe"));
			context.waitTicks(15);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.contains("article=en:Planks ") || !state.contains("Planks (EN)|")) throw new AssertionError("The lookup: " + state);
			context.takeScreenshot("mcwiki-lookup");
			// the language button: English, and the game's again
			String switched = context.computeOnClient(mc -> McWikiTestHooks.switchOver() + "|" + McWikiTestHooks.switchOver());
			if (!switched.equals("en,PL|pl,EN")) throw new AssertionError("The language button: " + switched);
			context.setScreen(() -> null);
			// what the lookup key asks about: the thing in hand
			world.getServer().runCommand("item replace entity @p weapon.mainhand with minecraft:diamond");
			context.waitTicks(5);
			String thing = context.computeOnClient(mc -> McWikiTestHooks.thing());
			if (!thing.startsWith("minecraft:diamond|")) throw new AssertionError("The thing in hand: " + thing);
			world.getServer().runCommand("clear @a");
			// a launcher from before the wiki in the game: the article cannot be read
			context.runOnClient(mc -> McWikiTestHooks.feed(new HashMap<>()));
			context.runOnClient(mc -> McWikiTestHooks.open());
			context.runOnClient(mc -> McWikiTestHooks.openArticle("pl:Diament"));
			context.waitTicks(10);
			state = context.computeOnClient(mc -> McWikiTestHooks.state());
			if (!state.contains("problem=Not found")) throw new AssertionError("Without the wiki: " + state);
			context.setScreen(() -> null);
		} finally {
			context.runOnClient(mc -> mc.options.languageCode = language);
			context.runOnClient(mc -> McWikiTestHooks.feed(null));
		}
		//#endif
	}

	//#if MC >= 1.21.4
	/** The article a link in the infobox of "Diament" leads to: its title, its path in the bridge and its test answer. */
	private static final String LINKED_TITLE = "Zasoby odnawialne", LINKED_PATH = "Zasoby+odnawialne", LINKED_FILE = "article-pl-zasoby-odnawialne";

	private static int height(String state) {
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("height=(\\d+)").matcher(state);
		return m.find() ? Integer.parseInt(m.group(1)) : 0;
	}

	private static String read(String name) {
		try (InputStream in = GameMcWiki.class.getResourceAsStream("/mcwiki/" + name + ".json")) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		} catch (Exception e) {
			throw new AssertionError("No test answer " + name, e);
		}
	}
	//#endif
}
