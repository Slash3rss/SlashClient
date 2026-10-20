package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.FriendStreams;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import java.util.List;

/**
 * Friends live on Twitch and Kick in the game (no launcher, made-up friends): the server's
 * 'stream' event with `notify` makes one toast, one without it (a title change, a restart) none,
 * a muted friend none; the friends window shows the red LIVE badge and the stream's title on the
 * list and in the chat's header. The layout audit runs over it.
 */
public class GameFriendStreams implements FabricClientGameTest {
	private static final String ALA = "ala-live", BOB = "bob-kick", CID = "cid-off";

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			long now = System.currentTimeMillis();
			context.runOnClient(mc -> Social.sampleForTest(List.of(
				new Social.Friend(ALA, "AlaGra", "alagra", "online", "server", "skyup.pl", 0, now),
				new Social.Friend(BOB, "BobKick", "bobkick", "online", "launcher", "", 2, now - 60_000),
				new Social.Friend(CID, "CidOffline", "cid", "offline", "", "", 0, now - 600_000)),
				List.of(new Social.Message(1, ALA, "me", "Wbijaj na streama!", now - 120_000, true, "", "", "", null, null)), "me"));

			// Ala goes live: one toast with the platform and the title
			int before = toasts(context);
			stream(context, ALA, "twitch", "Budujemy zamek na skyup.pl", 128, true);
			if (toasts(context) != before + 1) throw new AssertionError("No toast when a friend went live");
			if (context.computeOnClient(mc -> FriendStreams.of(ALA)) == null) throw new AssertionError("Ala is not live");
			context.waitTicks(15);
			context.takeScreenshot("friend-live-toast");

			// the title changed (no `notify`): the badge follows, no toast
			before = toasts(context);
			stream(context, ALA, "twitch", "Budujemy zamek – dzień 2", 140, false);
			if (toasts(context) != before) throw new AssertionError("A toast without notify");
			if (!context.computeOnClient(mc -> FriendStreams.of(ALA).title()).endsWith("dzień 2")) throw new AssertionError("The title did not change");
			// Bob is muted here: his stream is shown, but no toast; links to other sites are dropped
			context.runOnClient(mc -> Social.mute(BOB, true));
			stream(context, BOB, "kick", "Speedrun 1.21", 9, true);
			if (toasts(context) != before) throw new AssertionError("A muted friend made a toast");
			context.runOnClient(mc -> Social.mute(BOB, false));
			JsonObject evil = event(CID, "twitch", "x", 1, true);
			evil.getAsJsonObject("stream").addProperty("url", "https://evil.example/cid");
			context.runOnClient(mc -> FriendStreams.eventForTest(evil));
			if (context.computeOnClient(mc -> FriendStreams.of(CID)) != null) throw new AssertionError("A stream with a link elsewhere was kept");

			// the friends window: LIVE on the list (Ala on Twitch, Bob on Kick) and in Ala's chat header
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.toasts(mc).clear());
			context.runOnClient(mc -> TestHooks.audit(true));
			context.setScreen(() -> {
				Social.viewing = ALA;
				return new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("friends-live");

			// it ended: the badge goes
			context.runOnClient(mc -> {
				JsonObject e = new JsonObject();
				e.addProperty("type", "stream");
				e.addProperty("id", BOB);
				e.add("stream", com.google.gson.JsonNull.INSTANCE);
				FriendStreams.eventForTest(e);
			});
			if (context.computeOnClient(mc -> FriendStreams.of(BOB)) != null) throw new AssertionError("Bob's stream did not end");

			context.runOnClient(mc -> TestHooks.reportAudit());
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems in the friends window with streams:\n" + problems);

			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				FriendStreams.setForTest(ALA, null);
				Social.viewing = null;
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static int toasts(ClientGameTestContext context) {
		return context.computeOnClient(mc -> Social.toastsForTest());
	}

	private static JsonObject event(String id, String platform, String title, int viewers, boolean notify) {
		JsonObject s = new JsonObject();
		s.addProperty("platform", platform);
		s.addProperty("login", id);
		s.addProperty("name", id);
		s.addProperty("url", "twitch".equals(platform) ? "https://www.twitch.tv/" + id : "https://kick.com/" + id);
		s.addProperty("title", title);
		s.addProperty("category", "Minecraft");
		s.addProperty("viewers", viewers);
		JsonObject e = new JsonObject();
		e.addProperty("type", "stream");
		e.addProperty("id", id);
		e.add("stream", s);
		if (notify) e.addProperty("notify", true);
		return e;
	}

	/** The server's 'stream' event as the launcher passes it on. */
	private static void stream(ClientGameTestContext context, String id, String platform, String title, int viewers, boolean notify) {
		JsonObject e = event(id, platform, title, viewers, notify);
		context.runOnClient(mc -> {
			try {
				Social.eventForTest(e);
			} catch (Exception ex) {
				throw new RuntimeException(ex);
			}
		});
	}
}
