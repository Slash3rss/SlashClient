package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

/**
 * Friends and chat against a running launcher (run with -Pbridge and -PbridgeKey): the list
 * arrives, a conversation opens, a message goes out and comes back as the server confirms it.
 * Without a bridge it only checks that the screen explains how to get friends.
 */
public class FriendsChat implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.waitTicks(40);
		// the HUD window's cards, with the launcher's icons
		context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::settingsWindow);
		context.waitTicks(10);
		context.takeScreenshot("editor-cards");
		// layout mode, with the toolbar at the top
		context.setScreen(dev.slash3rss.slashclient.hud.HudEditScreen::new);
		context.waitTicks(10);
		context.takeScreenshot("editor-layout");
		// chat tabs as a page of the HUD window (with one tab to show the row)
		context.runOnClient(mc -> TestHooks.sampleChatTab());
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.HudEditScreen("chatTabs"));
		context.waitTicks(10);
		context.takeScreenshot("chat-tabs-page");
		// closing the HUD window without a world goes back to our menu, not the game's
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc).onClose());
		context.waitTicks(5);
		if (!context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof dev.slash3rss.slashclient.hud.ui.SlashTitleScreen)) throw new AssertionError("Closing the HUD window must return to the SlashClient menu");

		// the skin in the menu looks at the mouse: left, right and above
		context.getInput().resizeWindow(1920, 1080);
		context.runOnClient(mc -> TestHooks.guiScale(2));
		context.runOnClient(mc -> TestHooks.slashMenu());
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		for (int[] at : new int[][] { { 200, 500 }, { 1900, 500 }, { 1560, 40 }, { 1560, 1060 } }) {
			context.getInput().setCursorPos(at[0], at[1]);
			context.waitTicks(30);
			context.takeScreenshot("menu-skin-" + at[0] + "-" + at[1]);
		}
		// a tooltip over one of the icon buttons at the bottom of the menu
		context.getInput().setCursorPos(804, 776);
		context.waitTicks(10);
		context.takeScreenshot("menu-tooltip");
		// a small window: the cards get narrower so the skin still fits
		context.getInput().resizeWindow(854, 480);
		context.getInput().setCursorPos(100, 240);
		context.waitTicks(30);
		context.takeScreenshot("menu-skin-small");
		context.setScreen(() -> new FriendsScreen(null));
		// without a launcher (the made-up friends of the screenshots do not count): only the screens
		if (!Social.bridged()) {
			context.waitTicks(10);
			context.takeScreenshot("friends-no-launcher");
			// "join me" invites as cards in the chat, with Join on the one received
			String friend = context.computeOnClient(mc -> TestHooks.sampleInvites());
			context.setScreen(() -> {
				Social.viewing = friend;
				return new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("friends-invites");
			// the received one run out: no Join, "Zaproszenie wygasło"
			context.runOnClient(mc -> Social.inviteExpiresForTest(2, System.currentTimeMillis() - 1000));
			context.waitTicks(3);
			context.takeScreenshot("friends-invite-expired");
			context.runOnClient(mc -> Social.inviteExpiresForTest(2, Long.MAX_VALUE));
			// a shared waypoint in the chat, with Add on the one received
			context.runOnClient(mc -> {
				long now = System.currentTimeMillis();
				var point = new dev.slash3rss.slashclient.hud.social.SharedWaypoints.Shared("Baza w górach", 412, 88, -1290, "minecraft:overworld", "server:skyup.pl");
				Social.sampleForTest(Social.friend(friend), java.util.List.of(
					new Social.Message(4, "kumpel", "me", "📍 Baza", now - 30_000, true, "", "", "", point),
					new Social.Message(5, "me", "kumpel", "📍 Baza", now, false, "", "", "", point)), "me");
			});
			context.setScreen(() -> {
				Social.viewing = friend;
				return new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("friends-waypoint");
			// a party: who accepted, and the friends to pick
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.social.Party.sampleForTest("me"));
			context.setScreen(() -> dev.slash3rss.slashclient.hud.social.PickFriendsScreen.party(null));
			context.waitTicks(10);
			context.takeScreenshot("friends-party");
			// points friends shared for other worlds: accepting one takes it off the list
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.social.SharedWaypoints.sampleForTest());
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.WaypointsScreen(true));
			context.waitTicks(10);
			context.takeScreenshot("waypoints-received");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.social.SharedWaypoints.accept(dev.slash3rss.slashclient.hud.social.SharedWaypoints.pending().get(0)));
			if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.social.SharedWaypoints.pending().size()) != 1) throw new AssertionError("An accepted waypoint must leave the received list");
			context.runOnClient(mc -> TestHooks.vanillaMenu());
			return;
		}
		waitFor(context, () -> Social.reachable() && !Social.friends().isEmpty(), "friends list");
		context.takeScreenshot("friends-list");

		String id = Social.friends().get(0).id();
		context.setScreen(() -> {
			Social.open(id);
			return new FriendsScreen(null);
		});
		waitFor(context, () -> Social.chat(id) != null && !Social.chat(id).isEmpty(), "conversation");
		int before = Social.chat(id).size();
		String text = "Test z gry " + System.currentTimeMillis() % 100000;
		Social.send(id, text);
		waitFor(context, () -> Social.chat(id).size() > before && Social.chat(id).get(Social.chat(id).size() - 1).text().equals(text), "sent message");
		context.waitTicks(10);
		context.takeScreenshot("friends-chat");
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static void waitFor(ClientGameTestContext context, java.util.function.BooleanSupplier ok, String what) {
		for (int i = 0; i < 200 && !ok.getAsBoolean(); i++) context.waitTicks(5);
		if (!ok.getAsBoolean()) throw new AssertionError("Timed out waiting for " + what);
	}
}
