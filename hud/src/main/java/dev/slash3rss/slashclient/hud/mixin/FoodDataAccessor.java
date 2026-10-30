package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.world.food.FoodData;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** The exhaustion the game keeps without a getter (FoodPreview reads it from a world of the player's own). */
@Mixin(FoodData.class)
public interface FoodDataAccessor {
	@Accessor("exhaustionLevel")
	float slashclient$exhaustion();
}
