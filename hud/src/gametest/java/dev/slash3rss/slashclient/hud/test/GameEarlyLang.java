package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.EarlyLang;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.minecraft.locale.Language;

/**
 * Our texts before the game has loaded its languages (EarlyLang): over a language that knows nothing
 * (as the game's is right after the start) a notification's key gives words, in Polish or English, with
 * its values filled in, and the game's own keys still go to the language underneath.
 */
public class GameEarlyLang implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String result = context.computeOnClient(mc -> {
			Language empty = new Language() {
				@Override public String getOrDefault(String key, String fallback) { return fallback; }
				@Override public boolean has(String key) { return false; }
				@Override public boolean isDefaultRightToLeft() { return false; }
				@Override public net.minecraft.util.FormattedCharSequence getVisualOrder(net.minecraft.network.chat.FormattedText text) { return net.minecraft.util.FormattedCharSequence.EMPTY; }
			};
			Language pl = EarlyLang.language("pl_pl", empty), en = EarlyLang.language("en_us", empty), other = EarlyLang.language("xx_yy", empty);
			String key = "slashclient-hud.achievement.unlocked";
			return pl.getOrDefault(key, key) + "|" + en.getOrDefault(key, key) + "|" + other.getOrDefault(key, key) + "|" + pl.getOrDefault("menu.options", "menu.options") + "|" + pl.has(key);
		});
		String[] parts = result.split(java.util.regex.Pattern.quote("|"));
		if (parts[0].startsWith("slashclient") || parts[1].startsWith("slashclient") || parts[0].equals(parts[1]) || !parts[2].equals(parts[1])
			|| !parts[3].equals("menu.options") || !parts[4].equals("true")) throw new AssertionError("Early texts: " + result);
	}
}
