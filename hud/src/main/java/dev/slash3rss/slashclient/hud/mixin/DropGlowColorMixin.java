package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyReturnValue;
import dev.slash3rss.slashclient.hud.skyup.LootHighlight;
import net.minecraft.world.entity.Entity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The colour a glowing dropped item glows in (LootHighlight): like the item, instead of white. */
@Mixin(Entity.class)
abstract class DropGlowColorMixin {
	@ModifyReturnValue(method = "getTeamColor", at = @At("RETURN"))
	private int slashclient$dropColor(int color) {
		int c = LootHighlight.glowColor((Entity) (Object) this);
		return c >= 0 ? c : color;
	}
}
