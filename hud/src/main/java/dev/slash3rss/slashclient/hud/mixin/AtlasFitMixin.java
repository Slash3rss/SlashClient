package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.renderer.texture.SpriteLoader;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.21.11
import com.llamalad7.mixinextras.injector.wrapmethod.WrapMethod;
import com.llamalad7.mixinextras.injector.wrapoperation.Operation;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.compat.AtlasFit;
import net.minecraft.ReportedException;
import net.minecraft.client.renderer.texture.SpriteContents;
import net.minecraft.client.renderer.texture.Stitcher;
import net.minecraft.client.renderer.texture.StitcherException;
import net.minecraft.client.resources.metadata.animation.FrameSize;
import net.minecraft.resources.Identifier;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Shadow;
import org.spongepowered.asm.mixin.Unique;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.Executor;
//#endif

/**
 * An atlas too big for the graphics card (a server's pack on a Raspberry Pi): its biggest textures halved
 * until it fits, instead of the whole pack turned down (compat.AtlasFit). Before 1.21.11 the sprites are
 * made differently and this mixin is empty.
 */
@Mixin(SpriteLoader.class)
abstract class AtlasFitMixin {
	//#if MC >= 1.21.11
	@Shadow
	@Final
	private Identifier location;

	@WrapMethod(method = "stitch")
	private SpriteLoader.Preparations slashclient$fit(List<SpriteContents> sprites, int mipLevel, Executor executor, Operation<SpriteLoader.Preparations> original) {
		List<SpriteContents> list = sprites;
		for (int round = 0; ; round++) {
			boolean fits = true;
			if (AtlasFit.limitForTest > 0) fits = slashclient$fitsIn(list, AtlasFit.limitForTest, mipLevel);
			if (fits) {
				try {
					return original.call(list, mipLevel, executor);
				} catch (ReportedException e) {
					if (!(e.getCause() instanceof StitcherException) || round >= AtlasFit.ROUNDS) throw e;
				}
			} else if (round >= AtlasFit.ROUNDS) {
				return original.call(list, mipLevel, executor);
			}
			List<SpriteContents> smaller = slashclient$halveBiggest(list);
			if (smaller == null) return original.call(list, mipLevel, executor);
			list = smaller;
		}
	}

	/** Whether the sprites fit an atlas `limit` pixels wide and high (the game test's smaller card). */
	@Unique
	private static boolean slashclient$fitsIn(List<SpriteContents> sprites, int limit, int mipLevel) {
		Stitcher<SpriteContents> stitcher = new Stitcher<>(limit, limit, mipLevel, 0);
		for (SpriteContents s : sprites) stitcher.registerSprite(s);
		try {
			stitcher.stitch();
			return true;
		} catch (StitcherException e) {
			return false;
		}
	}

	/** The list with its biggest still (not animated) pictures at half size (null when none is big enough to shrink). */
	@Unique
	private List<SpriteContents> slashclient$halveBiggest(List<SpriteContents> sprites) {
		int biggest = 0;
		for (SpriteContents s : sprites) {
			if (!s.isAnimated()) biggest = Math.max(biggest, Math.max(s.width(), s.height()));
		}
		if (biggest < AtlasFit.SMALLEST) return null;
		List<SpriteContents> out = new ArrayList<>(sprites.size());
		int halved = 0;
		for (SpriteContents s : sprites) {
			if (s.isAnimated() || Math.max(s.width(), s.height()) < biggest) {
				out.add(s);
				continue;
			}
			var image = AtlasFit.half(((SpriteContentsAccessor) s).slashclient$image());
			out.add(new SpriteContents(s.name(), new FrameSize(image.getWidth(), image.getHeight()), image, Optional.empty(), ((SpriteContentsAccessor) s).slashclient$metadata(), Optional.empty()));
			s.close();
			halved++;
		}
		SlashHud.LOG.info("SlashClient: atlas {} does not fit the graphics card: {} textures of {} px halved", location, halved, biggest);
		return out;
	}
	//#endif
}
