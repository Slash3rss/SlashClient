package dev.slash3rss.slashclient.hud.mixin;

//#if MC >= 1.20.2
import com.llamalad7.mixinextras.injector.ModifyExpressionValue;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.network.chat.numbers.BlankFormat;
import net.minecraft.network.chat.numbers.NumberFormat;
//#endif
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** The scoreboard without its red numbers: every line gets the blank number format. */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
abstract class ScoreboardNumbersMixin {
	// 1.20.1 draws the red numbers as plain text (no number formats): left as they are there
	//#if MC >= 1.20.2
	@ModifyExpressionValue(method = "displayScoreboardSidebar", at = @At(value = "INVOKE", target = "Lnet/minecraft/world/scores/Objective;numberFormatOrDefault(Lnet/minecraft/network/chat/numbers/NumberFormat;)Lnet/minecraft/network/chat/numbers/NumberFormat;"))
	private NumberFormat slashclient$hideNumbers(NumberFormat format) {
		return SlashHud.config != null && !SlashHud.config.scoreboardNumbers ? BlankFormat.INSTANCE : format;
	}
	//#endif
}
