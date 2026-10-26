// SkyUp's wiki is for SkyUp, played on 26.3: the screen is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import net.minecraft.client.Minecraft;

import java.util.Map;

/** The SkyUp wiki screen for the in-game test (src/gametest GameSkyWiki), with answers fed instead of the launcher's. */
public final class SkyWikiTestHooks {
	private SkyWikiTestHooks() {}

	/** The bridge's answers by path (null: the launcher again). */
	public static void feed(Map<String, String> answers) {
		SkyWiki.feed(answers);
	}

	public static void open() {
		Minecraft.getInstance().setScreenAndShow(new SkyWikiScreen(null));
	}

	private static SkyWikiScreen screen() {
		return dev.slash3rss.slashclient.hud.Compat.screen(Minecraft.getInstance()) instanceof SkyWikiScreen s ? s : null;
	}

	/** What the screen shows (its list, the article and how tall it is), or "" when it is not open. */
	public static String state() {
		SkyWikiScreen s = screen();
		return s == null ? "" : s.state();
	}

	public static void openArticle(String slug) {
		screen().open(slug, null, true, 0);
	}

	public static boolean followFirstLink() {
		return screen().followFirstLink();
	}

	/** Scrolls the article to a place on it. */
	public static void jump(String anchor) {
		screen().jumpTo(anchor);
	}

	public static void back() {
		screen().goBack();
	}

	public static void search(String query) {
		screen().typeSearch(query);
	}
}
//#endif
