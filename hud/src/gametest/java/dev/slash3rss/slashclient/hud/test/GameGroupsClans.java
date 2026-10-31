package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.testing.SocialTestHooks;
import dev.slash3rss.slashclient.hud.testing.TestHooks;
import dev.slash3rss.slashclient.hud.social.ClanLogos;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Groups;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import javax.imageio.ImageIO;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.Polygon;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

/**
 * Group chats and clans in the game (made-up data, no launcher): the friends window with the
 * clan's chat and a group above the friends, a group's conversation with who wrote what and the
 * lines about the group, the clan's members (online first, with roles), the window for a new
 * group, the clan's logo (made up) in its row, its chat's header and its members, and the clan's
 * [TAG] by the name above the head and on the tab list.
 */
public class GameGroupsClans implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> SocialTestHooks.sample());
			// the picture Kumpel sent to the group (made up, as the friends test does)
			context.runOnClient(mc -> {
				try {
					dev.slash3rss.slashclient.hud.social.FriendExtrasTestHooks.pictures();
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			context.runOnClient(mc -> TestHooks.audit(true));

			// a group's conversation, the group and the clan listed above the friends
			context.runOnClient(mc -> SocialTestHooks.viewGroup("ekipa"));
			context.setScreen(() -> new FriendsScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("groups-chat");
			if (context.computeOnClient(mc -> Groups.chat("ekipa").size()) != 5) throw new AssertionError("The group's messages are not there");

			// the clan's chat, then its members
			context.runOnClient(mc -> SocialTestHooks.viewGroup("clanchat"));
			FriendsScreen[] clanScreen = new FriendsScreen[1];
			context.setScreen(() -> clanScreen[0] = new FriendsScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("groups-clan-chat");
			context.runOnClient(mc -> clanScreen[0].toggleMembers());
			context.waitTicks(5);
			context.takeScreenshot("groups-clan-members");
			if (context.computeOnClient(mc -> Groups.clan().online()) != 3) throw new AssertionError("Clan members online: " + context.computeOnClient(mc -> Groups.clan().online()));

			// the clan with a logo: in its row, before its name in the chat, and by its members
			context.runOnClient(mc -> {
				try {
					ClanLogos.sampleForTest("wolf", 7, logo());
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
				Groups.sampleLogoForTest(7);
				SocialTestHooks.viewGroup("clanchat");
			});
			if (!context.computeOnClient(mc -> Groups.logo(Groups.group("clanchat")) != null)) throw new AssertionError("The clan's logo is not there");
			// the line about the new logo is the game's own text, not the bare name
			String logoLine = context.computeOnClient(mc -> { var l = Groups.chat("clanchat"); return l.get(l.size() - 1).event(); });
			if (!logoLine.startsWith("Ty ") || !logoLine.contains("logo")) throw new AssertionError("The logo's line: " + logoLine);
			FriendsScreen[] logoScreen = new FriendsScreen[1];
			context.setScreen(() -> logoScreen[0] = new FriendsScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("groups-clan-logo-chat");
			context.runOnClient(mc -> logoScreen[0].toggleMembers());
			context.waitTicks(5);
			context.takeScreenshot("groups-clan-logo-members");
			context.runOnClient(mc -> Groups.sampleLogoForTest(0));

			// a new group: the friends to pick
			context.setScreen(() -> dev.slash3rss.slashclient.hud.social.PickFriendsScreen.newGroup(null));
			context.waitTicks(5);
			context.takeScreenshot("groups-new");
			String problems = context.computeOnClient(mc -> SocialTestHooks.problems());
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems:\n" + problems);
			context.setScreen(() -> null);

			// the clan's tag by the name: above the head and on the tab list
			String shown = context.computeOnClient(mc -> SocialTestHooks.ownClan("WOLF"));
			if (!shown.contains("[WOLF] ")) throw new AssertionError("The name does not carry the clan tag: " + shown);
			// "Tagi klanów przy nickach" off in the settings: the logo stays, the tag goes
			String plain = context.computeOnClient(mc -> SocialTestHooks.ownNameWithClanTags(false));
			if (plain.contains("[WOLF]") || plain.isBlank()) throw new AssertionError("The clan tag shows although switched off: " + plain);
			// others' tags off: ours stays, another player's goes; on again, it is back
			String others = context.computeOnClient(mc -> SocialTestHooks.namesWithoutOthersClanTags());
			String[] parts = others.split(" \\| ");
			if (parts.length != 3 || !parts[0].contains("[WOLF]") || parts[1].contains("[FOX]") || !parts[2].contains("[FOX]"))
				throw new AssertionError("Others' clan tags (ours | another's off | on): " + others);
			context.waitTicks(10);
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(10);
			context.takeScreenshot("groups-clan-tag");
			context.getInput().releaseKey(o -> o.keyPlayerList);
			context.runOnClient(mc -> SocialTestHooks.ownClan(null));
			// where it is switched off: under "Logo przy nickach"
			context.setScreen(() -> new dev.slash3rss.slashclient.hud.ui.HudEditScreen("badges"));
			context.waitTicks(5);
			context.takeScreenshot("groups-clan-tags-setting");
			context.setScreen(() -> null);
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	/** A made-up logo: a wolf's head in a blue shield on a see-through background, 64×64. */
	private static byte[] logo() throws java.io.IOException {
		BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		Polygon shield = new Polygon(new int[] { 6, 58, 58, 32, 6 }, new int[] { 4, 4, 34, 60, 34 }, 5);
		g.setPaint(new GradientPaint(0, 0, new Color(0x1E40AF), 0, 64, new Color(0x0EA5E9)));
		g.fillPolygon(shield);
		g.setColor(new Color(0xE2E8F0));
		g.setStroke(new BasicStroke(3));
		g.drawPolygon(shield);
		// the head: ears, face and a snout
		g.setColor(new Color(0xF8FAFC));
		g.fillPolygon(new int[] { 18, 24, 28 }, new int[] { 14, 28, 22 }, 3);
		g.fillPolygon(new int[] { 46, 40, 36 }, new int[] { 14, 28, 22 }, 3);
		g.fillPolygon(new int[] { 20, 44, 32 }, new int[] { 22, 22, 50 }, 3);
		g.setColor(new Color(0x0F172A));
		g.fillOval(25, 28, 4, 4);
		g.fillOval(35, 28, 4, 4);
		g.fillOval(30, 42, 5, 4);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "png", out);
		return out.toByteArray();
	}
}
