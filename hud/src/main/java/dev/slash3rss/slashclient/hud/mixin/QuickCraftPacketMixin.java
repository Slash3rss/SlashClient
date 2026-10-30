package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.inventory.QuickCraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundContainerSetContentPacket;
import net.minecraft.network.protocol.game.ClientboundContainerSetSlotPacket;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The server's answer with a window's slots, for one-click crafting (QuickCraft). At the end, so only
 * the call on the game thread counts (the network thread's call stops early and hands the packet over).
 */
@Mixin(ClientPacketListener.class)
abstract class QuickCraftPacketMixin {
	@Inject(method = "handleContainerSetSlot", at = @At("TAIL"))
	private void slashclient$slot(ClientboundContainerSetSlotPacket packet, CallbackInfo ci) {
		QuickCraft.arrived(packet.getContainerId());
	}

	@Inject(method = "handleContainerContent", at = @At("TAIL"))
	private void slashclient$content(ClientboundContainerSetContentPacket packet, CallbackInfo ci) {
		//#if MC >= 1.21.5
		QuickCraft.arrived(packet.containerId());
		//#else
		//$ QuickCraft.arrived(packet.getContainerId());
		//#endif
	}
}
