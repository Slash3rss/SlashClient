package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import dev.slash3rss.slashclient.hud.testing.StreamChatTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * "Czat Twitch" and "Czat Kick": the parsers on raw IRC lines and Pusher frames, then both
 * modules filled with a stream's chat (no network) in game and in the editor, the settings with
 * the channel's text field, the editor's made-up lines, the status line without a channel, and
 * the fade: lines go after ten seconds, or stay when the fade is off.
 */
public class GameStreamChat implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			String parsers = context.computeOnClient(mc -> StreamChatTestHooks.parsers());
			if (!parsers.equals("ok")) throw new AssertionError("Stream chat parsers:\n" + parsers);

			context.runOnClient(mc -> StreamChatTestHooks.fill(true));
			context.waitTicks(5);
			String twitch = context.computeOnClient(mc -> StreamChatTestHooks.shown("twitchchat"));
			String kick = context.computeOnClient(mc -> StreamChatTestHooks.shown("kickchat"));
			System.out.println("SlashClient test: Twitch chat module\n" + twitch + "SlashClient test: Kick chat module\n" + kick);
			if (!twitch.contains("[HOST] Slash3rss: Witajcie") || !twitch.contains("[MOD] [SUB] Moderator_PL:") || !twitch.contains("nowy_widz macha"))
				throw new AssertionError("The Twitch module shows: " + twitch);
			if (twitch.contains("KUP TANIO")) throw new AssertionError("A deleted Twitch message still shows");
			if (!kick.contains(":KEKW:") || !kick.contains("[OG] [✔] OG_Widz: :Clap: :Clap:") || kick.contains("usuń mnie"))
				throw new AssertionError("The Kick module shows: " + kick);
			context.takeScreenshot("streamchat-hud");

			// the editor: the boxes to drag, and a module's settings with the channel's text field
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			context.takeScreenshot("streamchat-editor");
			context.setScreen(() -> new HudEditScreen("kickchat"));
			context.waitTicks(5);
			context.takeScreenshot("streamchat-settings-kick");

			// no lines yet: the editor shows made-up ones under the status
			context.runOnClient(mc -> StreamChatTestHooks.empty());
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			String preview = context.computeOnClient(mc -> StreamChatTestHooks.shown("twitchchat"));
			if (!preview.startsWith("Twitch: ") || !preview.contains("slash3rss") || !preview.contains("Witajcie na streamie"))
				throw new AssertionError("The editor's preview shows: " + preview);
			context.takeScreenshot("streamchat-editor-preview");
			context.setScreen(() -> null);

			// in game without a channel: only the status line, saying what to do
			context.runOnClient(mc -> StreamChatTestHooks.channel("twitchchat", ""));
			context.waitTicks(30);
			String status = context.computeOnClient(mc -> StreamChatTestHooks.shown("twitchchat"));
			if (!status.startsWith("Twitch:") || status.contains("Witajcie")) throw new AssertionError("Without a channel the Twitch module shows: " + status);

			// the fade: Twitch's lines go after ten seconds, Kick's stay with the fade off
			context.runOnClient(mc -> StreamChatTestHooks.fill(true));
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SlashHud.config.kickChat.fade = false);
			context.waitTicks(230);
			twitch = context.computeOnClient(mc -> StreamChatTestHooks.shown("twitchchat"));
			kick = context.computeOnClient(mc -> StreamChatTestHooks.shown("kickchat"));
			if (!twitch.isEmpty()) throw new AssertionError("Twitch's lines did not fade: " + twitch);
			if (!kick.contains("Siema Kick!")) throw new AssertionError("Kick's lines went with the fade off: " + kick);
			context.takeScreenshot("streamchat-faded");
			context.runOnClient(mc -> StreamChatTestHooks.reset());
		}
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.testing.TestHooks.vanillaMenu());
	}
}
