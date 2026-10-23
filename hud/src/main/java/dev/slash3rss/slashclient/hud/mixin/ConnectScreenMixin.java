package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.SessionRenew;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** Every join of a server (the list, direct connect, invites, "Reconnect"): a session about to end is renewed first. */
@Mixin(ConnectScreen.class)
abstract class ConnectScreenMixin {
	//#if MC >= 1.20.5
	@Inject(method = "startConnecting", at = @At("HEAD"), cancellable = true)
	private static void slashclient$renewFirst(Screen parent, Minecraft mc, ServerAddress address, ServerData data, boolean quickPlay,
			net.minecraft.client.multiplayer.TransferState transfer, CallbackInfo ci) {
		if (SessionRenew.beforeConnect(mc, () -> ConnectScreen.startConnecting(parent, mc, address, data, quickPlay, transfer))) ci.cancel();
	}
	//#else
	//$ @Inject(method = "startConnecting", at = @At("HEAD"), cancellable = true)
	//$ private static void slashclient$renewFirst(Screen parent, Minecraft mc, ServerAddress address, ServerData data, boolean quickPlay, CallbackInfo ci) {
	//$ 	if (SessionRenew.beforeConnect(mc, () -> ConnectScreen.startConnecting(parent, mc, address, data, quickPlay))) ci.cancel();
	//$ }
	//#endif
}
