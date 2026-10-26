package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import com.llamalad7.mixinextras.sugar.Local;
import dev.slash3rss.slashclient.hud.cosmetics.HeldSkins;
import net.minecraft.world.item.ItemDisplayContext;
import net.minecraft.world.item.ItemStack;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * SlashClient skins on held shields, swords and bows (HeldSkins). From 1.21.4 an item's look is its
 * item model: the skin's is read instead of the item's own, for that drawing only (the stack itself
 * is untouched, so a bow still draws, a shield still blocks and enchanted items still glint).
 * Before, the item's baked model is swapped for the skin's as the item is drawn with its holder.
 * 1.21.9 passes the holder as an ItemOwner.
 */
//#if MC >= 1.21.4
@Mixin(net.minecraft.client.renderer.item.ItemModelResolver.class)
//#else
//$ @Mixin(net.minecraft.client.renderer.entity.ItemRenderer.class)
//#endif
abstract class HeldSkinsMixin {
	//#if MC >= 1.21.9
	@ModifyExpressionValue(method = "appendItemLayers", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/item/ItemStack;get(Lnet/minecraft/core/component/DataComponentType;)Ljava/lang/Object;"))
	private Object slashclient$skin(Object model, @Local(argsOnly = true) ItemStack stack, @Local(argsOnly = true) ItemDisplayContext context,
		@Local(argsOnly = true) net.minecraft.world.entity.ItemOwner owner) {
		String skin = owner == null ? null : HeldSkins.skinFor(owner.asLivingEntity(), stack, context);
		return skin == null ? model : HeldSkins.itemModel(skin);
	}
	//#elif MC >= 1.21.4
	//$ @ModifyExpressionValue(method = "appendItemLayers", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/item/ItemStack;get(Lnet/minecraft/core/component/DataComponentType;)Ljava/lang/Object;"))
	//$ private Object slashclient$skin(Object model, @Local(argsOnly = true) ItemStack stack, @Local(argsOnly = true) ItemDisplayContext context,
	//$ 	@Local(argsOnly = true) net.minecraft.world.entity.LivingEntity owner) {
	//$ 	String skin = HeldSkins.skinFor(owner, stack, context);
	//$ 	return skin == null ? model : HeldSkins.itemModel(skin);
	//$ }
	//#else
	//$ @ModifyExpressionValue(method = "renderStatic(Lnet/minecraft/world/entity/LivingEntity;Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/item/ItemDisplayContext;ZLcom/mojang/blaze3d/vertex/PoseStack;Lnet/minecraft/client/renderer/MultiBufferSource;Lnet/minecraft/world/level/Level;III)V",
	//$ 	at = @At(value = "INVOKE", target = "Lnet/minecraft/client/renderer/entity/ItemRenderer;getModel(Lnet/minecraft/world/item/ItemStack;Lnet/minecraft/world/level/Level;Lnet/minecraft/world/entity/LivingEntity;I)Lnet/minecraft/client/resources/model/BakedModel;"))
	//$ private net.minecraft.client.resources.model.BakedModel slashclient$skin(net.minecraft.client.resources.model.BakedModel model, @Local(argsOnly = true) net.minecraft.world.entity.LivingEntity owner,
	//$ 	@Local(argsOnly = true) ItemStack stack, @Local(argsOnly = true) ItemDisplayContext context, @Local(argsOnly = true) net.minecraft.world.level.Level level) {
	//$ 	return HeldSkins.legacy(model, owner, stack, context, level);
	//$ }
	//#endif
}
