package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.Cosmetics;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.world.entity.player.PlayerSkin;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** A SlashClient cape picked in the launcher, worn instead of the player's own. */
@Mixin(AbstractClientPlayer.class)
abstract class CapeMixin {
	@ModifyReturnValue(method = "getSkin", at = @At("RETURN"))
	private PlayerSkin slashclient$cape(PlayerSkin skin) {
		return Cosmetics.withCape(((AbstractClientPlayer) (Object) this).getUUID(), skin);
	}
}
