package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.ServerPacks;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.protocol.common.ClientboundResourcePackPopPacket;
import net.minecraft.network.protocol.common.ClientboundResourcePackPushPacket;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Server resource packs per server: the edit screen's four modes (screenshots, a click that steps
 * the mode, "ignore" kept on "Done", a pinned partner server still editable there), and the
 * integrated server pushing a pack at an address nothing answers on, with the server's own
 * handler (mixin.ResourcePackAnswerMixin) noting what the client said back.
 */
public class GameServerPacks implements FabricClientGameTest {
	/** Nothing listens there: a real download could only fail. */
	private static final String URL = "http://127.0.0.1:9/slashclient-test-pack.zip";

	private static ServerData server(String name, String address) {
		return new ServerData(name, address, ServerData.Type.OTHER);
	}

	private static Screen editScreen(ServerData data) {
		//#if MC >= 1.21.9
		return new net.minecraft.client.gui.screens.ManageServerScreen(new TitleScreen(), net.minecraft.network.chat.Component.translatable("manageServer.edit.title"), ok -> {}, data);
		//#else
		//$ return new net.minecraft.client.gui.screens.EditServerScreen(new TitleScreen(), ok -> {}, data);
		//#endif
	}

	/** The open screen's resource pack button: its text, or "" when there is none of ours. */
	private static String packButton() {
		Screen screen = Compat.screen(net.minecraft.client.Minecraft.getInstance());
		if (screen == null) return "";
		String name = ServerPacks.settingName().getString();
		for (AbstractWidget w : Screens.getWidgets(screen)) {
			if (w instanceof Button && w.getMessage().getString().startsWith(name)) return w.getMessage().getString() + (w.active ? "" : " (inactive)");
		}
		return "";
	}

	private static void push(TestSingleplayerContext world, UUID id, boolean required) {
		world.getServer().runOnServer(server -> server.getPlayerList().getPlayers().get(0).connection.send(new ClientboundResourcePackPushPacket(id, URL, "", required, Optional.empty())));
	}

