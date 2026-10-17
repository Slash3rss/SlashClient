package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Latency;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.ping.ClientboundPongResponsePacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** The server's answers to ping packets: the measured ping for the HUD. */
@Mixin(ClientPacketListener.class)
abstract class PongMixin {
	@Inject(method = "handlePongResponse", at = @At("HEAD"))
	private void slashclient$pong(ClientboundPongResponsePacket packet, CallbackInfo ci) {
		Latency.pong(packet.time());
	}
}
