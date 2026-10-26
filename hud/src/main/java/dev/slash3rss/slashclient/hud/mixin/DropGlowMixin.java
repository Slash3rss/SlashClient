package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.skyup.LootHighlight;
import net.minecraft.client.Minecraft;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** Items on the ground in a SkyUp dungeon glow (LootHighlight), the way a glowing mob does. */
@Mixin(Minecraft.class)
abstract class DropGlowMixin {
	@ModifyReturnValue(method = "shouldEntityAppearGlowing", at = @At("RETURN"))
	private boolean slashclient$dropGlows(boolean glows, Entity entity) {
		return glows || LootHighlight.glowColor(entity) >= 0;
	}
}
