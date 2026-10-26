package dev.slash3rss.slashclient.hud.cosmetics;

//#if MC >= 1.21.2
import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Pose;

/**
 * A player's ring ({@link RingEffects}) under the feet: one flat, see-through square drawn with the
 * player's model (so it is sorted and hidden behind blocks like the player is), at full brightness.
 * The model's space is upside down and turned with the body: the ring is moved down to the ground,
 * turned back to the world's own angle and then by its slow spin.
 */
public final class RingLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	/** The player model's own scale (AvatarRenderer.scale): a block is this much less in its space. */
	private static final float MODEL_SCALE = 0.9375f;
	/** How far above the ground it lies, so the ground does not show through it. */
	private static final float LIFT = 0.015f;
	private final RingModel model = new RingModel(ring());

	/** The ring as a model: a flat box a block wide (its top face takes the picture's left square). */
	private static final class RingModel extends EntityModel<EntityRenderState> {
		RingModel(ModelPart root) {
			super(root, RenderTypes::entityTranslucent);
		}
	}

	public RingLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
		super(parent);
	}

	/**
	 * A box with no height: its bottom face (which looks up, the model's space being upside down)
	 * shows the left half of the picture, its top face the see-through right half.
	 */
	static ModelPart ring() {
		MeshDefinition mesh = new MeshDefinition();
		mesh.getRoot().addOrReplaceChild("ring", CubeListBuilder.create().texOffs(-16, 0).addBox(-8, 0, -8, 16, 0, 16), PartPose.ZERO);
		return LayerDefinition.create(mesh, 32, 16).bakeRoot();
	}

	@Override
	//#if MC >= 1.21.9
	public void submit(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#else
	//$ public void render(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#endif
		if (state.isInvisible || state.isSpectator || state.deathTime > 0 || state.isFallFlying || state.isAutoSpinAttack) return;
		if (state.pose != Pose.STANDING && state.pose != Pose.CROUCHING) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;
		Entity e = mc.level.getEntity(state.id);
		if (e == null || e.isPassenger()) return;
		String id = Cosmetics.worn(e.getUUID(), "ring");
		if (id == null || !RingEffects.shows(e.getUUID())) return;
		// in water the ground is the bottom: nothing while swimming in it
		double above = e.isInWater() && !e.onGround() ? -1 : RingEffects.groundBelow(mc.level, e, state.x, state.y, state.z);
		float alpha = RingEffects.alpha(above, state.isCrouching);
		if (alpha <= 0.02f) return;
		float scale = state.scale <= 0 ? 1 : state.scale;
		pose.pushPose();
		// the feet are 1.501 under the model's origin; crouching, the whole model is drawn 2 pixels lower
		pose.translate(0, 1.501f + (float) ((above - LIFT) / scale - (state.isCrouching ? 0.125 : 0)) / MODEL_SCALE, 0);
		float size = RingEffects.SIZE * RingEffects.pulse(id) * (float) (1 - above * 0.12) / MODEL_SCALE / scale;
		pose.scale(size, 1, size);
		//#if MC >= 26.3
		pose.rotate(com.mojang.math.Axis.YP.rotationDegrees(180 - state.bodyRot - RingEffects.spin(id)));
		//#else
		//$ pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(180 - state.bodyRot - RingEffects.spin(id)));
		//#endif
		int color = Math.round(alpha * 255) << 24 | 0xFFFFFF;
		var type = RenderTypes.entityTranslucent(RingEffects.texture(id));
		EntityRenderState s = new EntityRenderState();
		//#if MC >= 26.3
		out.submitModel(model, s, pose, type, 0xF000F0, OverlayTexture.NO_OVERLAY, color, null, 0);
		//#elif MC >= 1.21.9
		//$ out.submitModel(model, s, pose, type, 0xF000F0, OverlayTexture.NO_OVERLAY, color, null, 0, null);
		//#else
		//$ model.setupAnim(s);
		//$ model.renderToBuffer(pose, out.getBuffer(type), 0xF000F0, OverlayTexture.NO_OVERLAY, color);
		//#endif
		pose.popPose();
	}
}
//#else
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import net.minecraft.client.Minecraft;
//$ import net.minecraft.client.model.PlayerModel;
//$ import net.minecraft.client.model.geom.ModelPart;
//$ import net.minecraft.client.model.geom.PartPose;
//$ import net.minecraft.client.model.geom.builders.CubeListBuilder;
//$ import net.minecraft.client.model.geom.builders.LayerDefinition;
//$ import net.minecraft.client.model.geom.builders.MeshDefinition;
//$ import net.minecraft.client.player.AbstractClientPlayer;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//$ import net.minecraft.client.renderer.RenderType;
//$ import net.minecraft.client.renderer.entity.RenderLayerParent;
//$ import net.minecraft.client.renderer.entity.layers.RenderLayer;
//$ import net.minecraft.client.renderer.texture.OverlayTexture;
//$ import net.minecraft.util.Mth;
//$ import net.minecraft.world.entity.Pose;
//$
//$ /** A player's ring ({@link RingEffects}) under the feet, drawn with the player's model (before render states: straight from the player). */
//$ public final class RingLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//$ 	private static final float MODEL_SCALE = 0.9375f;
//$ 	private static final float LIFT = 0.015f;
//$ 	private final ModelPart ring = ring();
//$
//$ 	public RingLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
//$ 		super(parent);
//$ 	}
//$
//$ 	static ModelPart ring() {
//$ 		MeshDefinition mesh = new MeshDefinition();
//$ 		mesh.getRoot().addOrReplaceChild("ring", CubeListBuilder.create().texOffs(-16, 0).addBox(-8, 0, -8, 16, 0, 16), PartPose.ZERO);
//$ 		return LayerDefinition.create(mesh, 32, 16).bakeRoot();
//$ 	}
//$
//$ 	@Override
//$ 	public void render(PoseStack pose, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
//$ 		if (player.isInvisible() || player.isSpectator() || player.deathTime > 0 || player.isFallFlying() || player.isAutoSpinAttack() || player.isPassenger()) return;
//$ 		if (player.getPose() != Pose.STANDING && player.getPose() != Pose.CROUCHING) return;
//$ 		String id = Cosmetics.worn(player.getUUID(), "ring");
//$ 		if (id == null || !RingEffects.shows(player.getUUID())) return;
//$ 		double x = Mth.lerp(partialTick, player.xo, player.getX()), y = Mth.lerp(partialTick, player.yo, player.getY()), z = Mth.lerp(partialTick, player.zo, player.getZ());
//$ 		double above = player.isInWater() && !player.onGround() ? -1 : RingEffects.groundBelow(player.level(), player, x, y, z);
//$ 		boolean crouching = player.isCrouching();
//$ 		float alpha = RingEffects.alpha(above, crouching);
//$ 		if (alpha <= 0.02f) return;
//$ 		pose.pushPose();
//$ 		pose.translate(0, 1.501f + (float) (above - LIFT - (crouching ? 0.125 : 0)) / MODEL_SCALE, 0);
//$ 		float size = RingEffects.SIZE * RingEffects.pulse(id) * (float) (1 - above * 0.12) / MODEL_SCALE;
//$ 		pose.scale(size, 1, size);
//$ 		pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(180 - Mth.rotLerp(partialTick, player.yBodyRotO, player.yBodyRot) - RingEffects.spin(id)));
//$ 		var buffer = buffers.getBuffer(RenderType.entityTranslucent(RingEffects.texture(id)));
		//#if MC >= 1.21
		//$ ring.render(pose, buffer, 0xF000F0, OverlayTexture.NO_OVERLAY, Math.round(alpha * 255) << 24 | 0xFFFFFF);
		//#else
		//$ ring.render(pose, buffer, 0xF000F0, OverlayTexture.NO_OVERLAY, 1f, 1f, 1f, alpha);
		//#endif
//$ 		pose.popPose();
//$ 	}
//$ }
//#endif
