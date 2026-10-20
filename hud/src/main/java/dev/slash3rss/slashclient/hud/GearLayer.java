// back items and tails on players who wear them: from render states from 1.21.2, before straight from the player
//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Items;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** SlashClient back items and tails ({@link Gear}) on players who wear them, posed like the player's body this frame. */
public final class GearLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	/** Each item as a model, made when first worn. */
	private final Map<String, GearModel> models = new HashMap<>();

	/** An item, its body posed like the player's and its tail moving (copied into the state when submitted: the model is drawn later). */
	private static final class GearModel extends EntityModel<GearModel.Poses> {
		static final class Poses extends EntityRenderState {
			PartPose body;
			float time, walk, phase, fit;
			boolean caped;
		}

		private final Gear.Rig rig;

		GearModel(Gear.Rig rig) {
			super(rig.root);
			this.rig = rig;
		}

		@Override
		public void setupAnim(Poses p) {
			super.setupAnim(p);
			rig.body.loadPose(p.body);
			Gear.animate(rig, p.time, p.walk, p.phase, p.caped, p.fit);
		}
	}

	GearLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent) {
		super(parent);
	}

	/** The player a render state is for, by its entity id. */
	private static UUID playerOf(AvatarRenderState state) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return null;
		Entity e = mc.level.getEntity(state.id);
		return e == null ? null : e.getUUID();
	}

	/** Whether a cape hangs on the back (the tail then hangs lower, under it). */
	private static boolean caped(AvatarRenderState state) {
		if (!state.showCape || state.chestEquipment.is(Items.ELYTRA)) return false;
		//#if MC >= 1.21.9
		return state.skin.cape() != null;
		//#else
		//$ return state.skin.capeTexture() != null;
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public void submit(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#else
	//$ public void render(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, float yRot, float xRot) {
	//#endif
		if (state.isInvisible || state.isSpectator || !Badges.enabled()) return;
		UUID id = playerOf(state);
		if (id == null) return;
		String back = Cosmetics.worn(id, "back"), tail = Cosmetics.worn(id, "tail");
		if (back != null && !Gear.backShown(state.chestEquipment)) back = null;
		if (back == null && tail == null) return;
		PlayerModel parent = getParentModel();
		parent.setupAnim(state);
		PartPose body = parent.body.storePose();
		for (String slot : Gear.SLOTS) {
			String item = slot.equals("back") ? back : tail;
			if (item == null) continue;
			GearModel.Poses p = new GearModel.Poses();
			p.body = body;
			p.time = state.ageInTicks / 20f;
			p.walk = state.walkAnimationSpeed;
			// the legs swing with cos(pos · 0.6662)
			p.phase = state.walkAnimationPos * 0.6662f;
			p.caped = slot.equals("tail") && caped(state);
			p.fit = Gear.fit(slot, state.chestEquipment, state.legsEquipment, Cosmetics.worn(id, "suit") != null);
			GearModel model = models.computeIfAbsent(item, k -> new GearModel(Gear.bake(k)));
			Compat.submitModel(out, model, p, pose, model.renderType(Gear.texture(item)), light, OverlayTexture.NO_OVERLAY, state.outlineColor);
		}
	}
}
//#else
//$ package dev.slash3rss.slashclient.hud;
//$
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import net.minecraft.client.model.PlayerModel;
//$ import net.minecraft.client.player.AbstractClientPlayer;
//$ import net.minecraft.client.renderer.MultiBufferSource;
//$ import net.minecraft.client.renderer.RenderType;
//$ import net.minecraft.client.renderer.entity.RenderLayerParent;
//$ import net.minecraft.client.renderer.entity.layers.RenderLayer;
//$ import net.minecraft.client.renderer.texture.OverlayTexture;
//$ import net.minecraft.world.entity.EquipmentSlot;
//$ import net.minecraft.world.entity.player.PlayerModelPart;
//$ import net.minecraft.world.item.ItemStack;
//$ import net.minecraft.world.item.Items;
//$
//$ import java.util.HashMap;
//$ import java.util.Map;
//$
//$ /** SlashClient back items and tails ({@link Gear}) on players who wear them, posed like the player's body this frame. */
//$ public final class GearLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//$ 	/** Each item as a model, made when first worn. */
//$ 	private final Map<String, Gear.Rig> rigs = new HashMap<>();
//$
//$ 	public GearLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
//$ 		super(parent);
//$ 	}
//$
//$ 	/** Whether a cape hangs on the back (the tail then hangs lower, under it). */
//$ 	private static boolean caped(AbstractClientPlayer player, ItemStack chest) {
//$ 		if (!player.isModelPartShown(PlayerModelPart.CAPE) || chest.is(Items.ELYTRA)) return false;
		//#if MC >= 1.20.2
		//$ return player.getSkin().capeTexture() != null;
		//#else
		//$ return player.isCapeLoaded() && player.getCloakTextureLocation() != null;
		//#endif
//$ 	}
//$
//$ 	@Override
//$ 	public void render(PoseStack pose, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
//$ 		if (player.isInvisible() || player.isSpectator() || !Badges.enabled()) return;
//$ 		ItemStack chest = OwnArmor.shown(player, EquipmentSlot.CHEST), legs = OwnArmor.shown(player, EquipmentSlot.LEGS);
//$ 		for (String slot : Gear.SLOTS) {
//$ 			String item = Cosmetics.worn(player.getUUID(), slot);
//$ 			if (item == null || slot.equals("back") && !Gear.backShown(chest)) continue;
//$ 			Gear.Rig rig = rigs.computeIfAbsent(item, Gear::bake);
//$ 			rig.body.copyFrom(getParentModel().body);
//$ 			// the legs swing with cos(limbSwing · 0.6662)
//$ 			Gear.animate(rig, ageInTicks / 20f, limbSwingAmount, limbSwing * 0.6662f, slot.equals("tail") && caped(player, chest), Gear.fit(slot, chest, legs, Cosmetics.worn(player.getUUID(), "suit") != null));
//$ 			rig.root.render(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(Gear.texture(item))), light, OverlayTexture.NO_OVERLAY);
//$ 		}
//$ 	}
//$ }
//#endif
