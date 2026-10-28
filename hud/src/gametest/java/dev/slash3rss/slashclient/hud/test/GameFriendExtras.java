package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.replay.Shots;
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
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> {
				try {
					FriendExtrasTestHooks.sample();
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				SlashHud.config.toastPlaying = true;
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
			context.runOnClient(mc -> SlashHud.config.toastPlaying = false);
			presence(context, "offline", "", "", now + 60 * MIN);
			presence(context, "online", "server", "skyup.pl", now + 90 * MIN);
			if (toasts(context) != before + 1) throw new AssertionError("A playing toast with the setting off");
			context.runOnClient(mc -> SlashHud.config.toastPlaying = true);
			// shown as long as its text needs: a short one the least, a long one longer (to slide through and back), never past the most
			long[] shownFor = context.computeOnClient(mc -> new long[] { dev.slash3rss.slashclient.hud.social.FriendToast.showMsForTest("Ala", "Hej"),
				dev.slash3rss.slashclient.hud.social.FriendToast.showMsForTest("Ala", "nadaje na żywo na Twitch: Budujemy wielki zamek na wyspie i szukamy pomocników do kopania"),
				dev.slash3rss.slashclient.hud.social.FriendToast.showMsForTest("Ala", "x".repeat(2000)) });
			if (shownFor[0] != 5000 || shownFor[1] <= 5000 || shownFor[1] > 15000 || shownFor[2] != 15000)
				throw new AssertionError("How long toasts show: " + java.util.Arrays.toString(shownFor));
			// a long message slides in its toast
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.toasts(mc).clear());
			context.runOnClient(mc -> Social.toast("Społeczność · Ala", "Hej wszystkim, dziś wieczorem robimy wspólny event na wyspie, wbijajcie o 20!", "m-players"));
			context.waitTicks(60);
			context.takeScreenshot("toast-long-sliding");
			// messages switched off: a picture makes no toast; on again, it does
			context.runOnClient(mc -> SlashHud.config.toastMessages = false);
			before = toasts(context);
			message(context, 13, "[Zrzut ekranu]", true, now + 91 * MIN);
			if (toasts(context) != before) throw new AssertionError("A message toast with messages switched off");
			context.runOnClient(mc -> SlashHud.config.toastMessages = true);
			// "Nie przeszkadzać" in the launcher: friends quiet, but the game's own (an error, a clip) still show; with the quiet off, toasts again
			context.runOnClient(mc -> Social.statusForTest("busy"));
			before = toasts(context);
			message(context, 14, "[Zrzut ekranu]", true, now + 92 * MIN);
			if (toasts(context) != before) throw new AssertionError("A toast while \"Nie przeszkadzać\"");
			context.runOnClient(mc -> Social.toast("Nie wysłano", "Błąd", "info"));
			context.runOnClient(mc -> Social.toast("Zapisano klip", "klip.mp4", "m-clips"));
			if (toasts(context) != before + 2) throw new AssertionError("The game's own toasts hidden while \"Nie przeszkadzać\"");
			context.runOnClient(mc -> SlashHud.config.toastDnd = false);
			message(context, 15, "[Zrzut ekranu]", true, now + 93 * MIN);
			if (toasts(context) != before + 3) throw new AssertionError("No toast with the quiet switched off");
			context.runOnClient(mc -> {
				SlashHud.config.toastDnd = true;
				Social.statusForTest("");
			});
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
			// the toasts above slide in from the edge: not part of the screens the audit looks at
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.toasts(mc).clear());
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

			// GIFs and stickers from the launcher: "[GIF] title" in the bubble, a click shows the still frame big
			context.runOnClient(mc -> {
				try {
					FriendExtrasTestHooks.sampleGif();
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				// the fresh screenshot's card would cover the bubbles
				Shots.forgetRecent();
			});
			context.setScreen(() -> {
				Social.viewing = F;
				return new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("friends-gif");
			context.setScreen(() -> PictureScreen.forGif(null, FriendExtrasTestHooks.GIF_STILL, "Kumpel"));
			context.waitTicks(5);
			context.takeScreenshot("friends-gif-view");

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
