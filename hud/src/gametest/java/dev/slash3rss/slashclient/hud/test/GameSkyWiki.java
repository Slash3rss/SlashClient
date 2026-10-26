package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyWikiTestHooks;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
//#endif

/**
 * The SkyUp wiki in the game, with the real wiki's list and articles as the launcher hands them over
 * (src/gametest/resources/skywiki, made by the launcher's converter): the list by category and the
 * wiki's start page, an
 * article with its table, a link to another article and back, the search; and without a launcher
 * that has the wiki, the screen asks to update it.
 */
public class GameSkyWiki implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		//#if MC >= 26.3
		Map<String, String> answers = new HashMap<>();
		answers.put("/skyup-wiki/index", read("index"));
		answers.put("/skyup-wiki/article/start", read("start"));
		answers.put("/skyup-wiki/article/inkubatory", read("inkubatory"));
		answers.put("/skyup-wiki/article/ulepszenia-lejow", read("ulepszenia-lejow"));
		answers.put("/skyup-wiki/search?q=inkubator", read("search-inkubator"));
		context.runOnClient(mc -> SkyWikiTestHooks.feed(answers));
		context.runOnClient(mc -> SkyWikiTestHooks.open());
		context.waitTicks(10);
		String state = context.computeOnClient(mc -> SkyWikiTestHooks.state());
		if (!state.startsWith("#") || !state.contains("Inkubatory|") || !state.contains("article=start")) throw new AssertionError("The wiki's list and its start page: " + state);
		context.takeScreenshot("skywiki-list");
		// an article: laid out, with its table
		context.runOnClient(mc -> SkyWikiTestHooks.openArticle("inkubatory"));
		context.waitTicks(10);
		state = context.computeOnClient(mc -> SkyWikiTestHooks.state());
		if (!state.contains("article=inkubatory") || height(state) < 150) throw new AssertionError("The article: " + state);
		context.takeScreenshot("skywiki-article");
		context.runOnClient(mc -> SkyWikiTestHooks.jump("rodzaje-inkubatorów"));
		context.waitTicks(3);
		context.takeScreenshot("skywiki-table");
		// a link to another article, and back
		if (!context.computeOnClient(mc -> SkyWikiTestHooks.followFirstLink())) throw new AssertionError("The article has no link to another one");
		context.waitTicks(10);
		state = context.computeOnClient(mc -> SkyWikiTestHooks.state());
		if (!state.contains("article=ulepszenia-lejow") || !state.contains("back=2")) throw new AssertionError("Following a link (the start page and the article behind it): " + state);
		context.runOnClient(mc -> SkyWikiTestHooks.back());
		context.waitTicks(10);
		state = context.computeOnClient(mc -> SkyWikiTestHooks.state());
		if (!state.contains("article=inkubatory") || !state.contains("back=1")) throw new AssertionError("Back: " + state);
		// the search: the hits instead of the list
		context.runOnClient(mc -> SkyWikiTestHooks.search("inkubator"));
		context.waitTicks(15);
		state = context.computeOnClient(mc -> SkyWikiTestHooks.state());
		if (state.startsWith("#") || state.startsWith(" article")) throw new AssertionError("The search's hits: " + state);
		context.takeScreenshot("skywiki-search");
		context.setScreen(() -> null);
		// a launcher from before the wiki in the game: the bridge does not know the path
		context.runOnClient(mc -> SkyWikiTestHooks.feed(new HashMap<>()));
		context.runOnClient(mc -> SkyWikiTestHooks.open());
		context.waitTicks(10);
		state = context.computeOnClient(mc -> SkyWikiTestHooks.state());
		if (!state.contains("problem=Not found")) throw new AssertionError("Without the wiki: " + state);
		context.setScreen(() -> null);
		context.runOnClient(mc -> SkyWikiTestHooks.feed(null));
		//#endif
	}

	//#if MC >= 26.3
	private static int height(String state) {
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("height=(\\d+)").matcher(state);
		return m.find() ? Integer.parseInt(m.group(1)) : 0;
	}

	private static String read(String name) {
		try (InputStream in = GameSkyWiki.class.getResourceAsStream("/skywiki/" + name + ".json")) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		} catch (Exception e) {
			throw new AssertionError("No test answer " + name, e);
		}
	}
	//#endif
}
