package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Badges;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The same logo in the name above the heads of other SlashClient players, and their emotes. */
@Mixin(EntityRenderer.class)
abstract class EntityRendererMixin {
	//#if MC >= 1.20.2
	@ModifyReturnValue(method = "getNameTag", at = @At("RETURN"))
	private Component slashclient$badge(Component name, Entity entity) {
		return entity instanceof Player ? dev.slash3rss.slashclient.hud.Cosmetics.decorate(entity.getUUID(), Badges.decorate(entity.getUUID(), name)) : name;
	}
	//#else
	//$ @org.spongepowered.asm.mixin.injection.ModifyVariable(method = "renderNameTag", at = @At("HEAD"), argsOnly = true)
	//$ private Component slashclient$badge(Component name, Entity entity) {
	//$ 	return entity instanceof Player ? dev.slash3rss.slashclient.hud.Cosmetics.decorate(entity.getUUID(), Badges.decorate(entity.getUUID(), name)) : name;
	//$ }
	//#endif
}
