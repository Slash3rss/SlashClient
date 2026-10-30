package dev.slash3rss.slashclient.hud.mixin;

import dev.slash3rss.slashclient.hud.ui.BlockWindows;
import dev.slash3rss.slashclient.hud.ui.DarkGui;
import net.minecraft.resources.Identifier;
import net.minecraft.server.packs.resources.MultiPackResourceManager;
import net.minecraft.server.packs.resources.Resource;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** "Ciemne okna gry": the windows' textures recoloured as the game reads them, one by one or a whole folder of sprites (DarkGui). */
@Mixin(MultiPackResourceManager.class)
public abstract class DarkTexturesMixin {
	/** Set while the game's shulker box texture is read to make a coloured one from (it is changed once, for its colour). */
	@Unique
	private static final ThreadLocal<Boolean> slashclient$plain = ThreadLocal.withInitial(() -> false);

	@Inject(method = "getResource", at = @At("RETURN"), cancellable = true)
	private void slashclient$dark(Identifier id, CallbackInfoReturnable<Optional<Resource>> cir) {
		if (!DarkGui.any() || slashclient$plain.get()) return;
		Optional<Resource> r = cir.getReturnValue();
		Identifier plain = r == null || r.isEmpty() ? BlockWindows.plainOf(id) : null;
		if (plain != null) {
			// a shulker box's window in its colour: the game's texture, drawn for that colour
			slashclient$plain.set(true);
			try {
				r = ((MultiPackResourceManager) (Object) this).getResource(plain);
			} finally {
				slashclient$plain.set(false);
			}
		}
		if (r != null && r.isPresent()) cir.setReturnValue(Optional.of(DarkGui.wrap(id, r.get())));
	}

	@Inject(method = "listResources", at = @At("RETURN"), cancellable = true)
	private void slashclient$darkList(CallbackInfoReturnable<Map<Identifier, Resource>> cir) {
		// (the folder asked for is in each key: the selector's type differs between versions)
		if (!DarkGui.any()) return;
		Map<Identifier, Resource> out = new LinkedHashMap<>();
		for (var e : cir.getReturnValue().entrySet()) out.put(e.getKey(), DarkGui.wrap(e.getKey(), e.getValue()));
		cir.setReturnValue(out);
	}
}
