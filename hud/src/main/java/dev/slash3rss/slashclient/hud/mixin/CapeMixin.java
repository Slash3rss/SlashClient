package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.cosmetics.Cosmetics;
import net.minecraft.client.player.AbstractClientPlayer;
//#if MC >= 1.21.9
import net.minecraft.world.entity.player.PlayerSkin;
//#elif MC >= 1.20.2
//$ import net.minecraft.client.resources.PlayerSkin;
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
		return Cosmetics.withCape(player.getUUID(), skin, dev.slash3rss.slashclient.hud.players.OwnArmor.shown(player, net.minecraft.world.entity.EquipmentSlot.CHEST).is(net.minecraft.world.item.Items.ELYTRA));
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
	//$
	//$ // the skin an offline account set in the launcher (in later versions it comes with getSkin)
	//$ @ModifyReturnValue(method = "getSkinTextureLocation", at = @At("RETURN"))
	//$ private net.minecraft.resources.ResourceLocation slashclient$offlineSkin(net.minecraft.resources.ResourceLocation own) {
	//$ 	var offline = dev.slash3rss.slashclient.hud.players.OfflineSkins.body(((AbstractClientPlayer) (Object) this).getUUID());
	//$ 	return offline == null ? own : offline;
	//$ }
	//$
	//$ @ModifyReturnValue(method = "getModelName", at = @At("RETURN"))
	//$ private String slashclient$offlineModel(String own) {
	//$ 	java.util.UUID id = ((AbstractClientPlayer) (Object) this).getUUID();
	//$ 	if (dev.slash3rss.slashclient.hud.players.OfflineSkins.body(id) == null) return own;
	//$ 	return dev.slash3rss.slashclient.hud.players.OfflineSkins.slim(id) ? "slim" : "default";
	//$ }
	//#endif
}
