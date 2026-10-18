package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.gui.Gui;
import org.spongepowered.asm.mixin.Mixin;
//#if MC < 1.21.2 && MC >= 1.20.2
//$ import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import dev.slash3rss.slashclient.hud.compat.HudElementRegistry;
//$ import dev.slash3rss.slashclient.hud.compat.VanillaHudElements;
//$ import net.minecraft.client.DeltaTracker;
//$ import net.minecraft.client.gui.GuiGraphics;
//#elif MC < 1.20.2
//$ import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//$ import dev.slash3rss.slashclient.hud.compat.HudElementRegistry;
//$ import dev.slash3rss.slashclient.hud.compat.VanillaHudElements;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.client.gui.components.ChatComponent;
//$ import net.minecraft.client.gui.components.PlayerTabOverlay;
//$ import net.minecraft.world.scores.Objective;
//$ import net.minecraft.world.scores.Scoreboard;
//$ import org.spongepowered.asm.mixin.injection.At;
//#endif

/**
 * Before 1.21.2 Fabric has no HUD element registry: the game's HUD parts the HUD moves, hides or
 * draws under are wrapped here and go through compat.HudElementRegistry. Later versions use
 * Fabric's registry and this mixin is empty.
 */
@Mixin(Gui.class)
abstract class LegacyHudMixin {
	//#if MC < 1.21.2 && MC >= 1.20.2
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
	//$
	//$ @WrapMethod(method = "renderOverlayMessage")
	//$ private void slashclient$actionBar(GuiGraphics g, DeltaTracker delta, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.OVERLAY_MESSAGE, g, delta, (gg, d) -> original.call(gg, d));
	//$ }
	//#elif MC < 1.20.2
	//$ // 1.20.1 draws most of the HUD in Gui.render itself: the parts are wrapped where it calls them
	//$ @WrapMethod(method = "renderCrosshair")
	//$ private void slashclient$crosshair(GuiGraphics g, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.CROSSHAIR, g, null, (gg, d) -> original.call(gg));
	//$ }
	//$
	//$ @WrapMethod(method = "renderEffects")
	//$ private void slashclient$effects(GuiGraphics g, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.STATUS_EFFECTS, g, null, (gg, d) -> original.call(gg));
	//$ }
	//$
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Gui;displayScoreboardSidebar(Lnet/minecraft/client/gui/GuiGraphics;Lnet/minecraft/world/scores/Objective;)V"))
	//$ private void slashclient$scoreboard(Gui gui, GuiGraphics g, Objective objective, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.SCOREBOARD, g, null, (gg, d) -> original.call(gui, gg, objective));
	//$ }
	//$
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/ChatComponent;render(Lnet/minecraft/client/gui/GuiGraphics;III)V"))
	//$ private void slashclient$chat(ChatComponent chat, GuiGraphics g, int tick, int mouseX, int mouseY, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.CHAT, g, null, (gg, d) -> original.call(chat, gg, tick, mouseX, mouseY));
	//$ }
	//$
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/PlayerTabOverlay;render(Lnet/minecraft/client/gui/GuiGraphics;ILnet/minecraft/world/scores/Scoreboard;Lnet/minecraft/world/scores/Objective;)V"))
	//$ private void slashclient$tabList(PlayerTabOverlay tab, GuiGraphics g, int width, Scoreboard scoreboard, Objective objective, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.PLAYER_LIST, g, null, (gg, d) -> original.call(tab, gg, width, scoreboard, objective));
	//$ }
	//$ // titles and the action bar are drawn inline in Gui.render: not adjustable on 1.20.1
	//#endif
}
