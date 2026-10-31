package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.gamehud.HitMarker;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundDamageEventPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The server tells about each entity's damage, with who caused it and what dealt it: our arrows'
 * hits for the hit marker (HitMarker). At the end, so only the call on the game thread counts.
 */
@Mixin(ClientPacketListener.class)
abstract class DamageEventMixin {
	@Inject(method = "handleDamageEvent", at = @At("TAIL"))
	private void slashclient$hitMarker(ClientboundDamageEventPacket packet, CallbackInfo ci) {
		HitMarker.damaged(packet.entityId(), packet.sourceCauseId(), packet.sourceDirectId());
	}
}
