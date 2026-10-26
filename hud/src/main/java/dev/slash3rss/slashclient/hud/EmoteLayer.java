package dev.slash3rss.slashclient.hud;

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
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;

/**
 * An emote's picture in front of the player playing it, at the height of the face, turned to whoever
 * watches; drawn with the player's model (so hidden behind blocks as the player is), fading in and out.
 */
public final class EmoteLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final PictureModel model = new PictureModel(picture());

	private static final class PictureModel extends EntityModel<EntityRenderState> {
		PictureModel(ModelPart root) {
			super(root, RenderTypes::entityTranslucent);
		}
	}

	EmoteLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
		super(parent);
	}

	/** A flat square a block wide, upright, its front face showing the whole picture. */
	static ModelPart picture() {
		MeshDefinition mesh = new MeshDefinition();
		mesh.getRoot().addOrReplaceChild("picture", CubeListBuilder.create().texOffs(0, 0).addBox(-8, -8, 0, 16, 16, 0), PartPose.ZERO);
		return LayerDefinition.create(mesh, 16, 16).bakeRoot();
	}

	@Override
	//#if MC >= 1.21.9
	public void submit(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#else
	//$ public void render(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#endif
		if (state.isInvisible || state.isSpectator || state.deathTime > 0) return;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return;
		Entity e = mc.level.getEntity(state.id);
		if (e == null) return;
		Cosmetics.Playing p = Cosmetics.playing(e.getUUID());
		if (p == null) return;
		float alpha = EmotePicture.alpha(p);
		if (alpha <= 0.02f) return;
		pose.pushPose();
		EmotePicture.place(pose, state.bodyRot, state.x, state.z, state.isCrouching);
		var type = RenderTypes.entityTranslucent(EmotePicture.texture(p.emote()));
		EntityRenderState s = new EntityRenderState();
		int color = Math.round(alpha * 255) << 24 | 0xFFFFFF;
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
//$
//$ /** An emote's picture in front of the player playing it (before render states: straight from the player). */
//$ public final class EmoteLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//$ 	private final ModelPart picture = picture();
//$
//$ 	public EmoteLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
//$ 		super(parent);
//$ 	}
//$
//$ 	static ModelPart picture() {
//$ 		MeshDefinition mesh = new MeshDefinition();
//$ 		mesh.getRoot().addOrReplaceChild("picture", CubeListBuilder.create().texOffs(0, 0).addBox(-8, -8, 0, 16, 16, 0), PartPose.ZERO);
//$ 		return LayerDefinition.create(mesh, 16, 16).bakeRoot();
//$ 	}
//$
//$ 	@Override
//$ 	public void render(PoseStack pose, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
//$ 		if (player.isInvisible() || player.isSpectator() || player.deathTime > 0) return;
//$ 		Cosmetics.Playing p = Cosmetics.playing(player.getUUID());
//$ 		if (p == null) return;
//$ 		float alpha = EmotePicture.alpha(p);
//$ 		if (alpha <= 0.02f) return;
//$ 		pose.pushPose();
//$ 		EmotePicture.place(pose, Mth.rotLerp(partialTick, player.yBodyRotO, player.yBodyRot), Mth.lerp(partialTick, player.xo, player.getX()),
//$ 			Mth.lerp(partialTick, player.zo, player.getZ()), player.isCrouching());
//$ 		var buffer = buffers.getBuffer(RenderType.entityTranslucent(EmotePicture.texture(p.emote())));
		//#if MC >= 1.21
		//$ picture.render(pose, buffer, 0xF000F0, OverlayTexture.NO_OVERLAY, Math.round(alpha * 255) << 24 | 0xFFFFFF);
		//#else
		//$ picture.render(pose, buffer, 0xF000F0, OverlayTexture.NO_OVERLAY, 1f, 1f, 1f, alpha);
		//#endif
//$ 		pose.popPose();
//$ 	}
//$ }
//#endif
