package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.Gui;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 1.21.2
//$ import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import dev.slash3rss.slashclient.hud.compat.HudElementRegistry;
//$ import dev.slash3rss.slashclient.hud.compat.VanillaHudElements;
//$ import net.minecraft.client.DeltaTracker;
//$ import net.minecraft.client.gui.GuiGraphics;
//#endif

/**
 * Before 1.21.2 Fabric has no HUD element registry: the game's HUD parts the HUD moves, hides or
 * draws under are wrapped here and go through compat.HudElementRegistry. Later versions use
 * Fabric's registry and this mixin is empty.
 */
@Mixin(Gui.class)
abstract class LegacyHudMixin {
	//#if MC < 1.21.2
	//$ @WrapMethod(method = "renderCrosshair")
	//$ private void slashclient$crosshair(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.CROSSHAIR, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//$
	//$ @WrapMethod(method = "renderEffects")
	//$ private void slashclient$effects(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.STATUS_EFFECTS, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//$
	//$ @WrapMethod(method = "renderScoreboardSidebar")
	//$ private void slashclient$scoreboard(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.SCOREBOARD, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//$
	//$ @WrapMethod(method = "renderTitle")
	//$ private void slashclient$title(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.TITLE_AND_SUBTITLE, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//$
	//$ @WrapMethod(method = "renderChat")
	//$ private void slashclient$chat(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.CHAT, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//$
	//$ @WrapMethod(method = "renderTabList")
	//$ private void slashclient$tabList(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.PLAYER_LIST, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//#endif
}
