package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ServerPacks;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * For the test: what the integrated server hears back about a resource pack (kept only while
 * ServerPacks is listening). At the end of the handler, which runs once on the server thread.
 */
//#if MC >= 1.20.3
@Mixin(net.minecraft.server.network.ServerCommonPacketListenerImpl.class)
//#else
//$ @Mixin(net.minecraft.server.network.ServerGamePacketListenerImpl.class)
//#endif
abstract class ResourcePackAnswerMixin {
	//#if MC >= 1.20.3
	@Inject(method = "handleResourcePackResponse", at = @At("TAIL"))
	private void slashclient$heard(net.minecraft.network.protocol.common.ServerboundResourcePackPacket packet, CallbackInfo ci) {
		ServerPacks.heard(packet.action().name());
	}
	//#else
	//$ @Inject(method = "handleResourcePackResponse", at = @At("TAIL"))
	//$ private void slashclient$heard(net.minecraft.network.protocol.game.ServerboundResourcePackPacket packet, CallbackInfo ci) {
	//$ 	ServerPacks.heard(packet.getAction().name());
	//$ }
	//#endif
}
