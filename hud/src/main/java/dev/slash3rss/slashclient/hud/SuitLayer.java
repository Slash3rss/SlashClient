//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.entity.player.PlayerModelType;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * SlashClient suits ({@link Suits}) on players who wear them, drawn by {@link CosmeticLayer} from the
 * render state: posed like the player model this frame, without the parts real armour covers.
 */
final class SuitLayer {
	/** Each suit as a model, for wide and slim arms ("id" and "id/slim"), made when first worn. */
	private final Map<String, SuitModel> suits = new HashMap<>();

	/** A suit: its boxes on the six parts, posed like the player's (copied into the state, since the model is drawn later). */
	private static final class SuitModel extends EntityModel<SuitModel.Poses> {
		static final class Poses extends EntityRenderState {
			final PartPose[] parts = new PartPose[Suits.BONES.size()];
			int hidden;
		}

		private final String id;
		private final ModelPart[] bones = new ModelPart[Suits.BONES.size()];

		SuitModel(String id, ModelPart root) {
			super(root);
			this.id = id;
			for (int i = 0; i < bones.length; i++) bones[i] = root.getChild(Suits.BONES.get(i));
		}

		@Override
		public void setupAnim(Poses p) {
			super.setupAnim(p);
			for (int i = 0; i < bones.length; i++) bones[i].loadPose(p.parts[i]);
			Suits.showParts(root(), id, p.hidden);
		}
	}

	/** Draws the suit `id` wears, if any. */
	void submit(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, PlayerModel parent, UUID id) {
		String suit = Cosmetics.worn(id, "suit");
		if (suit == null) return;
		boolean slim = state.skin.model() == PlayerModelType.SLIM;
		SuitModel model = suits.computeIfAbsent(slim ? suit + "/slim" : suit, k -> new SuitModel(suit, Suits.bake(suit, slim)));
		SuitModel.Poses p = new SuitModel.Poses();
		parent.setupAnim(state);
		ModelPart[] own = {parent.head, parent.body, parent.rightArm, parent.leftArm, parent.rightLeg, parent.leftLeg};
		for (int i = 0; i < own.length; i++) p.parts[i] = own[i].storePose();
		// a cape (ours or the player's own) or wings on the back: the suit's backpack or tail gives way
		//#if MC >= 1.21.9
		boolean cape = state.showCape && state.skin.cape() != null;
		//#else
		//$ boolean cape = state.showCape && state.skin.capeTexture() != null;
		//#endif
		boolean wings = Cosmetics.worn(id, "wings") != null && !state.chestEquipment.is(net.minecraft.world.item.Items.ELYTRA);
		// a back item (Gear) takes the whole back, a worn tail the suit's own tail
		boolean back = Cosmetics.worn(id, "back") != null;
		p.hidden = Suits.hiddenParts(state.headEquipment, state.chestEquipment, state.legsEquipment, state.feetEquipment, cape || wings || back,
			Cosmetics.worn(id, "tail") != null);
		Compat.submitModel(out, model, p, pose, model.renderType(Suits.texture(suit)), light, OverlayTexture.NO_OVERLAY, state.outlineColor);
	}
}
//#else
//$ package dev.slash3rss.slashclient.hud;
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
//$ import net.minecraft.world.entity.EquipmentSlot;
//$
//$ import java.util.HashMap;
//$ import java.util.Map;
//$
//$ /** SlashClient suits ({@link Suits}) on players who wear them, posed like the player model this frame, without the parts real armour covers. */
//$ public final class SuitLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//$ 	/** Each suit as a model, for wide and slim arms ("id" and "id/slim"), made when first worn. */
//$ 	private final Map<String, ModelPart> suits = new HashMap<>();
//$
//$ 	public SuitLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
//$ 		super(parent);
//$ 	}
//$
//$ 	@Override
//$ 	public void render(PoseStack pose, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
//$ 		if (player.isInvisible() || player.isSpectator() || !Badges.enabled()) return;
//$ 		String suit = Cosmetics.worn(player.getUUID(), "suit");
//$ 		if (suit == null) return;
		//#if MC >= 1.20.2
		//$ boolean slim = player.getSkin().model() == net.minecraft.client.resources.PlayerSkin.Model.SLIM;
		//$ boolean cape = player.getSkin().capeTexture() != null;
		//#else
		//$ boolean slim = "slim".equals(player.getModelName());
		//$ boolean cape = player.getCloakTextureLocation() != null;
		//#endif
//$ 		cape &= player.isModelPartShown(net.minecraft.world.entity.player.PlayerModelPart.CAPE);
//$ 		ModelPart root = suits.computeIfAbsent(slim ? suit + "/slim" : suit, k -> Suits.bake(suit, slim));
//$ 		PlayerModel<AbstractClientPlayer> parent = getParentModel();
//$ 		root.getChild("head").copyFrom(parent.head);
//$ 		root.getChild("body").copyFrom(parent.body);
//$ 		root.getChild("right_arm").copyFrom(parent.rightArm);
//$ 		root.getChild("left_arm").copyFrom(parent.leftArm);
//$ 		root.getChild("right_leg").copyFrom(parent.rightLeg);
//$ 		root.getChild("left_leg").copyFrom(parent.leftLeg);
//$ 		Suits.showParts(root, suit, Suits.hiddenParts(player.getItemBySlot(EquipmentSlot.HEAD), player.getItemBySlot(EquipmentSlot.CHEST),
//$ 			player.getItemBySlot(EquipmentSlot.LEGS), player.getItemBySlot(EquipmentSlot.FEET),
//$ 			cape || Cosmetics.worn(player.getUUID(), "back") != null, Cosmetics.worn(player.getUUID(), "tail") != null));
//$ 		root.render(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(Suits.texture(suit))), light, OverlayTexture.NO_OVERLAY);
//$ 	}
//$ }
//#endif
