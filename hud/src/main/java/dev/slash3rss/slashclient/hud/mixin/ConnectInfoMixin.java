package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.SlashLoading;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The server a join is for (its name, address and icon), noted for the loading screen. Only read:
 * the join itself goes on untouched (the session renewal in ConnectScreenMixin may hold it first).
 */
@Mixin(ConnectScreen.class)
abstract class ConnectInfoMixin {
	//#if MC >= 1.20.5
	@Inject(method = "startConnecting", at = @At("HEAD"))
	private static void slashclient$note(Screen parent, Minecraft mc, ServerAddress address, ServerData data, boolean quickPlay,
			net.minecraft.client.multiplayer.TransferState transfer, CallbackInfo ci) {
		SlashLoading.joining(data, address);
	}
	//#else
	//$ @Inject(method = "startConnecting", at = @At("HEAD"))
	//$ private static void slashclient$note(Screen parent, Minecraft mc, ServerAddress address, ServerData data, boolean quickPlay, CallbackInfo ci) {
	//$ 	SlashLoading.joining(data, address);
	//$ }
	//#endif
}
