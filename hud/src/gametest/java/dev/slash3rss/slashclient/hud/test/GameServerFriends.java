package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.servers.PartnerServers;
import dev.slash3rss.slashclient.hud.servers.ServerFriends;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.social.Social;
import dev.slash3rss.slashclient.hud.ui.SlashServerScreen;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;

import java.util.List;

/**
 * Friends next to servers in the server list (ServerFriends), with made-up friends and presence:
 * the faces show on the server each friend plays on however the address was typed (case, :25565,
 * a trailing dot) and under a partner's other address, not on another port; a friend who hides
 * where they play, a muted one and an offline one never show; the names come on hover; the setting
 * hides it all. Both lists, ours and the game's, with screenshots. Other tests may leave servers in
 * the list, so ours are found by name (a search narrows the list to them), never by position.
 */
public class GameServerFriends implements FabricClientGameTest {
	private static final String[][] SERVERS = {
		{ "Znajomi Alfa", "alpha.test" }, { "Znajomi Beta", "beta.test" }, { "Znajomi SkyUp", "play.skyup.pl" },
	};

	private static ServerData server(String name, String ip) {
		//#if MC >= 1.20.2
		return new ServerData(name, ip, ServerData.Type.OTHER);
		//#else
		//$ return new ServerData(name, ip, false);
		//#endif
	}

	private static SlashServerScreen screen() {
		if (Compat.screen(Minecraft.getInstance()) instanceof SlashServerScreen s) return s;
		throw new AssertionError("Not our server list: " + Compat.screen(Minecraft.getInstance()));
	}

	private static Social.Friend friend(String id, String name, String status, String server, boolean muted) {
		return new Social.Friend(id, name, name.toLowerCase(), status, "server", server, 0, 0, muted);
	}

