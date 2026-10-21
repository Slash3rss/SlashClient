package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

/**
 * Weather off (only for us): the client's world says no rain and no thunder, so the rain, the
 * snow, their sound, the splashes and the darker sky all stay away. The server's world is left be.
 */
@Mixin(Level.class)
abstract class WeatherMixin {
	@Inject(method = "getRainLevel", at = @At("HEAD"), cancellable = true)
	private void slashclient$noRain(float delta, CallbackInfoReturnable<Float> cir) {
		if (off()) cir.setReturnValue(0f);
	}

	@Inject(method = "getThunderLevel", at = @At("HEAD"), cancellable = true)
	private void slashclient$noThunder(float delta, CallbackInfoReturnable<Float> cir) {
		if (off()) cir.setReturnValue(0f);
	}

	private boolean off() {
		return (Object) this instanceof ClientLevel && (SlashHud.config != null && SlashHud.config.weatherOff || dev.slash3rss.slashclient.hud.BenchScene.active());
	}
}
