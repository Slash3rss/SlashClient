package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.renderer.entity.EntityRenderer;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.21.2
import dev.slash3rss.slashclient.hud.players.Badges;
import dev.slash3rss.slashclient.hud.players.LiveTag;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif
//#if MC >= 26.1
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import com.llamalad7.mixinextras.sugar.Local;
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.state.level.CameraRenderState;
import net.minecraft.network.chat.Component;
import net.minecraft.world.phys.Vec3;
//#endif

/**
 * "● NA ŻYWO" one line above the name of a SlashClient player live on Twitch or Kick (Badges.liveLabel):
 * the label goes into the render state with the name (1.21.2+), and from 26.1 the name tag drawing
 * here submits it right after the name, through the same call, so sneaking, seeing through walls,
 * F1 and distance work as for the name itself. Before 26.1 the players' renderer draws it
 * (LivePlayerNametagMixin). Nothing is drawn where the name is not (your own in first person).
 */
@Mixin(EntityRenderer.class)
abstract class LiveNametagMixin {
	//#if MC >= 1.21.2
	// "extract" + "RenderState": the preprocessor renames the whole word for the GUI before 26.1, but entities keep this name since 1.21.2
	@Inject(method = "extract" + "RenderState(Lnet/minecraft/world/entity/Entity;Lnet/minecraft/client/renderer/entity/state/EntityRenderState;F)V", at = @At("TAIL"))
	private void slashclient$liveLabel(Entity entity, EntityRenderState state, float partialTick, CallbackInfo ci) {
		((LiveTag) state).slashclient$setLive(entity instanceof Player ? Badges.liveLabel(entity.getUUID()) : null);
	}
	//#endif

	//#if MC >= 26.2
	@WrapOperation(method = "submitNameDisplay(Lnet/minecraft/client/renderer/entity/state/EntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/level/CameraRenderState;I)V",
		at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/SubmitNodeCollector;submitNameTag(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/world/phys/Vec3;ILnet/minecraft/network/chat/Component;ZILnet/minecraft/client/renderer/state/level/CameraRenderState;)V", ordinal = 1))
	private void slashclient$liveLine(SubmitNodeCollector nodes, PoseStack pose, Vec3 at, int offset, Component name, boolean seeThrough, int light, CameraRenderState camera,
		Operation<Void> original, @Local(argsOnly = true) EntityRenderState state) {
		original.call(nodes, pose, at, offset, name, seeThrough, light, camera);
		Component live = ((LiveTag) state).slashclient$live();
		if (live == null) return;
		pose.pushPose();
		pose.translate(0, LiveTag.LINE, 0);
		original.call(nodes, pose, at, offset, live, seeThrough, light, camera);
		pose.popPose();
	}
	//#elif MC >= 26.1
	//$ @WrapOperation(method = "submitNameDisplay(Lnet/minecraft/client/renderer/entity/state/EntityRenderState;Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/SubmitNodeCollector;Lnet/minecraft/client/renderer/state/level/CameraRenderState;I)V",
	//$ 	at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/SubmitNodeCollector;submitNameTag(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/world/phys/Vec3;ILnet/minecraft/network/chat/Component;ZIDLnet/minecraft/client/renderer/state/level/CameraRenderState;)V", ordinal = 1))
	//$ private void slashclient$liveLine(SubmitNodeCollector nodes, PoseStack pose, Vec3 at, int offset, Component name, boolean seeThrough, int light, double distance, CameraRenderState camera,
	//$ 	Operation<Void> original, @Local(argsOnly = true) EntityRenderState state) {
	//$ 	original.call(nodes, pose, at, offset, name, seeThrough, light, distance, camera);
	//$ 	Component live = ((LiveTag) state).slashclient$live();
	//$ 	if (live == null) return;
	//$ 	pose.pushPose();
	//$ 	pose.translate(0, LiveTag.LINE, 0);
	//$ 	original.call(nodes, pose, at, offset, live, seeThrough, light, distance, camera);
	//$ 	pose.popPose();
	//$ }
	//#endif
}
