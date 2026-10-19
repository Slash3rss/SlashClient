// the menu figure in one picture with depth (SkinPreview); before 1.21.2 the figure is drawn on its own
//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.model.Model;
import net.minecraft.resources.Identifier;

import java.util.List;

/**
 * The menu figure and everything on it (its skin, clothing, cape, wings, pet) drawn as ONE
 * picture, in one pass with a depth buffer, so whatever is nearer the viewer covers what is
 * further at every angle (a picture per model, laid one over another, cannot get the edges of
 * the head right). The game's own skin picture (GuiGraphics.skin) takes a single model; this
 * is the same with a list of them. Before 1.21.6 the GUI draws models straight onto the screen,
 * where they share its depth buffer anyway.
 */
public final class FigureRender {
	private FigureRender() {}

	/** A model and its texture, posed and ready. */
	public record Layer(net.minecraft.client.model.Model<?> model, Identifier texture) {}

	/**
	 * Draws the layers in the box as GuiGraphics.skin draws one model: the model's feet on the
	 * box's bottom middle, `scale` GUI pixels a block, tilted by `rotX` round `pivotY`, turned by `rotY`.
	 */
	public static void draw(GuiGraphicsExtractor g, List<Layer> layers, float scale, float rotX, float rotY, float pivotY, int x0, int y0, int x1, int y1) {
		//#if MC >= 1.21.6
		var state = new State(List.copyOf(layers), rotX, rotY, pivotY, x0, y0, x1, y1, scale, null);
		//#if MC >= 26.1
		((dev.slash3rss.slashclient.hud.mixin.GuiGraphicsAccessor) g).slashclient$guiRenderState().addPicturesInPictureState(state);
		//#else
		//$ ((dev.slash3rss.slashclient.hud.mixin.GuiGraphicsAccessor) g).slashclient$guiRenderState().submitPicturesInPictureState(state);
		//#endif
		//#else
		//$ for (Layer l : layers) dev.slash3rss.slashclient.hud.Compat.skin(g, l.model(), l.texture(), scale, rotX, rotY, pivotY, x0, y0, x1, y1);
		//#endif
	}

	//#if MC >= 1.21.6
	/** Registers the picture's drawer with the game's GUI (once, at start). */
	public static void register() {
		//#if MC >= 26.2
		net.fabricmc.fabric.api.client.rendering.v1.PictureInPictureRendererRegistry.register(ctx -> new Renderer());
		//#elif MC >= 26.1
		//$ net.fabricmc.fabric.api.client.rendering.v1.PictureInPictureRendererRegistry.register(ctx -> new Renderer(ctx.bufferSource()));
		//#else
		//$ net.fabricmc.fabric.api.client.rendering.v1.SpecialGuiElementRegistry.register(ctx -> new Renderer(ctx.vertexConsumers()));
		//#endif
	}

	//#if MC >= 26.1
	private record State(List<Layer> layers, float rotationX, float rotationY, float pivotY, int x0, int y0, int x1, int y1, float scale,
		net.minecraft.client.gui.navigation.ScreenRectangle scissorArea, net.minecraft.client.gui.navigation.ScreenRectangle bounds)
		implements net.minecraft.client.renderer.state.gui.pip.PictureInPictureRenderState {
		State(List<Layer> layers, float rotationX, float rotationY, float pivotY, int x0, int y0, int x1, int y1, float scale, net.minecraft.client.gui.navigation.ScreenRectangle scissorArea) {
			this(layers, rotationX, rotationY, pivotY, x0, y0, x1, y1, scale, scissorArea,
				net.minecraft.client.renderer.state.gui.pip.PictureInPictureRenderState.getBounds(x0, y0, x1, y1, scissorArea));
		}
	}
	//#else
	//$ private record State(List<Layer> layers, float rotationX, float rotationY, float pivotY, int x0, int y0, int x1, int y1, float scale,
	//$ 	net.minecraft.client.gui.navigation.ScreenRectangle scissorArea, net.minecraft.client.gui.navigation.ScreenRectangle bounds)
	//$ 	implements net.minecraft.client.gui.render.state.pip.PictureInPictureRenderState {
	//$ 	State(List<Layer> layers, float rotationX, float rotationY, float pivotY, int x0, int y0, int x1, int y1, float scale, net.minecraft.client.gui.navigation.ScreenRectangle scissorArea) {
	//$ 		this(layers, rotationX, rotationY, pivotY, x0, y0, x1, y1, scale, scissorArea,
	//$ 			net.minecraft.client.gui.render.state.pip.PictureInPictureRenderState.getBounds(x0, y0, x1, y1, scissorArea));
	//$ 	}
	//$ }
	//#endif

