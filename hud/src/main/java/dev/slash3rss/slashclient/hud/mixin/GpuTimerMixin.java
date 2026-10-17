package dev.slash3rss.slashclient.hud.mixin;

import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import com.llamalad7.mixinextras.injector.wrapoperation.WrapOperation;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
//#if MC >= 1.21.9
import net.minecraft.client.gui.components.debug.DebugScreenEntries;
import net.minecraft.client.gui.components.debug.DebugScreenEntryList;
//#else
//$ import net.minecraft.client.gui.components.DebugScreenOverlay;
//#endif
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;

/**
 * The game measures the GPU's load only while F3 shows it; the GPU module needs it too. The
 * measurement is a GL timer query around the frame, so it costs next to nothing.
 */
// the frame loop is runTick in 1.21.11 and renderFrame from 26.1 on
@Mixin(Minecraft.class)
abstract class GpuTimerMixin {
	//#if MC >= 1.21.9
	@WrapOperation(method = { "renderFrame", "runTick" }, at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/debug/DebugScreenEntryList;isCurrentlyEnabled(Lnet/minecraft/resources/Identifier;)Z"))
	private boolean slashclient$gpuTimer(DebugScreenEntryList list, Identifier id, Operation<Boolean> original) {
		return original.call(list, id) || id.equals(DebugScreenEntries.GPU_UTILIZATION) && (SlashHud.config.placement("gpu").enabled || dev.slash3rss.slashclient.hud.Benchmark.running());
	}
	//#else
	//$ // before 1.21.9 the frame is timed whenever F3 is open
	//$ @WrapOperation(method = "runTick", at = @At(value = "INVOKE", target = "Lnet/minecraft/client/gui/components/DebugScreenOverlay;showDebugScreen()Z"))
	//$ private boolean slashclient$gpuTimer(DebugScreenOverlay overlay, Operation<Boolean> original) {
	//$ 	return original.call(overlay) || SlashHud.config.placement("gpu").enabled || dev.slash3rss.slashclient.hud.Benchmark.running();
	//$ }
	//#endif
}
