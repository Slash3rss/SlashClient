package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.21.9
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
//#else
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import dev.slash3rss.slashclient.hud.LiveTag;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//$ import net.minecraft.client.renderer.entity.player.PlayerRenderer;
//$ import net.minecraft.network.chat.Component;
//$ import org.spongepowered.asm.mixin.injection.At;
//#endif
//#if MC >= 1.21.9 && MC < 26.1
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//$ import com.llamalad7.mixinextras.sugar.Local;
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import dev.slash3rss.slashclient.hud.LiveTag;
//$ import net.minecraft.client.renderer.SubmitNodeCollector;
//$ import net.minecraft.client.renderer.entity.state.AvatarRenderState;
//$ import net.minecraft.client.renderer.state.CameraRenderState;
//$ import net.minecraft.network.chat.Component;
//$ import net.minecraft.world.phys.Vec3;
//$ import org.spongepowered.asm.mixin.injection.At;
//#endif

/**
 * "● NA ŻYWO" above a live player's name before 26.1, where the players' renderer draws its own
 * name tag (with the score under it): right after the name, the same call once more one line
 * higher, so it is drawn exactly like the name (sneaking, through walls, distance). From 26.1 the
 * entities' name drawing does it (LiveNametagMixin) and this mixin is empty.
 */
//#if MC >= 1.21.9
@Mixin(AvatarRenderer.class)
//#else
//$ @Mixin(PlayerRenderer.class)
//#endif
abstract class LivePlayerNametagMixin {
	//#if MC >= 26.1
	//#elif MC >= 1.21.9
	//$ @WrapOperation(method = "submitNameTag(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/CameraRenderState;)V",
	//$ 	at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/SubmitNodeCollector;submitNameTag(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/world/phys/Vec3;ILnet/minecraft/network/chat/Component;ZIDLnet/minecraft/client/renderer/state/CameraRenderState;)V", ordinal = 1))
	//$ private void slashclient$liveLine(SubmitNodeCollector nodes, PoseStack pose, Vec3 at, int offset, Component name, boolean seeThrough, int light, double distance, CameraRenderState camera,
	//$ 	Operation<Void> original, @Local(argsOnly = true) AvatarRenderState state) {
	//$ 	original.call(nodes, pose, at, offset, name, seeThrough, light, distance, camera);
	//$ 	Component live = ((LiveTag) state).slashclient$live();
	//$ 	if (live == null) return;
	//$ 	pose.pushPose();
	//$ 	pose.translate(0, LiveTag.LINE, 0);
	//$ 	original.call(nodes, pose, at, offset, live, seeThrough, light, distance, camera);
	//$ 	pose.popPose();
	//$ }
	//#elif MC >= 1.21.2
	//$ @WrapOperation(method = "renderNameTag(Lnet/minecraft/client/renderer/entity/state/PlayerRenderState;Lnet/minecraft/network/chat/Component;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",
	//$ 	at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/LivingEntityRenderer;renderNameTag(Lnet/minecraft/client/renderer/entity/state/EntityRenderState;Lnet/minecraft/network/chat/Component;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", ordinal = 1))
	//$ private void slashclient$liveLine(PlayerRenderer self, net.minecraft.client.renderer.entity.state.EntityRenderState state, Component name, PoseStack pose, MultiBufferSource buffers, int light, Operation<Void> original) {
	//$ 	original.call(self, state, name, pose, buffers, light);
	//$ 	Component live = ((LiveTag) state).slashclient$live();
	//$ 	if (live == null) return;
	//$ 	pose.pushPose();
	//$ 	pose.translate(0, LiveTag.LINE, 0);
	//$ 	original.call(self, state, live, pose, buffers, light);
	//$ 	pose.popPose();
	//$ }
	//#elif MC >= 1.20.2
	//$ @WrapOperation(method = "renderNameTag(Lnet/minecraft/client/player/AbstractClientPlayer;Lnet/minecraft/network/chat/Component;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IF)V",
	//$ 	at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/LivingEntityRenderer;renderNameTag(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/network/chat/Component;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;IF)V", ordinal = 1))
	//$ private void slashclient$liveLine(PlayerRenderer self, net.minecraft.world.entity.Entity entity, Component name, PoseStack pose, MultiBufferSource buffers, int light, float partialTick, Operation<Void> original) {
	//$ 	original.call(self, entity, name, pose, buffers, light, partialTick);
	//$ 	Component live = dev.slash3rss.slashclient.hud.Badges.liveLabel(entity.getUUID());
	//$ 	if (live == null) return;
	//$ 	pose.pushPose();
	//$ 	pose.translate(0, LiveTag.LINE, 0);
	//$ 	original.call(self, entity, live, pose, buffers, light, partialTick);
	//$ 	pose.popPose();
	//$ }
	//#else
	//$ @WrapOperation(method = "renderNameTag(Lnet/minecraft/client/player/AbstractClientPlayer;Lnet/minecraft/network/chat/Component;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V",
	//$ 	at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/LivingEntityRenderer;renderNameTag(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/network/chat/Component;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;I)V", ordinal = 1))
	//$ private void slashclient$liveLine(PlayerRenderer self, net.minecraft.world.entity.Entity entity, Component name, PoseStack pose, MultiBufferSource buffers, int light, Operation<Void> original) {
	//$ 	original.call(self, entity, name, pose, buffers, light);
	//$ 	Component live = dev.slash3rss.slashclient.hud.Badges.liveLabel(entity.getUUID());
	//$ 	if (live == null) return;
	//$ 	pose.pushPose();
	//$ 	pose.translate(0, LiveTag.LINE, 0);
	//$ 	original.call(self, entity, live, pose, buffers, light);
	//$ 	pose.popPose();
	//$ }
	//#endif
}
