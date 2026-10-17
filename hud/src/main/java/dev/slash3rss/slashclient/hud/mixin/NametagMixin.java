package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.GameHud;
//#if MC >= 1.21.9
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.world.entity.Avatar;
//#else
//$ import net.minecraft.client.renderer.entity.LivingEntityRenderer;
//$ import net.minecraft.world.entity.LivingEntity;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Your own name above your head in third person (F5); the game never shows the camera's own name. */
//#if MC >= 1.21.9
@Mixin(AvatarRenderer.class)
abstract class NametagMixin {
	@ModifyReturnValue(method = "shouldShowName(Lnet/minecraft/world/entity/Avatar;D)Z", at = @At("RETURN"))
	private boolean slashclient$ownName(boolean shown, Avatar entity, double distance) {
//#else
//$ // before 1.21.9 players' renderer has no check of its own: the living entities' one is used
//$ @Mixin(LivingEntityRenderer.class)
//$ abstract class NametagMixin {
//$ 	@ModifyReturnValue(method = "shouldShowName(Lnet/minecraft/world/entity/LivingEntity;D)Z", at = @At("RETURN"))
//$ 	private boolean slashclient$ownName(boolean shown, LivingEntity entity, double distance) {
//#endif
		return shown || GameHud.ownNametag(entity);
	}
}
