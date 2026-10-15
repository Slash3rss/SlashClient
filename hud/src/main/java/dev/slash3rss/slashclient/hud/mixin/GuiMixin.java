package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.ui.SlashTitleScreen;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Every way to the main menu ends here: our menu instead of the game's, when it is switched on. */
@Mixin(Gui.class)
abstract class GuiMixin {
	@ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
	private Screen slashclient$mainMenu(Screen screen) {
		return screen instanceof TitleScreen && SlashHud.config != null && SlashHud.config.customMenu ? new SlashTitleScreen() : screen;
	}
}
