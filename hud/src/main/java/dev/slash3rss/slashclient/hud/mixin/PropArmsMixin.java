package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.Props;
import net.minecraft.client.model.player.PlayerModel;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * A player pushing a prop (Props) holds its grips: after the player model has posed itself for the
 * frame, both arms are turned forwards and down instead of swinging; a player playing an emote
 * moves as it says (Emotes). From 1.21.2 the model is posed
 * from a render state (named by the entity's id; PlayerRenderState before 1.21.9), before from the
 * entity itself, where the sleeves are separate parts that follow the arms.
 */
@Mixin(PlayerModel.class)
abstract class PropArmsMixin {
	//#if MC >= 1.21.2
	@Inject(method = "setupAnim(Lnet/minecraft/client/renderer/entity/state/AvatarRenderState;)V", at = @At("TAIL"))
	private void slashclient$holdProp(net.minecraft.client.renderer.entity.state.AvatarRenderState state, CallbackInfo ci) {
		net.minecraft.client.Minecraft mc = net.minecraft.client.Minecraft.getInstance();
		if (mc.level == null) return;
		PlayerModel self = (PlayerModel) (Object) this;
		var entity = mc.level.getEntity(state.id);
		Props.holdArms(entity, state.isCrouching, self.rightArm, self.leftArm);
		// an emote's moves (the hat, jacket and sleeves are children of their parts here)
		dev.slash3rss.slashclient.hud.Emotes.pose(entity, self.head, self.body, self.rightArm, self.leftArm, self.rightLeg, self.leftLeg);
	}
	//#else
	//$ @Inject(method = "setupAnim(Lnet/minecraft/world/entity/LivingEntity;FFFFF)V", at = @At("TAIL"))
	//$ private void slashclient$holdProp(net.minecraft.world.entity.LivingEntity entity, float limbSwing, float limbSwingAmount, float age, float headYaw, float headPitch, CallbackInfo ci) {
	//$ 	PlayerModel<?> self = (PlayerModel<?>) (Object) this;
	//$ 	Props.holdArms(entity, entity.isCrouching(), self.rightArm, self.leftArm);
	//$ 	self.rightSleeve.copyFrom(self.rightArm);
	//$ 	self.leftSleeve.copyFrom(self.leftArm);
	//$ 	dev.slash3rss.slashclient.hud.Emotes.pose(entity, self.head, self.body, self.rightArm, self.leftArm, self.rightLeg, self.leftLeg,
	//$ 		self.hat, self.jacket, self.rightSleeve, self.leftSleeve, self.rightPants, self.leftPants);
	//$ }
	//#endif
}
