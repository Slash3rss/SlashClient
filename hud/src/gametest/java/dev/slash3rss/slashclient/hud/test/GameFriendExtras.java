package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.Shots;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.FriendActivity;
import dev.slash3rss.slashclient.hud.social.FriendExtrasTestHooks;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.PictureScreen;
import dev.slash3rss.slashclient.hud.social.ShotPickerScreen;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Friends in the game (no launcher, a made-up friend): a toast when they start playing, none for a
 * reconnect, none from a muted friend or with the setting off; the friends window with a muted
 * friend and pictures each way, the card of a screenshot just taken, the screenshot picker and a
 * picture shown big. The layout audit runs over those screens.
 */
public class GameFriendExtras implements FabricClientGameTest {
	private static final String F = FriendExtrasTestHooks.FRIEND;
	private static final long MIN = 60_000;

	@Override
	public void runTest(ClientGameTestContext context) {
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> {
				try {
					FriendExtrasTestHooks.sample();
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				SlashHud.config.friendPlayingToasts = true;
			});
			long now = System.currentTimeMillis();
			context.runOnClient(mc -> Social.knowForTest(now));

			// offline, then on a server ten minutes later: one toast about the game
			int before = toasts(context);
			if (presence(context, "offline", "", "", now + MIN) != null) throw new AssertionError("Going offline is not news");
			FriendActivity.News news = presence(context, "online", "server", "skyup.pl", now + 10 * MIN);
			if (news == null || !news.playing() || !news.server().equals("skyup.pl")) throw new AssertionError("Starting a game must be news: " + news);
			if (toasts(context) != before + 1) throw new AssertionError("No toast when a friend started playing");
			context.waitTicks(15);
			context.takeScreenshot("friend-playing-toast");

			// a reconnect (offline for seconds) and hopping servers say nothing
			before = toasts(context);
			if (presence(context, "offline", "", "", now + 11 * MIN) != null || presence(context, "online", "server", "skyup.pl", now + 11 * MIN + 10_000) != null
				|| presence(context, "online", "server", "hypixel.net", now + 12 * MIN) != null) throw new AssertionError("A reconnect must not be news");
			if (toasts(context) != before) throw new AssertionError("A toast for a reconnect");

			// muted: the news is there, but no toast; a message counts as unread, quietly
			context.runOnClient(mc -> Social.mute(F, true));
			if (!context.computeOnClient(mc -> Social.friend(F).muted())) throw new AssertionError("The friend is not muted");
			before = toasts(context);
			presence(context, "offline", "", "", now + 20 * MIN);
			presence(context, "online", "singleplayer", "", now + 40 * MIN);
			message(context, 10, "Hej, wbijasz?", false, now + 41 * MIN);
			message(context, 11, "[Zrzut ekranu]", true, now + 42 * MIN);
			if (toasts(context) != before) throw new AssertionError("A muted friend made a toast");
			if (context.computeOnClient(mc -> Social.friend(F).unread()) != 2) throw new AssertionError("A muted friend's messages must still count as unread");

			// unmuted: a picture makes a toast; with the setting off, starting to play does not
			context.runOnClient(mc -> Social.mute(F, false));
			before = toasts(context);
			message(context, 12, "[Zrzut ekranu]", true, now + 43 * MIN);
			if (toasts(context) != before + 1) throw new AssertionError("No toast for a picture");
			context.runOnClient(mc -> SlashHud.config.friendPlayingToasts = false);
			presence(context, "offline", "", "", now + 60 * MIN);
			presence(context, "online", "server", "skyup.pl", now + 90 * MIN);
			if (toasts(context) != before + 1) throw new AssertionError("A playing toast with the setting off");
			context.runOnClient(mc -> SlashHud.config.friendPlayingToasts = true);
			context.waitTicks(120);

			// the friends window: the muted friend (crossed bell) and the pictures each way
			context.runOnClient(mc -> {
				try {
					FriendExtrasTestHooks.sample();
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				Social.mute(F, true);
			});
			context.runOnClient(mc -> TestHooks.audit(true));
			context.setScreen(() -> {
				Social.viewing = F;
				return new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("friends-muted-pictures");

			// a screenshot just taken: its card above the field, one click sends it
			context.runOnClient(mc -> {
				try {
					Shots.recentForTest(FriendExtrasTestHooks.screenshots().get(0));
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				Social.mute(F, false);
			});
			context.setScreen(() -> {
				Social.viewing = F;
				return new FriendsScreen(null);
			});
			context.waitTicks(20);
			context.takeScreenshot("friends-recent-shot");

			// the picker: the newest screenshots, the fresh one marked
			context.setScreen(() -> new ShotPickerScreen(null, F, "Kumpel"));
			context.waitTicks(20);
			context.takeScreenshot("friends-shot-picker");

			// a picture from the chat, big
			context.setScreen(() -> new PictureScreen(null, "pic-theirs-0000000000", "Kumpel"));
			context.waitTicks(5);
			context.takeScreenshot("friends-picture-view");

			context.runOnClient(mc -> TestHooks.reportAudit());
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems in the friends screens:\n" + problems);

			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				FriendExtrasTestHooks.removeScreenshots();
				Shots.forgetRecent();
				Social.viewing = null;
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private static int toasts(ClientGameTestContext context) {
		return context.computeOnClient(mc -> Social.toastsForTest());
	}

	private static FriendActivity.News presence(ClientGameTestContext context, String status, String kind, String server, long at) {
		return context.computeOnClient(mc -> Social.presenceForTest(F, status, kind, server, at));
	}

	/** A message from the friend as the launcher passes it on; `picture`: a screenshot. */
	private static void message(ClientGameTestContext context, long id, String text, boolean picture, long at) {
		context.runOnClient(mc -> {
			JsonObject m = new JsonObject();
			m.addProperty("id", id);
			m.addProperty("from", F);
			m.addProperty("to", "me");
			m.addProperty("text", text);
			m.addProperty("at", at);
			if (picture) {
				JsonObject img = new JsonObject();
				img.addProperty("id", "pic-new-" + id + "-000000000");
				img.addProperty("w", 1920);
				img.addProperty("h", 1080);
				m.add("image", img);
			}
			JsonObject e = new JsonObject();
			e.addProperty("type", "message");
			e.add("message", m);
			try {
				Social.eventForTest(e);
			} catch (Exception ex) {
				throw new RuntimeException(ex);
			}
		});
	}
}