	//#if MC >= 26.3
	/**
	 * SkyUp's pack in the resource packs: the first offer saves it; with the copy off, the game's
	 * question about it has "Ustaw na stałe", and ticked with yes the copy is switched on;
	 * the copy on then stands in for the next offer (no question, no download); and a new version on
	 * the server replaces the copy in use (switched off, replaced, switched on again).
	 */
	private static void skyPack(ClientGameTestContext context, TestSingleplayerContext world) {
		String url = context.computeOnClient(mc -> {
			try {
				return dev.slash3rss.slashclient.hud.SkyPackTestHooks.serve("1");
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.skyUp(true));
		try {
			boolean first = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.offer(url));
			waitFetched(context);
			String saved = context.computeOnClient(mc -> copy());
			boolean notOn = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.offer(url));
			if (first || !saved.equals("current") || notOn) throw new AssertionError("SkyUp's pack saved: " + first + " " + saved + " " + notOn);
			// SkyUp's offer with the copy off: the game's question, with "Ustaw na stałe" under it; ticked
			// and yes, the server's pack loads this time and the copy is switched on for good
			ServerPacks.heard.clear();
			SlashHud.config.serverPackDefault = "prompt";
			String sha = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.sha());
			world.getServer().runOnServer(server -> server.getPlayerList().getPlayers().get(0).connection.send(new ClientboundResourcePackPushPacket(UUID.randomUUID(), url, sha, true, Optional.empty())));
			for (int i = 0; i < 40 && !context.computeOnClient(mc -> Compat.screen(mc) instanceof net.minecraft.client.gui.screens.ConfirmScreen); i++) context.waitTick();
			context.waitTicks(5);
			context.takeScreenshot("server-packs-for-good");
			if (!context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.answerForGood())) throw new AssertionError("SkyUp's pack: the game's question has no \"Ustaw na stałe\"");
			// the question gone: this time the game takes the server's pack its own way
			context.waitTicks(5);
			String after = context.computeOnClient(mc -> Compat.screen(mc) == null ? "none" : Compat.screen(mc).getClass().getSimpleName());
			if (after.contains("PackConfirm")) throw new AssertionError("SkyUp's pack, yes with the box ticked: the question stayed open");
			// the copy switched on quietly at once, so leaving the server keeps the pack on
			context.waitTicks(5);
			if (!context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.inOptions())) throw new AssertionError("SkyUp's pack, ticked: the copy is not on for after leaving");
			// the next join, kept "for good" (the test world has no address to keep it by: SkyUp's own here):
			// the copy switched on, standing in for the offer
			boolean covered = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.offerKept(url));
			context.waitTicks(40);
			boolean on = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.selected());
			if (!covered || !on) throw new AssertionError("SkyUp's pack kept for good at the next join: covered " + covered + " on " + on);
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.keepSkyUp(true));
			// the next offer: the copy on and current, answered at once
			ServerPacks.heard.clear();
			List<String> answers;
			world.getServer().runOnServer(server -> server.getPlayerList().getPlayers().get(0).connection.send(new ClientboundResourcePackPushPacket(UUID.randomUUID(), url, sha, true, Optional.empty())));
			answers = heard(context, 3);
			String screen = context.computeOnClient(mc -> Compat.screen(mc) == null ? "none" : Compat.screen(mc).getClass().getSimpleName());
			if (!answers.equals(List.of("ACCEPTED", "DOWNLOADED", "SUCCESSFULLY_LOADED")) || !screen.equals("none")) throw new AssertionError("SkyUp's pack switched on: " + answers + " screen " + screen);
			// a new version on the server: not standing in any more, the copy brought up to date
			context.computeOnClient(mc -> {
				try {
					return dev.slash3rss.slashclient.hud.SkyPackTestHooks.serve("2");
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});
			boolean stale = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.offer(url));
			waitFetched(context);
			String updated = context.computeOnClient(mc -> copy());
			// the copy in use: switched off, replaced and switched on again (two loads of the packs)
			for (int i = 0; i < 100 && !context.computeOnClient(mc -> copy()).equals("current"); i++) context.waitTicks(2);
			context.waitTicks(40);
			String swapped = context.computeOnClient(mc -> copy());
			boolean stillOn = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.selected());
			boolean waiting = context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.waiting());
			if (stale || !swapped.equals("current") || !stillOn || waiting) throw new AssertionError("SkyUp's pack updated in use: " + stale + " " + updated + " → " + swapped + " on " + stillOn + " waiting " + waiting);
		} finally {
			context.runOnClient(mc -> {
				dev.slash3rss.slashclient.hud.SkyPackTestHooks.select(false);
				dev.slash3rss.slashclient.hud.SkyPackTestHooks.skyUp(false);
				dev.slash3rss.slashclient.hud.SkyPackTestHooks.stop();
			});
		}
	}

	private static String copy() {
		try {
			return dev.slash3rss.slashclient.hud.SkyPackTestHooks.copy();
		} catch (Exception e) {
			return e.toString();
		}
	}

	private static void waitFetched(ClientGameTestContext context) {
		for (int i = 0; i < 100 && context.computeOnClient(mc -> dev.slash3rss.slashclient.hud.SkyPackTestHooks.fetching()); i++) context.waitTicks(2);
		context.waitTicks(2);
	}
	//#endif

	private static void pop(TestSingleplayerContext world, UUID id) {
		world.getServer().runOnServer(server -> server.getPlayerList().getPlayers().get(0).connection.send(new ClientboundResourcePackPopPacket(Optional.of(id))));
	}

	/** Waits until the server has heard `count` answers (or a few seconds went by). */
	private static List<String> heard(ClientGameTestContext context, int count) {
		for (int i = 0; i < 100 && ServerPacks.heard.size() < count; i++) context.waitTick();
		// and a little more, so nothing extra slips in unseen
		context.waitTicks(10);
		return List.copyOf(ServerPacks.heard);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		if (Boolean.getBoolean("slashclient.test.friendsOnly")) return;
		context.getInput().resizeWindow(854, 480);
		context.runOnClient(mc -> TestHooks.guiScale(2));
		context.waitTicks(3);

		// ---- the edit screen: each mode as it opens ----
		String[] modes = { "prompt", "accept", "decline", "ignore" };
		for (String id : modes) {
			ServerPacks.Mode mode = ServerPacks.Mode.of(id);
			context.setScreen(() -> {
				ServerData data = server("Serwer testowy", "pack.test");
				ServerPacks.setVanilla(data, mode);
				ServerPacks.remember("pack.test", "pack.test", mode);
				return editScreen(data);
			});
			context.waitTicks(5);
			String label = context.computeOnClient(mc -> packButton());
			String expected = context.computeOnClient(mc -> ServerPacks.buttonLabel(mode, 200).getString());
			if (!label.equals(expected)) throw new AssertionError("Edit screen, mode " + id + ": button says '" + label + "', expected '" + expected + "'");
			context.takeScreenshot("server-packs-edit-" + id);
		}
		// the tooltip of "decline" says that a server may kick
		context.setScreen(() -> {
			ServerData data = server("Serwer testowy", "pack.test");
			ServerPacks.setVanilla(data, ServerPacks.Mode.DECLINE);
			ServerPacks.remember("pack.test", "pack.test", ServerPacks.Mode.DECLINE);
			return editScreen(data);
		});
		context.waitTicks(5);
		// the button: x = width / 2 - 100 … + 200, y = height / 4 + 72 … + 20 (GUI scale 2 on 854×480)
		context.getInput().setCursorPos(427, 2 * (60 + 72 + 10));
		context.waitTicks(20);
		context.takeScreenshot("server-packs-edit-decline-tooltip");
		context.getInput().setCursorPos(10, 10);

		// a click steps the mode on, and the game's own setting follows: decline → ignore (the game: ask)
		ServerData[] edited = new ServerData[1];
		context.setScreen(() -> {
			edited[0] = server("Serwer testowy", "pack.test");
			ServerPacks.setVanilla(edited[0], ServerPacks.Mode.DECLINE);
			ServerPacks.remember("pack.test", "pack.test", ServerPacks.Mode.DECLINE);
			return editScreen(edited[0]);
		});
		context.waitTicks(5);
		context.runOnClient(mc -> {
			TestHooks.mouse("press", new double[] { 213, 60 + 72 + 10 });
			TestHooks.mouse("release", new double[] { 213, 60 + 72 + 10 });
		});
		context.waitTicks(2);
		String afterClick = context.computeOnClient(mc -> packButton() + "|" + edited[0].getResourcePackStatus());
		String ignoreLabel = context.computeOnClient(mc -> ServerPacks.buttonLabel(ServerPacks.Mode.IGNORE, 200).getString());
		if (!afterClick.equals(ignoreLabel + "|PROMPT")) throw new AssertionError("A click on decline should give ignore: " + afterClick);
		// "ignore" is kept only with "Done": nothing yet for this address
		if (context.computeOnClient(mc -> ServerPacks.of(server("x", "pack.test"))) == ServerPacks.Mode.IGNORE) throw new AssertionError("Ignore kept before Done");
		// Done: x = width / 2 - 100 … + 200, y = height / 4 + 96 + 18
		context.runOnClient(mc -> {
			TestHooks.mouse("press", new double[] { 213, 60 + 114 + 10 });
			TestHooks.mouse("release", new double[] { 213, 60 + 114 + 10 });
		});
		context.waitTicks(2);
		if (context.computeOnClient(mc -> ServerPacks.of(server("x", "Pack.Test:25565"))) != ServerPacks.Mode.IGNORE) throw new AssertionError("Ignore not kept for the address after Done");

		// a pinned partner server: name and address locked, the pack mode still there to change
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.PinnedServer.sampleForTest(List.of(new dev.slash3rss.slashclient.hud.PinnedServer.Pin("skyup.pl", "SkyUp.pl", false))));
		context.setScreen(() -> editScreen(server("SkyUp.pl", "skyup.pl")));
		context.waitTicks(5);
		String pinned = context.computeOnClient(mc -> packButton());
		if (pinned.isEmpty() || pinned.endsWith("(inactive)")) throw new AssertionError("Pinned server: no working pack button: '" + pinned + "'");
		context.takeScreenshot("server-packs-edit-pinned");

		// the mode on the server's row in the list
		ServerPacks.remember(null, "skyup.pl", ServerPacks.Mode.IGNORE);
		context.setScreen(() -> new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(new TitleScreen()));
		context.waitTicks(10);
		context.takeScreenshot("server-packs-list");
		context.setScreen(() -> null);
		ServerPacks.remember("pack.test", null, ServerPacks.Mode.PROMPT);
		ServerPacks.remember("skyup.pl", null, ServerPacks.Mode.PROMPT);

		// ---- a pack from the server (the integrated one: not in the list, so the default mode counts) ----
		String before = SlashHud.config.serverPackDefault;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			ServerPacks.listening = true;

			// ignore, a required pack: accepted, downloaded, loaded, with nothing downloaded
			SlashHud.config.serverPackDefault = "ignore";
			ServerPacks.heard.clear();
			push(world, UUID.randomUUID(), true);
			List<String> ignore = heard(context, 3);
			if (!ignore.equals(List.of("ACCEPTED", "DOWNLOADED", "SUCCESSFULLY_LOADED")) || !ServerPacks.lastDecision.equals("ignore"))
				throw new AssertionError("Ignore: the server heard " + ignore + " (" + ServerPacks.lastDecision + ")");
			if (context.computeOnClient(mc -> Compat.screen(mc) != null)) throw new AssertionError("Ignore: a screen opened");
			context.takeScreenshot("server-packs-ignored");

			// decline: declined, no prompt
			SlashHud.config.serverPackDefault = "decline";
			ServerPacks.heard.clear();
			push(world, UUID.randomUUID(), false);
			List<String> decline = heard(context, 1);
			if (!decline.equals(List.of("DECLINED")) || !ServerPacks.lastDecision.equals("decline")) throw new AssertionError("Decline: the server heard " + decline);
			if (context.computeOnClient(mc -> Compat.screen(mc) != null)) throw new AssertionError("Decline: a screen opened");

			// accept: no prompt, the download starts (in a local world the game only logs the outcome,
			// so the server hears nothing back here)
			SlashHud.config.serverPackDefault = "accept";
			ServerPacks.heard.clear();
			UUID accepted = UUID.randomUUID();
			push(world, accepted, false);
			for (int i = 0; i < 40 && !ServerPacks.lastDecision.equals("accept"); i++) context.waitTick();
			context.waitTicks(10);
			if (!ServerPacks.lastDecision.equals("accept")) throw new AssertionError("Accept: no decision");
			if (context.computeOnClient(mc -> Compat.screen(mc) != null)) throw new AssertionError("Accept: a prompt opened");
			pop(world, accepted);
			context.waitTicks(10);

			// prompt: the game's own question
			SlashHud.config.serverPackDefault = "prompt";
			push(world, UUID.randomUUID(), false);
			for (int i = 0; i < 40 && !context.computeOnClient(mc -> Compat.screen(mc) != null); i++) context.waitTick();
			context.waitTicks(5);
			String prompt = context.computeOnClient(mc -> Compat.screen(mc) == null ? "none" : Compat.screen(mc).getClass().getName());
			if (!prompt.contains("PackConfirmScreen")) throw new AssertionError("Prompt: no question, the screen is " + prompt);
			context.takeScreenshot("server-packs-prompt");
			context.setScreen(() -> null);
			context.waitTicks(5);
			//#if MC >= 26.3
			skyPack(context, world);
			//#endif
		} finally {
			ServerPacks.listening = false;
			SlashHud.config.serverPackDefault = before;
		}
	}
}
