package dev.slash3rss.slashclient.hud.servers;

import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import dev.slash3rss.slashclient.hud.SlashHud;

/** A "Reconnect" button on the screen you get when a server drops you: back to the same server. */
public final class Reconnect {
	private Reconnect() {}

	/** The server played on last (none after singleplayer). */
	private static ServerData last;

	/** For the test: the server "Reconnect" goes back to. */
	public static void lastForTest(ServerData data) {
		last = data;
	}

	public static void joined(Minecraft mc) {
		last = mc.isLocalServer() ? null : mc.getCurrentServer();
	}

	/** Under the screen's own buttons. */
	public static void addButton(Minecraft mc, Screen screen) {
		if (SlashHud.config == null || !SlashHud.config.reconnect || last == null) return;
		var widgets = Screens.getWidgets(screen);
		// one is enough: ours from an earlier init of this screen, or another mod's (Auto Reconnect and the like)
		String ours = Component.translatable("slashclient-hud.reconnect").getString().toLowerCase(java.util.Locale.ROOT);
		for (var w : widgets) {
			// ours, kept through a new init of the screen (a resized window): placed again and followed again
			if (w instanceof Button own && mine.contains(own)) {
				follow(screen, own);
				return;
			}
			String text = w.getMessage().getString().toLowerCase(java.util.Locale.ROOT);
			if (text.contains(ours) || text.contains("reconnect")) return;
		}
		ServerData data = last;
		Button button = Button.builder(Component.translatable("slashclient-hud.reconnect"), b -> join(mc, data)).bounds(0, 0, 200, 20).build();
		mine.add(button);
		widgets.add(button);
		follow(screen, button);
	}

	/** Our buttons (not another mod's "Reconnect"). */
	private static final java.util.Set<Button> mine = java.util.Collections.newSetFromMap(new java.util.WeakHashMap<>());

	/** Placed now, and every frame after: a resized window moves the game's buttons, ours goes with them. */
	private static void follow(Screen screen, Button button) {
		place(screen, button);
		net.fabricmc.fabric.api.client.screen.v1.ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> place(screen, button));
	}

	/** Centred under the screen's own buttons (kept on screen). */
	private static void place(Screen screen, Button button) {
		int bottom = Screens.getWidgets(screen).stream().filter(w -> w != button).mapToInt(w -> w.getY() + w.getHeight()).max().orElse(screen.height / 2);
		button.setX(screen.width / 2 - 100);
		button.setY(Math.min(screen.height - 24, bottom + 4));
	}

	private static void join(Minecraft mc, ServerData data) {
		Screen parent = new JoinMultiplayerScreen(new TitleScreen());
		//#if MC >= 1.20.5
		ConnectScreen.startConnecting(parent, mc, ServerAddress.parseString(data.ip), data, false, null);
		//#else
		//$ ConnectScreen.startConnecting(parent, mc, ServerAddress.parseString(data.ip), data, false);
		//#endif
	}
}
