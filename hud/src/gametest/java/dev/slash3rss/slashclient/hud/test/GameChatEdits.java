package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.testing.SocialTestHooks;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.social.ChatEditsTestHooks;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Groups;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import java.util.List;

/**
 * Edited and deleted messages in the game's friends window (no launcher, made-up chats): "(edited)"
 * and the tombstones, the right-click menu on our message (edit, copy, delete) and on a friend's
 * (copy only), editing in the field with Esc letting go, the server's edit and delete events, and in
 * a group we own the moderator's delete with its confirmation. The layout audit runs over all of it.
 */
public class GameChatEdits implements FabricClientGameTest {
	private static final String F = ChatEditsTestHooks.FRIEND;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> ChatEditsTestHooks.sample());
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.toasts(mc).clear());
			context.runOnClient(mc -> TestHooks.audit(true));

			// the conversation: "(edytowano)" by the time, deleted ones as muted tombstones
			FriendsScreen[] screen = new FriendsScreen[1];
			context.setScreen(() -> {
				Social.viewing = F;
				return screen[0] = new FriendsScreen(null);
			});
			context.waitTicks(10);
			context.takeScreenshot("chat-edits-direct");

			// right click on our recent message: edit, copy, delete
			List<String> own = rightClick(context, screen[0], 6);
			if (!own.equals(List.of("Edytuj", "Kopiuj tekst", "Usuń")) && !own.equals(List.of("Edit", "Copy text", "Delete"))) throw new AssertionError("Our message's menu: " + own);
			context.waitTicks(3);
			context.takeScreenshot("chat-edits-menu-own");

			// "Edytuj": its text in the field, the bubble marked, Esc lets go (and keeps the window open)
			context.runOnClient(mc -> {
				double[] row = screen[0].menuRowForTest(0);
				ChatEditsTestHooks.click(screen[0], row[0], row[1], false);
			});
			context.waitTicks(3);
			if (context.computeOnClient(mc -> screen[0].editingForTest()) != 6) throw new AssertionError("Not editing the message");
			if (!context.computeOnClient(mc -> screen[0].inputForTest()).equals("Weź ze sobą kilof i diamenty")) throw new AssertionError("The field does not hold the message's text");
			context.takeScreenshot("chat-edits-editing");
			context.runOnClient(mc -> ChatEditsTestHooks.key(screen[0], InputConstants.KEY_ESCAPE));
			if (context.computeOnClient(mc -> screen[0].editingForTest()) != -1 || !context.computeOnClient(mc -> screen[0].inputForTest()).isEmpty()) throw new AssertionError("Esc did not stop editing");
			if (context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc)) != screen[0]) throw new AssertionError("Esc while editing closed the window");

			// a friend's message: only copying; an old one of ours: no editing any more
			List<String> theirs = rightClick(context, screen[0], 2);
			if (theirs.size() != 1) throw new AssertionError("A friend's message's menu: " + theirs);
			context.runOnClient(mc -> ChatEditsTestHooks.click(screen[0], 1, 1, true));

			// the server's events: our message edited (in the launcher), and deleted
			long now = System.currentTimeMillis();
			context.runOnClient(mc -> {
				try {
					ChatEditsTestHooks.event("message-edit", ChatEditsTestHooks.message(4, "me", F, null, "Jasne, będę o 21!", now - 120_000, now, false));
					ChatEditsTestHooks.event("message-delete", ChatEditsTestHooks.message(1, F, "me", null, "", now - 600_000, 0, true));
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			Social.Message edited = context.computeOnClient(mc -> Social.chat(F).stream().filter(m -> m.id() == 4).findFirst().orElseThrow());
			if (!edited.text().equals("Jasne, będę o 21!") || edited.editedAt() != now) throw new AssertionError("The edit did not come: " + edited);
			if (!context.computeOnClient(mc -> Social.chat(F).get(0).deleted())) throw new AssertionError("The deletion did not come");
			context.waitTicks(3);
			context.takeScreenshot("chat-edits-after-events");

			// a group we own: a friend's message can be deleted (moderation), after a second click
			context.runOnClient(mc -> {
				ChatEditsTestHooks.sampleGroup();
				SocialTestHooks.viewGroup("ekipa");
			});
			context.setScreen(() -> screen[0] = new FriendsScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("chat-edits-group");
			List<String> mod = rightClick(context, screen[0], 7);
			if (mod.size() != 2 || !(mod.get(1).equals("Usuń (moderacja)") || mod.get(1).equals("Delete (moderation)"))) throw new AssertionError("The moderator's menu: " + mod);
			context.waitTicks(3);
			context.takeScreenshot("chat-edits-group-menu");
			context.runOnClient(mc -> {
				double[] row = screen[0].menuRowForTest(1);
				ChatEditsTestHooks.click(screen[0], row[0], row[1], false);
			});
			context.waitTicks(3);
			if (context.computeOnClient(mc -> screen[0].menuForTest()).size() != 2) throw new AssertionError("Deleting does not ask first");
			context.takeScreenshot("chat-edits-group-confirm");
			context.runOnClient(mc -> ChatEditsTestHooks.key(screen[0], InputConstants.KEY_ESCAPE));
			// our own group message: edit and delete; then the group's delete event makes a tombstone
			List<String> ours = rightClick(context, screen[0], 4);
			if (ours.size() != 3) throw new AssertionError("Our group message's menu: " + ours);
			context.runOnClient(mc -> ChatEditsTestHooks.click(screen[0], 1, 1, true));
			context.runOnClient(mc -> {
				try {
					ChatEditsTestHooks.event("group-message-delete", ChatEditsTestHooks.message(7, "kumpel", null, "ekipa", "", now - 90_000, 0, true));
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			if (!context.computeOnClient(mc -> Groups.chat("ekipa").stream().filter(m -> m.id() == 7).findFirst().orElseThrow().deleted())) throw new AssertionError("The group's deletion did not come");
			context.waitTicks(3);
			context.takeScreenshot("chat-edits-group-after");

			context.runOnClient(mc -> TestHooks.reportAudit());
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems in the friends window:\n" + problems);

			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				Social.viewing = null;
				Groups.viewing = null;
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	/** A right click in the middle of a message; the menu's rows. */
	private static List<String> rightClick(ClientGameTestContext context, FriendsScreen screen, long id) {
		context.waitTicks(2);
		return context.computeOnClient(mc -> {
			int[] b = screen.bubbleOf(id);
			if (b == null) throw new AssertionError("Message " + id + " is not on screen");
			ChatEditsTestHooks.click(screen, b[0] + b[2] / 2.0, b[1] + b[3] / 2.0, true);
			return screen.menuForTest();
		});
	}
}
