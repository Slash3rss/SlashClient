package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.modules.ExtraModules;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundSetTimePacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The server sends its game time every second; how far it moved tells the server's ticks per
 * second. At the end, so only the call on the game thread counts (the network thread's call
 * stops early and hands the packet over).
 */
@Mixin(ClientPacketListener.class)
abstract class TimePacketMixin {
	@Inject(method = "handleSetTime", at = @At("TAIL"))
	private void slashclient$tps(ClientboundSetTimePacket packet, CallbackInfo ci) {
		ExtraModules.Stats.timePacket(packet.gameTime());
	}
}
