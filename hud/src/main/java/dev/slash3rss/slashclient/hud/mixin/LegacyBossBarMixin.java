package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
//#if MC < 1.21.2
//$ import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
//$ import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
//$ import dev.slash3rss.slashclient.hud.compat.HudElementRegistry;
//$ import dev.slash3rss.slashclient.hud.compat.VanillaHudElements;
//$ import net.minecraft.client.gui.GuiGraphics;
//#endif

/** The boss bar for compat.HudElementRegistry before 1.21.2 (see LegacyHudMixin); empty later. */
//#if MC < 1.21.2
//$ @Mixin(net.minecraft.client.gui.components.BossHealthOverlay.class)
//#else
@Mixin(net.minecraft.client.Minecraft.class)
//#endif
abstract class LegacyBossBarMixin {
	//#if MC < 1.21.2
	//$ @WrapMethod(method = "render")
	//$ private void slashclient$bossBar(GuiGraphics g, Operation<Void> original) {
	//$ 	HudElementRegistry.render(VanillaHudElements.BOSS_BAR, g, null, (gg, d) -> original.call(gg));
	//$ }
	//#endif
}
