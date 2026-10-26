// the prop in front of players who push one (Props): from 1.21.2 drawn from the render state, before straight from the player
//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud.cosmetics;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;

import java.util.HashMap;
import java.util.Map;
import dev.slash3rss.slashclient.hud.Compat;

/** A prop (Props) in front of the player, its grips in the hands the player model holds out this frame. */
public final class PropLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	/** Each prop as a model, made when first pushed. */
	private final Map<String, PropModel> models = new HashMap<>();

	/** A prop, placed when it is drawn (the model is drawn after the frame's states are made). */
	private static final class PropModel extends EntityModel<PropModel.Placed> {
		static final class Placed extends EntityRenderState {
			float armY, armZ, hold, ground, walked;
		}

		private final ModelPart parts;

		PropModel(ModelPart root) {
			super(root);
			parts = root;
		}

		@Override
		public void setupAnim(Placed p) {
			super.setupAnim(p);
			Props.place(parts, p.armY, p.armZ, p.hold, p.ground, p.walked);
		}
	}

	public PropLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
		super(parent);
	}

	@Override
	//#if MC >= 1.21.9
	public void submit(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#else
	//$ public void render(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#endif
		if (state.isInvisible || state.isSpectator) return;
		String item = Props.shown(state.id);
		if (item == null) return;
		// the player model posed for this player (the arms holding the grips: PropArmsMixin)
		PlayerModel parent = getParentModel();
		parent.setupAnim(state);
		PropModel.Placed p = new PropModel.Placed();
		p.armY = (parent.rightArm.y + parent.leftArm.y) / 2;
		p.armZ = (parent.rightArm.z + parent.leftArm.z) / 2;
		p.hold = Props.hold(state.isCrouching);
		// crouching, the whole model is drawn 2 pixels lower: the ground is that much higher in its space
		p.ground = state.isCrouching ? 22 : 24;
		p.walked = state.walkAnimationPos;
		PropModel model = models.computeIfAbsent(item, k -> new PropModel(Props.bake(k)));
		Compat.submitModel(out, model, p, pose, model.renderType(Props.texture(item)), light, OverlayTexture.NO_OVERLAY, state.outlineColor);
	}
}
//#else
//$ package dev.slash3rss.slashclient.hud.cosmetics;
//$
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import net.minecraft.client.model.PlayerModel;
//$ import net.minecraft.client.model.geom.ModelPart;
//$ import net.minecraft.client.player.AbstractClientPlayer;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//$ import net.minecraft.client.renderer.RenderType;
//$ import net.minecraft.client.renderer.entity.RenderLayerParent;
//$ import net.minecraft.client.renderer.entity.layers.RenderLayer;
//$ import net.minecraft.client.renderer.texture.OverlayTexture;
//$
//$ import java.util.HashMap;
//$ import java.util.Map;
//$
//$ /** A prop (Props) in front of the player, its grips in the hands the player model holds out this frame. */
//$ public final class PropLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//$ 	private final Map<String, ModelPart> models = new HashMap<>();
//$
//$ 	public PropLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
//$ 		super(parent);
//$ 	}
//$
//$ 	@Override
//$ 	public void render(PoseStack pose, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
//$ 		String item = Props.shown(player);
//$ 		if (item == null) return;
//$ 		PlayerModel<AbstractClientPlayer> parent = getParentModel();
//$ 		ModelPart root = models.computeIfAbsent(item, Props::bake);
//$ 		boolean crouching = player.isCrouching();
//$ 		Props.place(root, (parent.rightArm.y + parent.leftArm.y) / 2, (parent.rightArm.z + parent.leftArm.z) / 2, Props.hold(crouching), crouching ? 22 : 24, limbSwing);
//$ 		root.render(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(Props.texture(item))), light, OverlayTexture.NO_OVERLAY);
//$ 	}
//$ }
//#endif
