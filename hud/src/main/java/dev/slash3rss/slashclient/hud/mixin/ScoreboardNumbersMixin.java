package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.network.chat.numbers.BlankFormat;
import net.minecraft.network.chat.numbers.NumberFormat;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The scoreboard without its red numbers: every line gets the blank number format. */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
abstract class ScoreboardNumbersMixin {
	@ModifyExpressionValue(method = "displayScoreboardSidebar", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/scores/Objective;numberFormatOrDefault(Lnet/minecraft/network/chat/numbers/NumberFormat;)Lnet/minecraft/network/chat/numbers/NumberFormat;"))
	private NumberFormat slashclient$hideNumbers(NumberFormat format) {
		return SlashHud.config != null && !SlashHud.config.scoreboardNumbers ? BlankFormat.INSTANCE : format;
	}
}
