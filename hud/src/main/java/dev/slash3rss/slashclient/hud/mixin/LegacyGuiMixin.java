package dev.slash3rss.slashclient.hud.mixin;

//#if MC < 1.20.2
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
//$ import dev.slash3rss.slashclient.hud.Extras;
//$ import dev.slash3rss.slashclient.hud.GameHud;
//$ import dev.slash3rss.slashclient.hud.SlashHud;
//$ import net.minecraft.client.Minecraft;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.client.gui.components.BossHealthOverlay;
//$ import net.minecraft.client.gui.components.ChatComponent;
//$ import net.minecraft.client.gui.components.PlayerTabOverlay;
//$ import net.minecraft.world.scores.Objective;
//$ import net.minecraft.world.scores.Scoreboard;
//$ import org.spongepowered.asm.mixin.injection.At;
//$ import org.spongepowered.asm.mixin.injection.Inject;
//$ import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
//#endif
import net.minecraft.client.gui.Gui;
import org.spongepowered.asm.mixin.Mixin;

/**
 * 1.20.1 has no HUD element registry (Fabric's HudElementRegistry): what SlashHud and GameHud
 * register there is done here, around the game's own drawing. Empty on later versions.
 */
@Mixin(Gui.class)
abstract class LegacyGuiMixin {
	//#if MC < 1.20.2
	//$ /** Our HUD under the chat, as the registry puts it on later versions. */
	//$ @Inject(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/ChatComponent;render(Lnet/minecraft/client/gui/GuiGraphics;III)V"))
	//$ private void slashclient$hud(GuiGraphics g, float delta, CallbackInfo ci) {
	//$ 	SlashHud.drawHud(g);
	//$ }
	//$
	//$ /** With our effect list on, Minecraft's own effect icons would show the same twice. */
	//$ @Inject(method = "renderEffects", at = @At("HEAD"), cancellable = true)
	//$ private void slashclient$effects(GuiGraphics g, CallbackInfo ci) {
	//$ 	if (SlashHud.config != null && SlashHud.config.placement("effects").enabled) ci.cancel();
	//$ }
	//$
	//$ @Inject(method = "renderCrosshair", at = @At("HEAD"), cancellable = true)
	//$ private void slashclient$crosshair(GuiGraphics g, CallbackInfo ci) {
	//$ 	if (SlashHud.config != null && Extras.drawCrosshair(g, Minecraft.getInstance())) ci.cancel();
	//$ }
	//$
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/Gui;displayScoreboardSidebar(Lnet/minecraft/client/gui/GuiGraphics;Lnet/minecraft/world/scores/Objective;)V"))
	//$ private void slashclient$scoreboard(Gui gui, GuiGraphics g, Objective objective, Operation<Void> original) {
	//$ 	GameHud.scoreboard(g, () -> original.call(gui, g, objective));
	//$ }
	//$
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/BossHealthOverlay;render(Lnet/minecraft/client/gui/GuiGraphics;)V"))
	//$ private void slashclient$bossBar(BossHealthOverlay overlay, GuiGraphics g, Operation<Void> original) {
	//$ 	GameHud.bossBar(g, () -> original.call(overlay, g));
	//$ }
	//$
	//$ @WrapOperation(method = "render", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/PlayerTabOverlay;render(Lnet/minecraft/client/gui/GuiGraphics;ILnet/minecraft/world/scores/Scoreboard;Lnet/minecraft/world/scores/Objective;)V"))
	//$ private void slashclient$tabList(PlayerTabOverlay tab, GuiGraphics g, int width, Scoreboard scoreboard, Objective objective, Operation<Void> original) {
	//$ 	GameHud.tabList(g, () -> original.call(tab, g, width, scoreboard, objective));
	//$ }
	//#endif
}
