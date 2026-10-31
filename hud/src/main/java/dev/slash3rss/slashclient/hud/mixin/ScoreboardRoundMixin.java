package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.world.scores.Objective;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

/** While the game draws the scoreboard, its backgrounds may be rounded (GameRound). */
//#if MC >= 26.2
@Mixin(net.minecraft.client.gui.Hud.class)
//#else
//$ @Mixin(net.minecraft.client.gui.Gui.class)
//#endif
abstract class ScoreboardRoundMixin {
	@Inject(method = "displayScoreboardSidebar", at = @At("HEAD"))
	private void slashclient$roundStart(GuiGraphicsExtractor g, Objective objective, CallbackInfo ci) {
		var mc = Minecraft.getInstance();
		dev.slash3rss.slashclient.hud.gamehud.GameRound.begin("scoreboard",
			dev.slash3rss.slashclient.hud.gamehud.GameParts.scoreboardRect(mc, objective, g.guiWidth(), g.guiHeight()));
	}

	@Inject(method = "displayScoreboardSidebar", at = @At("RETURN"))
	private void slashclient$roundEnd(GuiGraphicsExtractor g, Objective objective, CallbackInfo ci) {
		dev.slash3rss.slashclient.hud.gamehud.GameRound.end();
	}
}
