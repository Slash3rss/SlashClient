package dev.slash3rss.slashclient.hud.test;

import com.mojang.blaze3d.platform.InputConstants;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.servers.PartnerIcons;
import dev.slash3rss.slashclient.hud.servers.PartnerServers;
import dev.slash3rss.slashclient.hud.servers.PinnedServer;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.ui.SlashServerScreen;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.ServerList;

import java.util.ArrayList;
import java.util.List;

/**
 * Our server list (ui.SlashServerScreen): made-up servers in servers.dat (answers made up too, no
 * network), the pinned partner on top with its picture and animated icon, searching by name and
 * address, choosing with the keys and the mouse, moving with Shift+arrows (never past the pinned
 * one), deleting after the question (Esc keeps the server, Enter deletes it, a pinned one cannot be
 * deleted), screenshots at several sizes with the layout audit, and the game's own list when the
 * setting is off.
 */
public class GameServerList implements FabricClientGameTest {
	private static final String[][] SERVERS = {
		{ "Alfa Survival", "alpha.test" }, { "Beta SkyBlock", "beta.test" }, { "Stary serwer", "old.test" },
		{ "Nie odpowiada", "down.test" }, { "Sieć z napisem", "text.test" }, { "Długi opis serwera", "long.test" }, { "Gamma PvP", "gamma.test" }, { "Delta", "delta.test" },
	};

	private static ServerData server(String name, String ip) {
		//#if MC >= 1.20.2
		return new ServerData(name, ip, ServerData.Type.OTHER);
		//#else
		//$ return new ServerData(name, ip, false);
		//#endif
	}

	private static List<String> saved() {
		ServerList list = new ServerList(Minecraft.getInstance());
		list.load();
		List<String> out = new ArrayList<>();
		for (int i = 0; i < list.size(); i++) out.add(list.get(i).name);
		return out;
	}

	private static SlashServerScreen screen() {
		if (Compat.screen(Minecraft.getInstance()) instanceof SlashServerScreen s) return s;
		throw new AssertionError("Not our server list: " + Compat.screen(Minecraft.getInstance()));
	}

	/** A key with Shift held, as the game hands it to the screen (the test's input sends no modifiers). */
	private static void shiftKey(int key) {
		//#if MC >= 1.21.9
		screen().keyPressed(new net.minecraft.client.input.KeyEvent(key, 0, 1));
		//#else
		//$ screen().keyPressed(key, 0, 1);
		//#endif
	}

	/** Holds a server's card with the mouse and moves it by `by` GUI pixels in small steps (GUI scale 2), a screenshot halfway. */
	private static void drag(ClientGameTestContext context, String name, int by, String shot) {
		// at the list's top, so the drag does not reach the bottom edge (where the list scrolls by itself)
		context.runOnClient(mc -> screen().scrollToForTest(name));
		context.waitTicks(2);
		int y = context.computeOnClient(mc -> screen().cardYForTest(name));
		if (y < 0) throw new AssertionError(name + " is not on screen");
		context.getInput().setCursorPos(427, 2 * y);
		context.waitTick();
		context.getInput().holdMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTick();
		int steps = 12;
		for (int i = 0; i < steps; i++) {
			context.getInput().moveCursor(0, 2.0 * by / steps);
			context.waitTick();
			if (i == steps / 2 && shot != null) context.takeScreenshot(shot);
		}
		context.waitTicks(2);
		context.getInput().releaseMouse(InputConstants.MOUSE_BUTTON_LEFT);
		context.waitTicks(3);
		context.getInput().setCursorPos(10, 10);
	}

	private static void open(ClientGameTestContext context) {
		context.setScreen(() -> new JoinMultiplayerScreen(new TitleScreen()));
		context.waitTicks(10);
	}

