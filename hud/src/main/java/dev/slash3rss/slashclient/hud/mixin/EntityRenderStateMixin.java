package dev.slash3rss.slashclient.hud.mixin;

//#if MC >= 1.21.2
import dev.slash3rss.slashclient.hud.LiveTag;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.network.chat.Component;
import org.spongepowered.asm.mixin.Unique;
//#else
//$ import net.minecraft.client.renderer.entity.EntityRenderer;
//#endif
import org.spongepowered.asm.mixin.Mixin;

/**
 * The "● NA ŻYWO" line of a live player (LiveTag), carried by the render state from filling it to
 * drawing the name. Before 1.21.2 there are no render states and this mixin is empty.
 */
//#if MC >= 1.21.2
@Mixin(EntityRenderState.class)
abstract class EntityRenderStateMixin implements LiveTag {
	@Unique
	private Component slashclient$liveLabel;

	@Override
	public Component slashclient$live() {
		return slashclient$liveLabel;
	}

	@Override
	public void slashclient$setLive(Component label) {
		slashclient$liveLabel = label;
	}
}
//#else
//$ @Mixin(EntityRenderer.class)
//$ abstract class EntityRenderStateMixin {}
//#endif
