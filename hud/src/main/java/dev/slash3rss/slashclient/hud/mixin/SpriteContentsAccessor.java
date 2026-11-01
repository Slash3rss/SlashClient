package dev.slash3rss.slashclient.hud.mixin;

import net.minecraft.client.renderer.texture.SpriteContents;
import org.spongepowered.asm.mixin.Mixin;
//#if MC >= 1.21.11
import com.mojang.blaze3d.platform.NativeImage;
import net.minecraft.server.packs.metadata.MetadataSectionType;
import org.spongepowered.asm.mixin.gen.Accessor;

import java.util.List;
//#endif

/** A sprite's picture and its extra metadata, to make a smaller copy of it (AtlasFitMixin). Empty before 1.21.11. */
@Mixin(SpriteContents.class)
public interface SpriteContentsAccessor {
	//#if MC >= 1.21.11
	@Accessor("originalImage")
	NativeImage slashclient$image();

	@Accessor("additionalMetadata")
	List<MetadataSectionType.WithValue<?>> slashclient$metadata();
	//#endif
}
