package dev.slash3rss.slashclient.hud.mixin;

import com.mojang.blaze3d.audio.SoundBuffer;
import dev.slash3rss.slashclient.hud.SoundFiles;
import net.minecraft.client.sounds.SoundBufferLibrary;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.concurrent.CompletableFuture;

/** The player's own sound files (SoundFiles) given to the game's sound engine instead of a sound from the packs. */
@Mixin(SoundBufferLibrary.class)
abstract class SoundBufferMixin {
	@Inject(method = "getCompleteBuffer", at = @At("HEAD"), cancellable = true)
	private void slashclient$ownSound(Identifier path, CallbackInfoReturnable<CompletableFuture<SoundBuffer>> cir) {
		CompletableFuture<SoundBuffer> own = SoundFiles.buffer(path);
		if (own != null) cir.setReturnValue(own);
	}

	@Inject(method = "clear", at = @At("HEAD"))
	private void slashclient$clear(CallbackInfo ci) {
		SoundFiles.clear();
	}
}
