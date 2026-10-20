package dev.slash3rss.slashclient.hud.mixin;

//#if MC >= 1.21.4
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
//#else
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import dev.slash3rss.slashclient.hud.OwnArmor;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//$ import net.minecraft.client.renderer.entity.layers.ElytraLayer;
//$ import net.minecraft.world.entity.EquipmentSlot;
//$ import net.minecraft.world.entity.LivingEntity;
//$ import org.spongepowered.asm.mixin.injection.At;
//$ import org.spongepowered.asm.mixin.injection.Inject;
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif
import org.spongepowered.asm.mixin.Mixin;

/**
 * Our own elytra hidden on our own player, when asked for (OwnArmor), before 1.21.4: the elytra
 * layer reads the chest slot itself. From 1.21.4 OwnArmorMixin covers it and this mixin is empty.
 */
//#if MC >= 1.21.4
@Mixin(HumanoidMobRenderer.class)
abstract class OwnElytraMixin {}
//#else
//$ @Mixin(ElytraLayer.class)
//$ abstract class OwnElytraMixin {
//$ 	@Inject(method = "render(Lcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;ILnet/minecraft/world/entity/LivingEntity;FFFFFF)V", at = @At("HEAD"), cancellable = true)
//$ 	private void slashclient$hideOwn(PoseStack pose, MultiBufferSource buffers, int light, LivingEntity entity, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch, CallbackInfo ci) {
//$ 		if (OwnArmor.hidden(entity, EquipmentSlot.CHEST, entity.getItemBySlot(EquipmentSlot.CHEST))) ci.cancel();
//$ 	}
//$ }
//#endif
