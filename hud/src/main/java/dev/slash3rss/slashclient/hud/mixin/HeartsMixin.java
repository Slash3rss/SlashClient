package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.slash3rss.slashclient.hud.gamehud.Hearts;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.entity.player.Player;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/**
 * Lots of health in one row: the game would stack a row of hearts per 20 health over the hotbar;
 * with compact hearts it is one row (each further 20 health in another colour) and the armour
 * bar stays right above it.
 */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
abstract class HeartsMixin {
	/** The number of heart rows (the third Mth.ceil of the method): one when compact. */
	@ModifyExpressionValue(method = "extractPlayerHealth", at = @At(value = "INVOKE", target = "Lnet/minecraft/util/Mth;ceil(F)I", ordinal = 2))
	private int slashclient$oneRow(int rows) {
		return SlashHud.config != null && SlashHud.config.compactHearts ? Math.min(rows, 1) : rows;
	}

	/** After the game's bars: what the food held would give, on the food bar (FoodPreview). */
	@Inject(method = "extractPlayerHealth", at = @At("TAIL"))
	private void slashclient$foodPreview(GuiGraphicsExtractor g, CallbackInfo ci) {
		Player player = net.minecraft.client.Minecraft.getInstance().player;
		if (player != null) dev.slash3rss.slashclient.hud.gamehud.FoodPreview.draw(g, player);
	}

	@Inject(method = "extractHearts", at = @At("HEAD"), cancellable = true)
	private void slashclient$compact(GuiGraphicsExtractor g, Player player, int x, int y, int rowHeight, int regen, float maxHealth, int health, int lastHealth, int absorption, boolean blink, CallbackInfo ci) {
		if (SlashHud.config == null || !SlashHud.config.compactHearts || maxHealth + absorption <= 20) return;
		Hearts.draw(g, player, x, y, regen, health, absorption, blink);
		ci.cancel();
	}
}
