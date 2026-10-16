package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.ui.SlashTitleScreen;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Gui;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.ModifyVariable;

/** Every way to the main menu ends here: our menu instead of the game's, when it is switched on. */
//#if MC >= 26.2
@Mixin(Gui.class)
//#else
//$ @Mixin(Minecraft.class)
//#endif
abstract class GuiMixin {
	@ModifyVariable(method = "setScreen", at = @At("HEAD"), argsOnly = true)
	private Screen slashclient$mainMenu(Screen screen) {
		if (SlashHud.config == null || !SlashHud.config.customMenu) return screen;
		if (screen instanceof TitleScreen) return new SlashTitleScreen();
		// closing a screen without a world (the HUD editor, friends, options from our menu): the game
		// would make its own title screen further down in this method, so answer with ours here
		if (screen == null && Minecraft.getInstance().level == null) return new SlashTitleScreen();
		return screen;
	}
}
