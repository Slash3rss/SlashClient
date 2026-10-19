package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.vertex.PoseStack;
import dev.slash3rss.slashclient.hud.HeldItems;
//#if MC >= 26.3
import net.minecraft.client.renderer.FirstPersonHandsAndItemsRenderer;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.state.level.FirstPersonHandsAndItemsRenderState;
import net.minecraft.client.renderer.state.level.PlayerRenderState;
//#elif MC >= 1.21.10
//$ import net.minecraft.client.player.AbstractClientPlayer;
//$ import net.minecraft.client.renderer.ItemInHandRenderer;
//$ import net.minecraft.client.renderer.SubmitNodeCollector;
//#else
//$ import net.minecraft.client.player.AbstractClientPlayer;
//$ import net.minecraft.client.renderer.ItemInHandRenderer;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//#endif
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Held items in first person (HeldItems): changed right before the item is drawn, at both of the
 * arm method's item calls (a crossbow has its own). 26.3 moved first person hands to
 * FirstPersonHandsAndItemsRenderer, 26.2 named the arm method submit…, 1.21.5 dropped renderItem's
 * left-hand flag and 1.21.10 drew through a SubmitNodeCollector.
 */
//#if MC >= 26.3
@Mixin(FirstPersonHandsAndItemsRenderer.class)
//#else
//$ @Mixin(ItemInHandRenderer.class)
//#endif
abstract class HeldItemsMixin {
	//#if MC >= 26.3
	@Inject(method = "submitArmWithItem", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/item/ItemStackRenderState;submit(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;III)V"))
	private void slashclient$heldItem(PlayerRenderState player, FirstPersonHandsAndItemsRenderState state, float frameInterp, float xRot, InteractionHand hand, float attack,
		ItemStack stack, float inverseArmHeight, PoseStack pose, SubmitNodeCollector collector, int light, CallbackInfo ci) {
	//#elif MC >= 26.2
	//$ @Inject(method = "submitArmWithItem", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/ItemInHandRenderer;renderItem(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;I)V"))
	//$ private void slashclient$heldItem(AbstractClientPlayer player, float frameInterp, float xRot, InteractionHand hand, float attack,
	//$ 	ItemStack stack, float inverseArmHeight, PoseStack pose, SubmitNodeCollector collector, int light, CallbackInfo ci) {
	//#elif MC >= 1.21.10
	//$ @Inject(method = "renderArmWithItem", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/ItemInHandRenderer;renderItem(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;I)V"))
	//$ private void slashclient$heldItem(AbstractClientPlayer player, float frameInterp, float xRot, InteractionHand hand, float attack,
	//$ 	ItemStack stack, float inverseArmHeight, PoseStack pose, SubmitNodeCollector collector, int light, CallbackInfo ci) {
	//#elif MC >= 1.21.5
	//$ @Inject(method = "renderArmWithItem", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/ItemInHandRenderer;renderItem(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V"))
	//$ private void slashclient$heldItem(AbstractClientPlayer player, float frameInterp, float xRot, InteractionHand hand, float attack,
	//$ 	ItemStack stack, float inverseArmHeight, PoseStack pose, MultiBufferSource buffers, int light, CallbackInfo ci) {
	//#else
	//$ @Inject(method = "renderArmWithItem", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/ItemInHandRenderer;renderItem(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;ZLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V"))
	//$ private void slashclient$heldItem(AbstractClientPlayer player, float frameInterp, float xRot, InteractionHand hand, float attack,
	//$ 	ItemStack stack, float inverseArmHeight, PoseStack pose, MultiBufferSource buffers, int light, CallbackInfo ci) {
	//#endif
		HeldItems.apply(pose, hand, stack);
	}
}
