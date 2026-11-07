package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.skyup.DungeonRun;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientPacketListener;
import net.minecraft.network.protocol.game.ClientboundTakeItemEntityPacket;
import net.minecraft.world.entity.item.ItemEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * The server tells that a player picked up an item: ours, in a dungeon, is what the trip got (DungeonRun), even
 * when a backpack takes it out of the inventory at once. At the start of the call on the game thread, while the
 * item is still whole (the network thread's call only hands the packet over).
 */
@Mixin(ClientPacketListener.class)
abstract class DungeonLootMixin {
	@Inject(method = "handleTakeItemEntity", at = @At("HEAD"))
	private void slashclient$pickedUp(ClientboundTakeItemEntityPacket packet, CallbackInfo ci) {
		Minecraft mc = Minecraft.getInstance();
		if (!mc.isSameThread() || mc.player == null || mc.level == null || !DungeonRun.running()) return;
		if (packet.getPlayerId() != mc.player.getId()) return;
		if (mc.level.getEntity(packet.getItemId()) instanceof ItemEntity item) DungeonRun.pickedUp(item.getItem(), packet.getAmount());
	}
}
