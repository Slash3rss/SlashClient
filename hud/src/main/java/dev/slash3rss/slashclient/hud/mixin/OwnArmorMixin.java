package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.players.OwnArmor;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
//#if MC >= 1.21.4
import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
//#else
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import net.minecraft.client.model.HumanoidModel;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//$ import net.minecraft.client.renderer.entity.layers.HumanoidArmorLayer;
//$ import org.spongepowered.asm.mixin.injection.Inject;
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif

/**
 * Our own armour hidden on our own player (OwnArmor). From 1.21.4 the armour a humanoid's render
 * state gets comes from one place, for every slot: a hidden piece becomes nothing there, so the
 * armour and elytra layers skip it and our cosmetics show as without it. Before, the armour layer
 * draws each piece straight from the entity (the elytra: OwnElytraMixin).
 */
//#if MC >= 1.21.4
@Mixin(HumanoidMobRenderer.class)
abstract class OwnArmorMixin {
	@ModifyReturnValue(method = "getEquipmentIfRenderable", at = @At("RETURN"))
	private static ItemStack slashclient$hideOwn(ItemStack item, LivingEntity entity, EquipmentSlot slot) {
		return OwnArmor.hidden(entity, slot, item) ? ItemStack.EMPTY : item;
	}
}
//#else
//$ @Mixin(HumanoidArmorLayer.class)
//$ abstract class OwnArmorMixin {
//$ 	@Inject(method = "renderArmorPiece", at = @At("HEAD"), cancellable = true)
//$ 	private void slashclient$hideOwn(PoseStack pose, MultiBufferSource buffers, LivingEntity entity, EquipmentSlot slot, int light, HumanoidModel<?> model, CallbackInfo ci) {
//$ 		if (OwnArmor.hidden(entity, slot, entity.getItemBySlot(slot))) ci.cancel();
//$ 	}
//$ }
//#endif