	private static void open(ClientGameTestContext context) {
		context.setScreen(() -> new JoinMultiplayerScreen(new TitleScreen()));
		context.waitTicks(10);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		if (Boolean.getBoolean("slashclient.test.friendsOnly")) return;
		context.getInput().resizeWindow(854, 480);
		context.runOnClient(mc -> {
			TestHooks.guiScale(2);
			SlashHud.config.customServerList = true;
			SlashHud.config.serverFriends = true;
			SlashServerScreen.sampleStatusForTest = true;
			PartnerServers.sampleForTest("skyup.pl", "skyup.eu", "51.38.10.20");
			ServerList list = new ServerList(mc);
			list.load();
			for (String[] s : SERVERS) if (list.get(s[1]) == null) list.add(server(s[0], s[1]), false);
			list.save();
			Social.sampleForTest(List.of(
				friend("ala", "Ala", "online", "Alpha.TEST.:25565", false),
				friend("bartek", "Bartek", "online", "alpha.test", false),
				friend("celina", "Celina", "online", "", false),
				friend("darek", "Darek", "online", "alpha.test", true),
				friend("ewa", "Ewa", "online", "51.38.10.20", false),
				friend("franek", "Franek", "offline", "beta.test", false),
				friend("gosia", "Gosia", "online", "beta.test:25566", false),
				friend("hania", "Hania", "online", "alpha.test", false),
				friend("igor", "Igor", "online", "ALPHA.test", false)), List.of(), "me");
			ServerFriends.sampleFaceForTest("ala", 0xE0A060);
			ServerFriends.sampleFaceForTest("ewa", 0x6FA8DC);
			ServerFriends.sampleFaceForTest("hania", 0xC27BA0);
		});
		try {
			run(context);
		} finally {
			context.runOnClient(mc -> {
				SlashServerScreen.sampleStatusForTest = false;
				SlashHud.config.customServerList = true;
				SlashHud.config.serverFriends = true;
				TestHooks.audit(false);
				Social.friendsForTest(List.of());
				ServerList list = new ServerList(mc);
				list.load();
				for (String[] s : SERVERS) {
					ServerData d = list.get(s[1]);
					if (d != null) list.remove(d);
				}
				list.save();
			});
		}
		context.setScreen(() -> null);
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private void run(ClientGameTestContext context) {
		// the friends window: the friends with a Minecraft face show it (Ala, Ewa, Hania), the others their first letter
		context.setScreen(() -> new dev.slash3rss.slashclient.hud.social.FriendsScreen(null));
		context.waitTicks(5);
		context.takeScreenshot("friends-faces");
		context.setScreen(() -> null);
		// the same server however it was typed, a partner's other address, never another port
		String places = context.computeOnClient(mc -> ServerFriends.samePlace("Alpha.TEST.:25565", "alpha.test") + " " + ServerFriends.samePlace("51.38.10.20", "play.skyup.pl")
			+ " " + ServerFriends.samePlace("beta.test:25566", "beta.test") + " " + ServerFriends.samePlace("", ""));
		if (!places.equals("true true false false")) throw new AssertionError("Same server: " + places);

		context.runOnClient(mc -> TestHooks.audit(true));
		open(context);
		context.runOnClient(mc -> screen().searchForTest("Znajomi"));
		context.getInput().setCursorPos(10, 10);
		context.waitTicks(5);
		String alpha = context.computeOnClient(mc -> String.join(",", screen().friendsForTest("Znajomi Alfa")));
		String beta = context.computeOnClient(mc -> String.join(",", screen().friendsForTest("Znajomi Beta")));
		String skyup = context.computeOnClient(mc -> String.join(",", screen().friendsForTest("Znajomi SkyUp")));
		// Celina hides where she plays, Darek is muted, Franek offline, Gosia on another port
		if (!alpha.equals("Ala,Bartek,Hania,Igor")) throw new AssertionError("Friends on alpha.test: " + alpha);
		if (!beta.isEmpty()) throw new AssertionError("Friends on beta.test: " + beta);
		if (!skyup.equals("Ewa")) throw new AssertionError("Friends on play.skyup.pl: " + skyup);
		if (context.computeOnClient(mc -> screen().facesForTest("Znajomi Alfa")) == null) throw new AssertionError("No faces drawn on alpha.test's card");
		if (context.computeOnClient(mc -> screen().facesForTest("Znajomi Beta")) != null) throw new AssertionError("Faces drawn on beta.test's card");

		// on hover: who they are
		int[] at = context.computeOnClient(mc -> screen().facesForTest("Znajomi Alfa"));
		context.getInput().setCursorPos(2 * (at[0] + 3), 2 * (at[1] + 3));
		context.waitTicks(3);
		List<String> tip = context.computeOnClient(mc -> screen().tipForTest());
		if (tip.size() != 5 || !tip.get(1).contains("Ala") || !tip.get(4).contains("Igor")) throw new AssertionError("Tooltip over the faces: " + tip);
		context.takeScreenshot("server-friends");
		context.getInput().setCursorPos(10, 10);

		String problems = context.computeOnClient(mc -> String.join("\n", Ui.PROBLEMS));
		context.runOnClient(mc -> TestHooks.audit(false));
		if (!problems.isEmpty()) throw new AssertionError("Server list layout:\n" + problems);

		// switched off: no faces anywhere
		context.runOnClient(mc -> SlashHud.config.serverFriends = false);
		context.waitTicks(3);
		if (!context.computeOnClient(mc -> screen().friendsForTest("Znajomi Alfa")).isEmpty() || context.computeOnClient(mc -> screen().facesForTest("Znajomi Alfa")) != null)
			throw new AssertionError("Faces still show with the setting off");
		context.takeScreenshot("server-friends-off");
		context.runOnClient(mc -> SlashHud.config.serverFriends = true);

		// the game's own list: the faces after the server's name
		context.runOnClient(mc -> SlashHud.config.customServerList = false);
		open(context);
		String vanilla = context.computeOnClient(mc -> Compat.screen(mc).getClass().getName());
		if (!vanilla.equals(JoinMultiplayerScreen.class.getName())) throw new AssertionError("With the setting off the game's list should show, not " + vanilla);
		context.waitTicks(10);
		context.takeScreenshot("server-friends-vanilla");
	}
}
