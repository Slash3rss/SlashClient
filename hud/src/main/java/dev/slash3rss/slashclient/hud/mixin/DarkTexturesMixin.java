package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.DarkGui;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.server.packs.resources.Resource;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** "Ciemne okna gry": the windows' textures recoloured as the game reads them, one by one or a whole folder of sprites (DarkGui). */
@Mixin(MultiPackResourceManager.class)
public abstract class DarkTexturesMixin {
	@Inject(method = "getResource", at = @At("RETURN"), cancellable = true)
	private void slashclient$dark(Identifier id, CallbackInfoReturnable<Optional<Resource>> cir) {
		if (!DarkGui.any()) return;
		Optional<Resource> r = cir.getReturnValue();
		MultiPackResourceManager self = (MultiPackResourceManager) (Object) this;
		if (r != null && r.isPresent()) cir.setReturnValue(Optional.of(DarkGui.wrap(id, r.get(), self::getResource)));
	}

	@Inject(method = "listResources", at = @At("RETURN"), cancellable = true)
	private void slashclient$darkList(CallbackInfoReturnable<Map<Identifier, Resource>> cir) {
		// (the folder asked for is in each key: the selector's type differs between versions)
		if (!DarkGui.any()) return;
		MultiPackResourceManager self = (MultiPackResourceManager) (Object) this;
		Map<Identifier, Resource> out = new LinkedHashMap<>();
		for (var e : cir.getReturnValue().entrySet()) out.put(e.getKey(), DarkGui.wrap(e.getKey(), e.getValue(), self::getResource));
		cir.setReturnValue(out);
	}
}
