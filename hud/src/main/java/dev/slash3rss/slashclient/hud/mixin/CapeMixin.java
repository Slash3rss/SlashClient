package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Cosmetics;
import net.minecraft.client.player.AbstractClientPlayer;
//#if MC >= 1.21.9
import net.minecraft.world.entity.player.PlayerSkin;
//#else
//$ import net.minecraft.client.resources.PlayerSkin;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** A SlashClient cape picked in the launcher, worn instead of the player's own. */
@Mixin(AbstractClientPlayer.class)
abstract class CapeMixin {
	@ModifyReturnValue(method = "getSkin", at = @At("RETURN"))
	private PlayerSkin slashclient$cape(PlayerSkin skin) {
		AbstractClientPlayer player = (AbstractClientPlayer) (Object) this;
		return Cosmetics.withCape(player.getUUID(), skin, player.getItemBySlot(net.minecraft.world.entity.EquipmentSlot.CHEST).is(net.minecraft.world.item.Items.ELYTRA));
	}
}
