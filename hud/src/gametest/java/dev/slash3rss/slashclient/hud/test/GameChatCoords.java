package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.ChatCoords;
import dev.slash3rss.slashclient.hud.ChatCoordsScreen;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.WaypointKeysTestHooks;
import dev.slash3rss.slashclient.hud.Waypoints;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * Clickable coordinates in the chat: what counts as a place (three numbers, x and z labelled, the
 * debug screen's XYZ) and what does not (times, dates, prices, counts, single numbers); a line from a
 * player with them underlined and a hint over them; the click opening the window (name from the
 * sender, coordinates to correct, the colour), Save making the waypoint where the player is; the
 * setting switched off leaves lines as they are.
 */
public class GameChatCoords implements FabricClientGameTest {
	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	private static String found(String text) {
		List<ChatCoords.Hit> hits = ChatCoords.find(text);
		StringBuilder sb = new StringBuilder();
		for (ChatCoords.Hit h : hits) sb.append(sb.length() > 0 ? ";" : "").append(h.x()).append(' ').append(h.y() == null ? "~" : h.y()).append(' ').append(h.z());
		return sb.toString();
	}

	private static void finds(String text, String want) {
		String got = found(text);
		if (!want.equals(got)) throw new AssertionError("In '" + text + "': expected '" + want + "', found '" + got + "'");
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> {
			// places
			finds("baza na 123 64 -456", "123 64 -456");
			finds("x: 123 y: 64 z: -456", "123 64 -456");
			finds("X 123 Z -456", "123 ~ -456");
			finds("x=10, z=-20", "10 ~ -20");
			finds("tutaj: 123, 64, -456!", "123 64 -456");
			finds("-1200 70 3400 i 500 80 -20", "-1200 70 3400;500 80 -20");
			finds("XYZ: 12.5 / 64 / -3.25", "12 64 -4");
			finds("<Kumpel> 0 64 0", "0 64 0");
			// not places
			finds("o 12:30 albo 13:45", "");
			finds("data 12.05.2024 i 12 05 2024", "");
			finds("sprzedam 10 20 30 zł", "");
			finds("mam 64x 32x 16x diamentów", "");
			finds("ranking: 1 2 3", "");
			finds("tylko 123", "");
			finds("x 100 i nic", "");
			finds("wersja 1.21.4 2 3", "");
			finds("serwer mc2023 64 100", "");
			finds("cena 100 64 200%", "");
		});
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			world.getServer().runCommand("gamemode creative @a");
			// the server's own lines in the chat first, so ours are the newest
			context.waitTicks(20);
			context.runOnClient(mc -> {
				SlashHud.config.chatCoords = true;
				WaypointKeysTestHooks.chat(mc, Component.literal("o 12:30 kupię 64x diamentów za 100 zł").withStyle(ChatFormatting.GRAY));
				WaypointKeysTestHooks.chat(mc, Component.literal("<Kumpel> ").append(Component.literal("baza na ").withStyle(ChatFormatting.WHITE))
					.append(Component.literal("123 64 -456").withStyle(ChatFormatting.YELLOW)).append(Component.literal(", wbijaj")));
				var style = WaypointKeysTestHooks.chatStyle("123 64 -456");
				check(ChatCoords.isMarked(style) && style.isUnderlined() && style.getHoverEvent() != null, "The coordinates are not marked: " + style);
				check(style.getColor() != null && style.getColor().getValue() == 0xFFFF55, "The marked part kept its colour: " + style);
				check(!ChatCoords.isMarked(WaypointKeysTestHooks.chatStyle("wbijaj")), "Text around the coordinates is marked");
			});
			// the chat open, the mouse over the coordinates: underline and hint
			context.setScreen(Compat::chatScreen);
			context.waitTicks(5);
			int[] spot = context.computeOnClient(mc -> WaypointKeysTestHooks.chatSpot("123 64 -456"));
			double scale = context.computeOnClient(mc -> mc.getWindow().getGuiScale());
			context.getInput().setCursorPos(spot[0] * scale, spot[1] * scale);
			context.waitTicks(5);
			context.takeScreenshot("chat-coords-hover");
			context.getInput().pressMouse(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT);
			context.waitTicks(5);
			check(context.computeOnClient(mc -> Compat.screen(mc) instanceof ChatCoordsScreen), "A click on the coordinates did not open the window");
			context.getInput().setCursorPos(5, 5);
			context.waitTicks(5);
			context.runOnClient(mc -> TestHooks.audit(true));
			context.waitTicks(3);
			context.takeScreenshot("chat-coords-window");
			context.runOnClient(mc -> TestHooks.reportAudit());
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Layout problems in the chat coordinates window:\n" + problems);
			context.runOnClient(mc -> {
				int before = Waypoints.points(mc).size();
				ChatCoordsScreen screen = (ChatCoordsScreen) Compat.screen(mc);
				// the height corrected by hand
				screen.typeForTest(null, null, "70", null);
				screen.saveForTest();
				check(screen.saved != null && screen.saved.name.contains("Kumpel"), "The name from the sender: " + (screen.saved == null ? null : screen.saved.name));
				check(screen.saved.x == 123 && screen.saved.y == 70 && screen.saved.z == -456 && Waypoints.dimension(mc).equals(screen.saved.dimension), "Saved where: " + screen.saved.x + " " + screen.saved.y + " " + screen.saved.z);
				check(Waypoints.points(mc).size() == before + 1 && Waypoints.points(mc).contains(screen.saved), "Saved into this world's points");
				check(Compat.screen(mc) instanceof ChatScreen, "Back to the chat after saving");
			});
			// x and z only: the height is the player's
			context.runOnClient(mc -> {
				WaypointKeysTestHooks.chat(mc, Component.literal("Ola » chodź na X 500 Z -800"));
				check(ChatCoords.isMarked(WaypointKeysTestHooks.chatStyle("X 500 Z -800")), "X and Z not marked");
				check(ChatCoords.clicked(WaypointKeysTestHooks.chatStyle("X 500 Z -800")), "The click on X and Z");
				ChatCoordsScreen screen = (ChatCoordsScreen) Compat.screen(mc);
				screen.saveForTest();
				check(screen.saved.x == 500 && screen.saved.z == -800 && screen.saved.y == mc.player.getBlockY() && screen.saved.name.contains("Ola"), "X and Z saved: " + screen.saved.name + " " + screen.saved.y);
				// a right click there still copies the line
				Waypoints.remove(screen.saved);
				// switched off: lines stay as they are
				SlashHud.config.chatCoords = false;
				Component plain = Component.literal("1000 64 2000");
				check(ChatCoords.mark(plain) == plain, "Marked with the setting off");
				SlashHud.config.chatCoords = true;
			});
			context.setScreen(() -> null);
			context.runOnClient(mc -> {
				for (var p : List.copyOf(Waypoints.points(mc))) if (p.name.contains("Kumpel")) Waypoints.remove(p);
			});
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}
}
