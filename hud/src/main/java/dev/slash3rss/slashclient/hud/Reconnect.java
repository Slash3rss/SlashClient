package dev.slash3rss.slashclient.hud;

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

/** A "Reconnect" button on the screen you get when a server drops you: back to the same server. */
final class Reconnect {
	private Reconnect() {}

	/** The server played on last (none after singleplayer). */
	private static ServerData last;

	static void joined(Minecraft mc) {
		last = mc.isLocalServer() ? null : mc.getCurrentServer();
	}

	/** Under the screen's own buttons. */
	static void addButton(Minecraft mc, Screen screen) {
		if (SlashHud.config == null || !SlashHud.config.reconnect || last == null) return;
		var widgets = Screens.getWidgets(screen);
		int bottom = widgets.stream().mapToInt(w -> w.getY() + w.getHeight()).max().orElse(screen.height / 2);
		ServerData data = last;
		widgets.add(Button.builder(Component.translatable("slashclient-hud.reconnect"), b -> join(mc, data))
			.bounds(screen.width / 2 - 100, Math.min(screen.height - 24, bottom + 4), 200, 20).build());
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
