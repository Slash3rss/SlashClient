package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.gamehud.BlockOutline;
import net.minecraft.client.renderer.LevelRenderer;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
//#if MC >= 1.21.11
import org.spongepowered.asm.mixin.injection.ModifyArg;
//#elif MC >= 1.21.2
//$ import org.spongepowered.asm.mixin.injection.Inject;
//$ import org.spongepowered.asm.mixin.injection.ModifyArg;
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#else
//$ import org.spongepowered.asm.mixin.injection.Inject;
//$ import org.spongepowered.asm.mixin.injection.ModifyArgs;
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//$ import org.spongepowered.asm.mixin.injection.invoke.arg.Args;
//#endif

/**
 * The block outline in our colour and thickness (BlockOutline). From 1.21.2 the outline is drawn
 * by a call that takes its colour (and from 1.21.11 its width); with the high contrast option the
 * game draws a thick black line first and then the coloured one: only the second call (ordinal 1
 * in the code, the one always made) is changed. Before 1.21.2 the colour is fixed inside
 * renderHitOutline and is changed at its renderShape call.
 */
@Mixin(LevelRenderer.class)
abstract class BlockOutlineMixin {
	//#if MC >= 26.2
	@ModifyArg(method = "submitBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;submitHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/rendertype/RenderType;Lnet/minecraft/client/renderer/state/level/BlockOutlineRenderState;IFZ)V"), index = 4)
	private int slashclient$outlineColor(int color) {
		return BlockOutline.color(color);
	}

	@ModifyArg(method = "submitBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;submitHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/rendertype/RenderType;Lnet/minecraft/client/renderer/state/level/BlockOutlineRenderState;IFZ)V"), index = 5)
	private float slashclient$outlineWidth(float width) {
		return BlockOutline.width(width);
	}
	//#elif MC >= 26.1
	//$ @ModifyArg(method = "renderBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;renderHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;DDDLnet/minecraft/client/renderer/state/level/BlockOutlineRenderState;IF)V"), index = 6)
	//$ private int slashclient$outlineColor(int color) {
	//$ 	return BlockOutline.color(color);
	//$ }
	//$
	//$ @ModifyArg(method = "renderBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;renderHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;DDDLnet/minecraft/client/renderer/state/level/BlockOutlineRenderState;IF)V"), index = 7)
	//$ private float slashclient$outlineWidth(float width) {
	//$ 	return BlockOutline.width(width);
	//$ }
	//#elif MC >= 1.21.11
	//$ @ModifyArg(method = "renderBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;renderHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;DDDLnet/minecraft/client/renderer/state/BlockOutlineRenderState;IF)V"), index = 6)
	//$ private int slashclient$outlineColor(int color) {
	//$ 	return BlockOutline.color(color);
	//$ }
	//$
	//$ @ModifyArg(method = "renderBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;renderHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;DDDLnet/minecraft/client/renderer/state/BlockOutlineRenderState;IF)V"), index = 7)
	//$ private float slashclient$outlineWidth(float width) {
	//$ 	return BlockOutline.width(width);
	//$ }
	//#elif MC >= 1.21.10
	//$ @ModifyArg(method = "renderBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;renderHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;DDDLnet/minecraft/client/renderer/state/BlockOutlineRenderState;I)V"), index = 6)
	//$ private int slashclient$outlineColor(int color) {
	//$ 	BlockOutline.markWidth();
	//$ 	return BlockOutline.color(color);
	//$ }
	//$
	//$ // the batch is drawn (endLastBatch) before the method returns
	//$ @Inject(method = "renderBlockOutline", at = @At("RETURN"))
	//$ private void slashclient$outlineDone(CallbackInfo ci) {
	//$ 	BlockOutline.widthPending = false;
	//$ }
	//#elif MC >= 1.21.2
	//$ @ModifyArg(method = "renderBlockOutline", at = @At(value = "INVOKE", ordinal = 1, target = "Lnet/minecraft/client/renderer/LevelRenderer;renderHitOutline(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;Lnet/minecraft/world/entity/Entity;DDDLnet/minecraft/core/BlockPos;Lnet/minecraft/world/level/block/state/BlockState;I)V"), index = 8)
	//$ private int slashclient$outlineColor(int color) {
	//$ 	BlockOutline.markWidth();
	//$ 	return BlockOutline.color(color);
	//$ }
	//$
	//$ // the batch is drawn (endLastBatch) before the method returns
	//$ @Inject(method = "renderBlockOutline", at = @At("RETURN"))
	//$ private void slashclient$outlineDone(CallbackInfo ci) {
	//$ 	BlockOutline.widthPending = false;
	//$ }
	//#else
	//$ @ModifyArgs(method = "renderHitOutline", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/LevelRenderer;renderShape(Lcom/mojang/blaze3d/vertex/PoseStack;Lcom/mojang/blaze3d/vertex/VertexConsumer;Lnet/minecraft/world/phys/shapes/VoxelShape;DDDFFFF)V"))
	//$ private void slashclient$outlineColor(Args args) {
	//$ 	int vanilla = Math.round((float) args.get(9) * 255f) << 24;
	//$ 	int color = BlockOutline.color(vanilla);
	//$ 	if (color == vanilla) return;
	//$ 	args.set(6, (color >> 16 & 0xFF) / 255f);
	//$ 	args.set(7, (color >> 8 & 0xFF) / 255f);
	//$ 	args.set(8, (color & 0xFF) / 255f);
	//$ 	args.set(9, (color >>> 24) / 255f);
	//$ }
	//$
	//$ // the lines are drawn later in renderLevel, with the next batch change or endLastBatch
	//$ @Inject(method = "renderHitOutline", at = @At("HEAD"))
	//$ private void slashclient$outlineStart(CallbackInfo ci) {
	//$ 	BlockOutline.markWidth();
	//$ }
	//$
	//$ @Inject(method = "renderLevel", at = @At("RETURN"))
	//$ private void slashclient$outlineDone(CallbackInfo ci) {
	//$ 	BlockOutline.widthPending = false;
	//$ }
	//#endif
}
