package dev.slash3rss.slashclient.hud.wiki;

import net.minecraft.client.Minecraft;

import java.util.Map;

/** The Minecraft Wiki window for the in-game test (src/gametest GameMcWiki), with answers fed instead of the launcher's. */
public final class McWikiTestHooks {
	private McWikiTestHooks() {}

	/** The bridge's answers by path (null: the launcher again); the wiki in the game's language again. */
	public static void feed(Map<String, String> answers) {
		McWiki.SOURCE.feed(answers);
		dev.slash3rss.slashclient.hud.SlashHud.config.mcWikiEnglish = false;
	}

	public static void open() {
		Minecraft.getInstance().setScreenAndShow(McWiki.screen(null));
	}

	private static WikiScreen screen() {
		return dev.slash3rss.slashclient.hud.Compat.screen(Minecraft.getInstance()) instanceof WikiScreen s ? s : null;
	}

	/** What the window shows (its list, the article and how tall it is), or "" when it is not open. */
	public static String state() {
		WikiScreen s = screen();
		return s == null ? "" : s.state();
	}

	public static void openArticle(String slug) {
		screen().open(slug, null, true, 0);
	}

	public static boolean followLink(String wiki) {
		return screen().followLink(wiki);
	}

	public static void back() {
		screen().goBack();
	}

	public static void search(String query) {
		screen().typeSearch(query);
	}

	/** The window's language button: the English wiki, or the game's again. */
	public static String switchOver() {
		McWiki.SOURCE.switchOver();
		return McWiki.lang() + "," + McWiki.SOURCE.switchLabel();
	}

	/** What the lookup key would ask about now (the thing in hand, the mob or block looked at). */
	public static String thing() {
		return McWiki.thingForTest();
	}

	public static void lookUp(String id, String name) {
		McWiki.lookUpForTest(id, name);
	}
}
