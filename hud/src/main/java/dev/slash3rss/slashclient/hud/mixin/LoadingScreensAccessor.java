package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** What the game's "connecting" screen says now (connecting, logging in, joining the world…), for our loading screen. */
@Mixin(ConnectScreen.class)
public interface LoadingScreensAccessor {
	@Accessor("status")
	Component slashclient$status();
}
