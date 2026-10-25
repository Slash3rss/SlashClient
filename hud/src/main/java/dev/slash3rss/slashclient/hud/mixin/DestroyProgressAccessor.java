package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.multiplayer.MultiPlayerGameMode;
import net.minecraft.core.BlockPos;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Accessor;

/** How far the block being dug is broken (block info's progress bar). */
@Mixin(MultiPlayerGameMode.class)
public interface DestroyProgressAccessor {
	@Accessor("destroyProgress")
	float slashclient$progress();

	@Accessor("destroyBlockPos")
	BlockPos slashclient$pos();

	/** For the test: as if a block were being dug. */
	@Accessor("destroyProgress")
	void slashclient$setProgress(float progress);

	@Accessor("destroyBlockPos")
	void slashclient$setPos(BlockPos pos);

	@Accessor("isDestroying")
	void slashclient$setDestroying(boolean destroying);
}