	/** As the game's GuiSkinRenderer, for each layer in turn, into the same picture (and its depth). */
	private static final class Renderer extends net.minecraft.client.gui.render.pip.PictureInPictureRenderer<State> {
		//#if MC >= 26.2
		Renderer() {
			super();
		}
		//#else
		//$ Renderer(net.minecraft.client.renderer.MultiBufferSource.BufferSource buffers) {
		//$ 	super(buffers);
		//$ }
		//#endif

		@Override
		public Class<State> getRenderStateClass() {
			return State.class;
		}

		@Override
		protected String getTextureLabel() {
			return "slashclient figure";
		}

		@Override
		//#if MC >= 26.2
		protected void renderToTexture(State state, com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.SubmitNodeCollector collector) {
			var mc = net.minecraft.client.Minecraft.getInstance();
			mc.gameRenderer.lighting().setupFor(com.mojang.blaze3d.platform.Lighting.Entry.PLAYER_SKIN);
			float scale = state.scale() * mc.getWindow().getGuiScale();
			// the picture's own model view (the game keeps it for the whole picture)
			com.mojang.blaze3d.systems.RenderSystem.getModelViewStack()
				.rotateAround(com.mojang.math.Axis.XP.rotationDegrees(state.rotationX()), 0, scale * -state.pivotY(), 0);
			//#if MC >= 26.3
			pose.rotateDegrees(com.mojang.math.Axis.YP, -state.rotationY());
			//#else
			//$ pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(-state.rotationY()));
			//#endif
			pose.translate(0, -1.601f, 0);
			for (Layer l : state.layers()) {
				//#if MC >= 26.3
				collector.submitModel((Model.Simple) l.model(), net.minecraft.util.Unit.INSTANCE, pose, l.texture(), 0xF000F0, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY, 0);
				//#else
				//$ collector.submitModel((Model.Simple) l.model(), net.minecraft.util.Unit.INSTANCE, pose, l.texture(), 0xF000F0, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY, 0, null);
				//#endif
			}
		}
		//#else
		//$ protected void renderToTexture(State state, com.mojang.blaze3d.vertex.PoseStack pose) {
		//$ 	var mc = net.minecraft.client.Minecraft.getInstance();
		//$ 	mc.gameRenderer.getLighting().setupFor(com.mojang.blaze3d.platform.Lighting.Entry.PLAYER_SKIN);
		//$ 	float scale = state.scale() * mc.getWindow().getGuiScale();
		//$ 	var view = com.mojang.blaze3d.systems.RenderSystem.getModelViewStack();
		//$ 	view.pushMatrix();
		//$ 	view.rotateAround(com.mojang.math.Axis.XP.rotationDegrees(state.rotationX()), 0, scale * -state.pivotY(), 0);
		//$ 	pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(-state.rotationY()));
		//$ 	pose.translate(0, -1.601f, 0);
		//$ 	for (Layer l : state.layers()) l.model().renderToBuffer(pose, bufferSource.getBuffer(l.model().renderType(l.texture())), 0xF000F0, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY);
		//$ 	bufferSource.endBatch();
		//$ 	view.popMatrix();
		//$ }
		//#endif
	}
	//#endif
}
//#endif
