package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.SocialTestHooks;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.FriendsScreen;
import dev.slash3rss.slashclient.hud.social.Groups;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

/**
 * Group chats and clans in the game (made-up data, no launcher): the friends window with the
 * clan's chat and a group above the friends, a group's conversation with who wrote what and the
 * lines about the group, the clan's members (online first, with roles), the window for a new
 * group, and the clan's [TAG] by the name above the head and on the tab list.
 */
public class GameGroupsClans implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> SocialTestHooks.sample());
			context.runOnClient(mc -> TestHooks.audit(true));

			// a group's conversation, the group and the clan listed above the friends
			context.runOnClient(mc -> SocialTestHooks.viewGroup("ekipa"));
			context.setScreen(() -> new FriendsScreen(null));
			context.waitTicks(10);
			context.takeScreenshot("groups-chat");
			if (context.computeOnClient(mc -> Groups.chat("ekipa").size()) != 4) throw new AssertionError("The group's messages are not there");

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
			context.waitTicks(10);
			context.getInput().holdKey(o -> o.keyPlayerList);
			context.waitTicks(10);
			context.takeScreenshot("groups-clan-tag");
			context.getInput().releaseKey(o -> o.keyPlayerList);
			context.runOnClient(mc -> SocialTestHooks.ownClan(null));
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
