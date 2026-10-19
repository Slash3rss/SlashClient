package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.SlotLock;
import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Locked hotbar slots (SlotLock): a click in an inventory that would empty or swap one is never
 * made, neither on the client nor sent to the server. Every slot click of the open container
 * (mouse, number keys, Q, the offhand key) goes through here.
 */
@Mixin(MultiPlayerGameMode.class)
abstract class SlotLockMixin {
	//#if MC >= 26.1
	@Inject(method = "handleContainerInput", at = @At("HEAD"), cancellable = true)
	private void slashclient$lockedSlot(int containerId, int slotId, int button, net.minecraft.world.inventory.ContainerInput input, Player player, CallbackInfo ci) {
		if (SlotLock.blocks(player, containerId, slotId, button, input.name())) ci.cancel();
	}
	//#else
	//$ @Inject(method = "handleInventoryMouseClick", at = @At("HEAD"), cancellable = true)
	//$ private void slashclient$lockedSlot(int containerId, int slotId, int button, net.minecraft.world.inventory.ClickType input, Player player, CallbackInfo ci) {
	//$ 	if (SlotLock.blocks(player, containerId, slotId, button, input.name())) ci.cancel();
	//$ }
	//#endif
}