	private static void size(ClientGameTestContext context, int w, int h, int scale) {
		context.getInput().resizeWindow(w, h);
		context.runOnClient(mc -> TestHooks.guiScale(scale));
		context.waitTicks(4);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		if (Boolean.getBoolean("slashclient.test.friendsOnly")) return;
		size(context, 854, 480, 2);
		context.runOnClient(mc -> {
			SlashHud.config.customServerList = true;
			SlashServerScreen.sampleStatusForTest = true;
			PinnedServer.sampleForTest(List.of(new PinnedServer.Pin("skyup.pl", "SkyUp.pl", false)));
			PartnerServers.sampleForTest("skyup.pl", "skyup.eu", "51.38.10.20");
			// four frames, a second each: two screenshots a second apart show two of them
			PartnerIcons.sampleForTest("skyup.pl", 4, 1000);
			ServerList list = new ServerList(mc);
			list.load();
			for (String[] s : SERVERS) if (list.get(s[1]) == null) list.add(server(s[0], s[1]), false);
			list.save();
		});
		try {
			run(context);
		} finally {
			context.runOnClient(mc -> {
				SlashServerScreen.sampleStatusForTest = false;
				SlashHud.config.customServerList = true;
				TestHooks.audit(false);
				ServerList list = new ServerList(mc);
				list.load();
				for (String[] s : SERVERS) {
					ServerData d = list.get(s[1]);
					if (d != null) list.remove(d);
				}
				list.save();
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private void run(ClientGameTestContext context) {
		context.runOnClient(mc -> TestHooks.audit(true));
		open(context);
		context.computeOnClient(mc -> screen());
		context.getInput().setCursorPos(10, 10);
		context.waitTicks(10);
		context.takeScreenshot("server-list");

		List<String> shown = context.computeOnClient(mc -> screen().shownForTest());
		if (!"SkyUp.pl".equals(shown.get(0))) throw new AssertionError("The pinned server is not on top: " + shown);
		for (String[] s : SERVERS) if (!shown.contains(s[0])) throw new AssertionError("Missing " + s[0] + " in " + shown);
		if (!context.computeOnClient(mc -> PartnerIcons.loadedForTest(server("SkyUp.pl", "skyup.pl")))) throw new AssertionError("The partner's animated icon is not loaded");
		// a network that sends words for its version is shown as online; a real other version stays marked
		String soft = context.computeOnClient(mc -> {
			ServerData words = server("w", "text.test"), old = server("o", "old.test");
			words.version = net.minecraft.network.chat.Component.literal("NOWY SEZON w sobotę");
			old.version = net.minecraft.network.chat.Component.literal("1.8.9");
			//#if MC >= 1.21
			words.setState(ServerData.State.INCOMPATIBLE);
			old.setState(ServerData.State.INCOMPATIBLE);
			//#else
			//$ words.pinged = old.pinged = true;
			//$ words.protocol = old.protocol = 47;
			//#endif
			return SlashServerScreen.softIncompatible(words) + " " + SlashServerScreen.softIncompatible(old);
		});
		if (!soft.equals("true false")) throw new AssertionError("Text versions: " + soft);
		// a partner added by hand under another of its addresses is still the partner (badge, frame, icon)
		String partners = context.computeOnClient(mc -> PartnerServers.isPartner(server("a", "play.skyup.pl")) + " " + PartnerServers.isPartner(server("b", "MC.SkyUp.pl:25565"))
			+ " " + PartnerServers.isPartner(server("c", "notskyup.pl")) + " " + PartnerServers.isPartner(server("d", "skyup.pl.evil.com"))
			+ " " + PartnerIcons.loadedForTest(server("e", "play.skyup.pl")));
		if (!partners.equals("true true false false true")) throw new AssertionError("Partner addresses: " + partners);
		// the admin's other addresses for the partner (another domain, a raw IP) and their subdomains, mapped to the partner
		String other = context.computeOnClient(mc -> PartnerServers.partnerKey("SkyUp.EU") + " " + PartnerServers.partnerKey("51.38.10.20:25565")
			+ " " + PartnerServers.partnerKey("play.skyup.eu") + " " + PartnerServers.isPartner(server("f", "51.38.10.20:25566"))
			+ " " + PartnerServers.isPartner(server("g", "notskyup.eu")) + " " + PartnerIcons.loadedForTest(server("h", "mc.skyup.eu")));
		if (!other.equals("skyup.pl skyup.pl skyup.pl false false true")) throw new AssertionError("Partner's other addresses: " + other);

		// two frames of the animated icon
		int first = context.computeOnClient(mc -> PartnerIcons.frameForTest("skyup.pl"));
		context.takeScreenshot("server-list-icon-frame-a");
		for (int i = 0; i < 60 && context.computeOnClient(mc -> PartnerIcons.frameForTest("skyup.pl")) == first; i++) context.waitTick();
		context.waitTicks(2);
		if (context.computeOnClient(mc -> PartnerIcons.frameForTest("skyup.pl")) == first) throw new AssertionError("The animated icon does not move on");
		context.takeScreenshot("server-list-icon-frame-b");

		// searching: by name, by address, nothing
		context.runOnClient(mc -> screen().searchForTest("beta"));
		context.waitTicks(2);
		List<String> beta = context.computeOnClient(mc -> screen().shownForTest());
		if (!beta.equals(List.of("Beta SkyBlock"))) throw new AssertionError("Search by name: " + beta);
		context.takeScreenshot("server-list-search");
		context.runOnClient(mc -> screen().searchForTest("ALPHA.TEST"));
		context.waitTicks(2);
		List<String> alpha = context.computeOnClient(mc -> screen().shownForTest());
		if (!alpha.equals(List.of("Alfa Survival"))) throw new AssertionError("Search by address: " + alpha);
		context.runOnClient(mc -> screen().searchForTest("zzzz"));
		context.waitTicks(2);
		if (!context.computeOnClient(mc -> screen().shownForTest()).isEmpty()) throw new AssertionError("Search for nothing shows servers");
		context.takeScreenshot("server-list-no-match");
		context.runOnClient(mc -> screen().searchForTest(""));
		context.waitTicks(2);

		// the keys choose, top down
		context.getInput().pressKey(InputConstants.KEY_DOWN);
		context.getInput().pressKey(InputConstants.KEY_DOWN);
		context.waitTicks(2);
		String second = context.computeOnClient(mc -> screen().selectedForTest());
		shown = context.computeOnClient(mc -> screen().shownForTest());
		if (!second.equals(shown.get(1))) throw new AssertionError("Two presses of ↓ chose '" + second + "', expected " + shown.get(1));

		// a click chooses the card under the mouse (the third: list at y 54 + 14, cards 39 apart, GUI scale 2)
		context.getInput().setCursorPos(427, 2 * (54 + 14 + 2 * 39 + 18));
		context.getInput().pressMouse(0);
		context.waitTicks(3);
		String clicked = context.computeOnClient(mc -> screen().selectedForTest());
		if (!clicked.equals(shown.get(2))) throw new AssertionError("The click chose '" + clicked + "', expected " + shown.get(2));
		context.takeScreenshot("server-list-selected");
		context.getInput().setCursorPos(10, 10);

		// Shift+↓ moves a server down, saved at once
		context.runOnClient(mc -> screen().selectForTest("Beta SkyBlock"));
		int before = context.computeOnClient(mc -> saved().indexOf("Beta SkyBlock"));
		context.runOnClient(mc -> shiftKey(InputConstants.KEY_DOWN));
		context.waitTicks(2);
		int after = context.computeOnClient(mc -> saved().indexOf("Beta SkyBlock"));
		if (after != before + 1) throw new AssertionError("Shift+↓ moved Beta from " + before + " to " + after);
		// right under the pinned server, Shift+↑ does nothing
		String underPinned = context.computeOnClient(mc -> saved().get(1));
		context.runOnClient(mc -> screen().selectForTest(underPinned));
		context.runOnClient(mc -> shiftKey(InputConstants.KEY_UP));
		context.waitTicks(2);
		if (!context.computeOnClient(mc -> saved().get(0)).equals("SkyUp.pl")) throw new AssertionError("A server moved past the pinned one");

		// dragged with the mouse two places down, it lands there and is saved
		// one of this test's own servers: other tests leave pinned ones (rotating partners) on top of the list
		String grabbed = context.computeOnClient(mc -> {
			for (String name : saved()) for (String[] s : SERVERS) if (s[0].equals(name)) return name;
			throw new AssertionError("None of the test's servers is saved: " + saved());
		});
		int from = context.computeOnClient(mc -> saved().indexOf(grabbed));
		drag(context, grabbed, 2 * 39, "server-list-dragging");
		int to = context.computeOnClient(mc -> saved().indexOf(grabbed));
		if (to != from + 2) throw new AssertionError("Dragging moved " + grabbed + " from " + from + " to " + to + ", expected " + (from + 2));
		if (context.computeOnClient(mc -> screen().draggingForTest())) throw new AssertionError("Still dragging after the mouse was let go");
		// dragged far up, it stops under the pinned server
		drag(context, grabbed, -6 * 39, null);
		if (!context.computeOnClient(mc -> saved().get(0)).equals("SkyUp.pl") || !context.computeOnClient(mc -> saved().get(1)).equals(grabbed)) {
			throw new AssertionError("Dragged up: " + context.computeOnClient(mc -> saved()));
		}
		// the pinned server itself does not move
		drag(context, "SkyUp.pl", 2 * 39, null);
		if (!context.computeOnClient(mc -> saved().get(0)).equals("SkyUp.pl")) throw new AssertionError("The pinned server was dragged");

		// deleting asks first: Esc keeps it, Enter deletes it
		context.runOnClient(mc -> screen().selectForTest("Delta"));
		context.getInput().pressKey(InputConstants.KEY_DELETE);
		context.waitTicks(3);
		if (!context.computeOnClient(mc -> screen().confirmingForTest())) throw new AssertionError("Delete did not ask");
		context.takeScreenshot("server-list-delete-question");
		context.getInput().pressKey(InputConstants.KEY_ESCAPE);
		context.waitTicks(2);
		if (context.computeOnClient(mc -> screen().confirmingForTest() || !saved().contains("Delta"))) throw new AssertionError("Esc should keep the server and close the question");
		context.getInput().pressKey(InputConstants.KEY_DELETE);
		context.waitTicks(2);
		context.getInput().pressKey(InputConstants.KEY_RETURN);
		context.waitTicks(5);
		if (context.computeOnClient(mc -> saved().contains("Delta"))) throw new AssertionError("Enter did not delete the server");
		if (context.computeOnClient(mc -> screen().shownForTest().contains("Delta"))) throw new AssertionError("The deleted server still shows");
		// the pinned partner cannot be deleted
		context.runOnClient(mc -> screen().selectForTest("SkyUp.pl"));
		context.getInput().pressKey(InputConstants.KEY_DELETE);
		context.waitTicks(2);
		if (context.computeOnClient(mc -> screen().confirmingForTest())) throw new AssertionError("Asked to delete the pinned server");

		// sizes: the smallest window, Full HD, Full HD at a small GUI scale
		int[][] sizes = { { 640, 480, 2 }, { 1920, 1080, 3 }, { 1920, 1080, 1 }, { 1280, 720, 2 } };
		for (int[] s : sizes) {
			size(context, s[0], s[1], s[2]);
			context.waitTicks(4);
			context.takeScreenshot("server-list-" + s[0] + "x" + s[1] + "-gui" + s[2]);
		}
		size(context, 854, 480, 2);

		String problems = context.computeOnClient(mc -> String.join("\n", Ui.PROBLEMS));
		context.runOnClient(mc -> TestHooks.audit(false));
		if (!problems.isEmpty()) throw new AssertionError("Server list layout:\n" + problems);

		// switched off: the game's own list (with the partner's animated icon in it)
		context.runOnClient(mc -> SlashHud.config.customServerList = false);
		open(context);
		String vanilla = context.computeOnClient(mc -> Compat.screen(mc).getClass().getName());
		if (!vanilla.equals(JoinMultiplayerScreen.class.getName())) throw new AssertionError("With the setting off the game's list should show, not " + vanilla);
		context.waitTicks(10);
		context.takeScreenshot("server-list-vanilla");
		context.runOnClient(mc -> SlashHud.config.customServerList = true);
		context.setScreen(() -> null);
		context.waitTicks(2);
	}
}
