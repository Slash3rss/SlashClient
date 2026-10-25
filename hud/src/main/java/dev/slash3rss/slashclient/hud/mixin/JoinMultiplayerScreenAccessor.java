package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen;
import net.minecraft.client.multiplayer.ServerData;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;
import org.spongepowered.asm.mixin.gen.Invoker;

/** What our server list (ui.SlashServerScreen) uses of the game's own: where it came from, joining and deleting the game's way. */
@Mixin(JoinMultiplayerScreen.class)
public interface JoinMultiplayerScreenAccessor {
	@Accessor("lastScreen")
	Screen slashclient$lastScreen();

	@Invoker("join")
	void slashclient$join(ServerData server);

	@Invoker("deleteCallback")
	void slashclient$deleteCallback(boolean confirmed);

	/** The list read again, as its "Refresh" button does. */
	@Invoker("refreshServerList")
	void slashclient$refreshServerList();
}
