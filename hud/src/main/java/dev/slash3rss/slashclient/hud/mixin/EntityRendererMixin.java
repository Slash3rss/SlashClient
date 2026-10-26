package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Badges;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The same logo in the name above the heads of other SlashClient players, and their emotes; everyone's ping after it (NametagPing). */
@Mixin(EntityRenderer.class)
abstract class EntityRendererMixin {
	//#if MC >= 1.21.2
	@ModifyReturnValue(method = "getNameTag", at = @At("RETURN"))
	private Component slashclient$badge(Component name, Entity entity) {
	//#else
	//$ // before render states the name goes straight into renderNameTag
	//$ @org.spongepowered.asm.mixin.injection.ModifyVariable(method = "renderNameTag", at = @At("HEAD"), argsOnly = true)
	//#if MC >= 1.20.2
	//$ private Component slashclient$badge(Component name, Entity entity, Component same, com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.MultiBufferSource buffers, int light, float partialTick) {
	//#else
	//$ private Component slashclient$badge(Component name, Entity entity, Component same, com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.MultiBufferSource buffers, int light) {
	//#endif
	//#endif
		//#if MC >= 1.21.2
		// the ping after the name (before render states the players' renderer adds it: LivePlayerNametagMixin, so the score line keeps none)
		name = dev.slash3rss.slashclient.hud.NametagPing.decorate(entity, name);
		//#endif
		return entity instanceof Player ? dev.slash3rss.slashclient.hud.Cosmetics.decorate(entity.getUUID(), Badges.decorateNametag(entity.getUUID(), dev.slash3rss.slashclient.hud.NickHider.apply(name))) : name;
	}
}
