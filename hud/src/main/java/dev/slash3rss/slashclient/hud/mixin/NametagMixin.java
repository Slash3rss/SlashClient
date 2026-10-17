package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.GameHud;
//#if MC >= 1.21.9
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.world.entity.Avatar;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Your own name above your head in third person (F5); the game never shows the camera's own name. */
//#if MC >= 1.21.9
@Mixin(AvatarRenderer.class)
//#elif MC >= 1.21.2
//$ @Mixin(net.minecraft.client.renderer.entity.player.PlayerRenderer.class)
//#else
//$ @Mixin(net.minecraft.client.renderer.entity.LivingEntityRenderer.class)
//#endif
abstract class NametagMixin {
	//#if MC < 1.21.2
	//$ // before render states the living renderer decides for every player
	//$ @ModifyReturnValue(method = "shouldShowName(Lnet/minecraft/world/entity/LivingEntity;)Z", at = @At("RETURN"))
	//$ private boolean slashclient$ownName(boolean shown, net.minecraft.world.entity.LivingEntity entity) {
	//$ 	return shown || GameHud.ownNametag(entity);
	//$ }
	//#else
	@ModifyReturnValue(method = "shouldShowName(Lnet/minecraft/world/entity/Avatar;D)Z", at = @At("RETURN"))
	private boolean slashclient$ownName(boolean shown, Avatar entity, double distance) {
		return shown || GameHud.ownNametag(entity);
	}
//#endif
}
