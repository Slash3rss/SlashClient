package dev.slash3rss.slashclient.hud.mixin;

import it.unimi.dsi.fastutil.booleans.BooleanConsumer;
import net.minecraft.client.gui.screens.ConfirmScreen;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Mutable;
import org.spongepowered.asm.mixin.gen.Accessor;

/** A question's answer, wrapped so SlashClient hears it too (the server pack question's "Ustaw na stałe"). */
@Mixin(ConfirmScreen.class)
public interface ConfirmScreenAccessor {
	@Accessor("callback")
	BooleanConsumer slashclient$callback();

	@Mutable
	@Accessor("callback")
	void slashclient$setCallback(BooleanConsumer callback);
}
