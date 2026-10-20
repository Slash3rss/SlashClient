package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.ChatEditsTestHooks;
import dev.slash3rss.slashclient.hud.social.ClanLogos;
import dev.slash3rss.slashclient.hud.social.Communities;
import dev.slash3rss.slashclient.hud.social.CommunitiesTestHooks;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Communities in the game's friends window (no launcher, made-up data): their rows with a logo,
 * mentions and unread, a community's chat with the authors' roles, a mention of us marked, a
 * deleted message and the note that the chat is not end-to-end encrypted; the channels (the
 * announcements read-only for a plain member); the right-click menu of a moderator (copy, delete,
 * report) and on our own message (edit too); a new message pushed as an event; and the first
 * members, read only. The layout audit runs over all of it.
 */
public class GameCommunities implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> {
				CommunitiesTestHooks.sample();
				try {
					ClanLogos.sampleCommunityForTest(CommunitiesTestHooks.BIG, 3, logo());
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				dev.slash3rss.slashclient.hud.Compat.toasts(mc).clear();
				TestHooks.audit(true);
			});
			if (!context.computeOnClient(mc -> Communities.logo(Communities.community(CommunitiesTestHooks.BIG)) != null)) throw new AssertionError("The community's logo is not there");

			// the list: the communities under the groups, with mentions and unread
			FriendsScreen[] screen = new FriendsScreen[1];
			context.setScreen(() -> screen[0] = new FriendsScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("communities-list");

			// the big one's chat (we moderate it)
			context.runOnClient(mc -> screen[0].selectCommunity(CommunitiesTestHooks.BIG, null));
			context.waitTicks(10);
			context.takeScreenshot("communities-chat");

			// a member's message: copy, delete (moderation), report; an admin's: copy and report only
			List<String> theirs = rightClick(context, screen[0], 5);
			if (theirs.size() != 3) throw new AssertionError("A member's message's menu for a moderator: " + theirs);
			context.waitTicks(3);
			context.takeScreenshot("communities-menu-moderator");
			context.runOnClient(mc -> ChatEditsTestHooks.click(screen[0], 1, 1, true));
			List<String> admins = rightClick(context, screen[0], 4);
			if (admins.size() != 2) throw new AssertionError("An admin's message's menu for a moderator: " + admins);
			context.runOnClient(mc -> ChatEditsTestHooks.click(screen[0], 1, 1, true));
			// our own: edit, copy, delete
			List<String> own = rightClick(context, screen[0], 6);
			if (own.size() != 3) throw new AssertionError("Our message's menu: " + own);
			context.runOnClient(mc -> {
				double[] row = screen[0].menuRowForTest(0);
				ChatEditsTestHooks.click(screen[0], row[0], row[1], false);
			});
			context.waitTicks(3);
			if (context.computeOnClient(mc -> screen[0].editingForTest()) != 6) throw new AssertionError("Not editing our message");
			context.takeScreenshot("communities-editing");
			context.runOnClient(mc -> ChatEditsTestHooks.key(screen[0], InputConstants.KEY_ESCAPE));

			// a new message pushed by the server, mentioning us: in the chat at once (it is open)
			context.runOnClient(mc -> CommunitiesTestHooks.incoming(CommunitiesTestHooks.BIG, CommunitiesTestHooks.GENERAL, 7, "ola", "Ola", "@Ty mam już kamień, dzięki!", true));
			if (context.computeOnClient(mc -> Communities.chat(CommunitiesTestHooks.GENERAL).size()) != 7) throw new AssertionError("The pushed message is not in the chat");
			context.waitTicks(3);
			context.takeScreenshot("communities-pushed");

			// the announcements: we moderate but are not an admin, so read only
			context.runOnClient(mc -> screen[0].selectCommunity(CommunitiesTestHooks.BIG, CommunitiesTestHooks.NEWS));
			context.waitTicks(5);
			context.takeScreenshot("communities-announcements");

			// the first members, read only
			context.runOnClient(mc -> screen[0].selectCommunity(CommunitiesTestHooks.BIG, null));
			context.runOnClient(mc -> screen[0].toggleCommunityMembers());
			context.waitTicks(5);
			context.takeScreenshot("communities-members");
			context.runOnClient(mc -> screen[0].toggleCommunityMembers());

			// the layout audit over the window (the toasts below slide in from off screen)
			context.runOnClient(mc -> TestHooks.reportAudit());
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems in the friends window:\n" + problems);

			// a message in another community where we want everything: a toast
			int before = context.computeOnClient(mc -> Social.toastsForTest());
			context.runOnClient(mc -> CommunitiesTestHooks.incoming(CommunitiesTestHooks.SMALL, CommunitiesTestHooks.SMALL_GENERAL, 21, "bartek", "Bartek", "Kto dziś trenuje?", false));
			if (context.computeOnClient(mc -> Social.toastsForTest()) != before + 1) throw new AssertionError("No toast for a community set to all messages");
			// in the big one (mentions only) a message without a mention makes none
			context.runOnClient(mc -> screen[0].selectCommunity(CommunitiesTestHooks.SMALL, CommunitiesTestHooks.SMALL_NEWS));
			context.runOnClient(mc -> CommunitiesTestHooks.incoming(CommunitiesTestHooks.BIG, CommunitiesTestHooks.GENERAL, 8, "ola", "Ola", "Bez wzmianki", false));
			if (context.computeOnClient(mc -> Social.toastsForTest()) != before + 1) throw new AssertionError("A toast for a community set to mentions only");
			context.waitTicks(5);
			context.takeScreenshot("communities-small");

			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				Social.viewing = null;
				Communities.viewing = null;
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

	/** A made-up logo: a white tree in a teal ring, 64×64. */
	private static byte[] logo() throws java.io.IOException {
		BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setColor(new Color(0x0F3C46));
		g.fillOval(2, 2, 60, 60);
		g.setColor(new Color(0x14B8A6));
		g.setStroke(new java.awt.BasicStroke(6));
		g.drawOval(5, 5, 54, 54);
		g.setColor(new Color(0xFAFAFA));
		g.fillPolygon(new int[] { 32, 18, 46 }, new int[] { 14, 46, 46 }, 3);
		g.fillRect(29, 46, 6, 6);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "png", out);
		return out.toByteArray();
	}
}
