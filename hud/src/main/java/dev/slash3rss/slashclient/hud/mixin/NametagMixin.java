package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.GameHud;
import net.minecraft.client.renderer.entity.player.AvatarRenderer;
import net.minecraft.world.entity.Avatar;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Your own name above your head in third person (F5); the game never shows the camera's own name. */
@Mixin(AvatarRenderer.class)
abstract class NametagMixin {
	@ModifyReturnValue(method = "shouldShowName(Lnet/minecraft/world/entity/Avatar;D)Z", at = @At("RETURN"))
	private boolean slashclient$ownName(boolean shown, Avatar entity, double distance) {
		return shown || GameHud.ownNametag(entity);
	}
}
