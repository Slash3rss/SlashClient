package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Cosmetics;
import net.minecraft.client.player.AbstractClientPlayer;
//#if MC >= 1.20.2
import net.minecraft.world.entity.player.PlayerSkin;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** A SlashClient cape picked in the launcher, worn instead of the player's own. */
@Mixin(AbstractClientPlayer.class)
abstract class CapeMixin {
	//#if MC >= 1.20.2
	@ModifyReturnValue(method = "getSkin", at = @At("RETURN"))
	private PlayerSkin slashclient$cape(PlayerSkin skin) {
		AbstractClientPlayer player = (AbstractClientPlayer) (Object) this;
		return Cosmetics.withCape(player.getUUID(), skin, player.getItemBySlot(net.minecraft.world.entity.EquipmentSlot.CHEST).is(net.minecraft.world.item.Items.ELYTRA));
	}
	//#else
	//$ @ModifyReturnValue(method = "getCloakTextureLocation", at = @At("RETURN"))
	//$ private net.minecraft.resources.ResourceLocation slashclient$cape(net.minecraft.resources.ResourceLocation own) {
	//$ 	return Cosmetics.capeFor(((AbstractClientPlayer) (Object) this).getUUID(), own);
	//$ }
	//$
	//$ @ModifyReturnValue(method = "isCapeLoaded", at = @At("RETURN"))
	//$ private boolean slashclient$capeLoaded(boolean loaded) {
	//$ 	return loaded || Cosmetics.capeFor(((AbstractClientPlayer) (Object) this).getUUID(), null) != null;
	//$ }
	//$
	//$ @ModifyReturnValue(method = "getElytraTextureLocation", at = @At("RETURN"))
	//$ private net.minecraft.resources.ResourceLocation slashclient$elytra(net.minecraft.resources.ResourceLocation own) {
	//$ 	return Cosmetics.elytraFor(((AbstractClientPlayer) (Object) this).getUUID(), own);
	//$ }
	//$
	//$ @ModifyReturnValue(method = "isElytraLoaded", at = @At("RETURN"))
	//$ private boolean slashclient$elytraLoaded(boolean loaded) {
	//$ 	return loaded || Cosmetics.elytraFor(((AbstractClientPlayer) (Object) this).getUUID(), null) != null;
	//$ }
	//#endif
}
