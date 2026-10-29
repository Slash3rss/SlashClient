package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.ErrorText;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.minecraft.network.chat.Component;

/**
 * What a failed request says to the player: the bridge's codes (from a new launcher) and raw texts
 * (from an older one), statuses, network and file failures, all in the game's words; never
 * "HTTP 429 {...}", a Java class name or a stack. No launcher, no world: just the words.
 */
public class GameErrorText implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> {
			check("HTTP 429 {\"error\":\"rate_limited\"}", "tooMany");
			check("HTTP 429 ", "tooMany");
			// the server's refusals come through the launcher as 502 with the server's code
			check("HTTP 502 {\"error\":\"rate_limited\"}", "tooMany");
			check("HTTP 502 {\"error\":\"unauthorized\"}", "signIn");
			check("HTTP 502 {\"error\":\"not_friends\"}", "notFriends");
			check("HTTP 502 {\"error\":\"http_503\"}", "unavailable");
			check("HTTP 502 {\"error\":\"offline\"}", "unavailable");
			check("HTTP 502 {\"error\":\"some_new_code\"}", "generic");
			check("HTTP 401 {\"error\":\"unauthorized\"}", "signIn");
			check("HTTP 403 ", "forbidden");
			check("HTTP 503 <html><body>Bad gateway</body></html>", "unavailable");
			// an older launcher's raw error texts
			check("HTTP 502 {\"error\":\"fetch failed\"}", "unavailable");
			check("HTTP 500 {\"error\":\"TypeError: Cannot read properties of undefined (reading 'x')\"}", "generic");
			check("HTTP 502 {\"error\":\"ENOENT: no such file or directory, open 'C:\\\\x\\\\y.json'\"}", "generic");
			same(new IllegalStateException("HTTP 502 {\"error\":\"Konto nie ma kupionej gry\"}"), "Konto nie ma kupionej gry");
			// the network, files, no launcher, anything else
			same(new java.net.ConnectException(), tr("unavailable"));
			same(new IllegalStateException(new java.net.http.HttpTimeoutException("request timed out")), tr("unavailable"));
			same(new java.nio.file.AccessDeniedException("C:\\SlashClient\\gui-dumps\\a.txt"), tr("file"));
			same(new IllegalStateException("no launcher"), tr("noLauncher"));
			same(new NullPointerException("Cannot invoke \"String.length()\""), tr("generic"));
			// the codes the social code knows better still win: how many seconds to wait
			String slow = Social.errorText(new IllegalStateException("HTTP 502 {\"error\":\"slow_down:7\"}"));
			if (!slow.contains("7") || slow.contains("HTTP")) throw new AssertionError("slow_down: " + slow);
			if (!Social.errorText(new IllegalStateException("HTTP 502 {\"error\":\"rate_limited\"}")).equals(tr("tooMany"))) throw new AssertionError("errorText falls back to ErrorText");
			if (!ErrorText.ofAnswer(500, "{\"error\":\"server_error\"}").equals(tr("unavailable"))) throw new AssertionError("ofAnswer");
		});
	}

	private static void check(String message, String key) {
		same(new IllegalStateException(message), tr(key));
	}

	private static void same(Throwable e, String expected) {
		String got = ErrorText.of(e);
		if (!got.equals(expected)) throw new AssertionError("For " + e + ": \"" + got + "\", expected \"" + expected + "\"");
		if (got.contains("HTTP") || got.contains("{") || got.contains("Exception") || got.startsWith("slashclient-hud.")) throw new AssertionError("Not for the player: " + got);
	}

	private static String tr(String key) {
		return Component.translatable("slashclient-hud.error." + key).getString();
	}
}
