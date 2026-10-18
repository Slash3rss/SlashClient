package dev.slash3rss.slashclient.hud.mixin;

import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/** F3's first line: "SlashClient 1.21.4 (…/slashclient)" instead of "Minecraft 1.21.4 (…/fabric)". */
//#if MC >= 1.21.9
@Mixin(targets = "net.minecraft.client.gui.components.debug.DebugEntryVersion")
abstract class DebugVersionMixin {
	@org.spongepowered.asm.mixin.injection.ModifyArg(method = "display", at = @At(value = "INVOKE",
		target = "Lnet/minecraft/client/gui/components/debug/DebugScreenDisplayer;addPriorityLine(Ljava/lang/String;)V"))
	private String slashclient$name(String line) {
		return dev.slash3rss.slashclient.hud.SlashHud.brandedVersion(line);
	}
}
//#else
//$ @Mixin(net.minecraft.client.gui.components.DebugScreenOverlay.class)
//$ abstract class DebugVersionMixin {
//$ 	@org.spongepowered.asm.mixin.injection.Inject(method = "getGameInformation", at = @At("RETURN"))
//$ 	private void slashclient$name(org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable<java.util.List<String>> cir) {
//$ 		java.util.List<String> lines = cir.getReturnValue();
//$ 		if (lines.isEmpty()) return;
//$ 		try {
//$ 			lines.set(0, dev.slash3rss.slashclient.hud.SlashHud.brandedVersion(lines.get(0)));
//$ 		} catch (UnsupportedOperationException e) {
//$ 			// a list that cannot be changed: the line stays the game's
//$ 		}
//$ 	}
//$ }
//#endif
