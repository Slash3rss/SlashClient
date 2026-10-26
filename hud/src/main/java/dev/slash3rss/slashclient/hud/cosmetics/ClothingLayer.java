// before render states (1.21.2) clothing is drawn by a layer of its own, straight from the player
//#if MC < 1.21.2
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
//$ import net.minecraft.world.entity.EquipmentSlot;
//$
//$ import java.util.HashMap;
//$ import java.util.Map;
//$ import dev.slash3rss.slashclient.hud.Badges;
//$ import dev.slash3rss.slashclient.hud.OwnArmor;
//$
//$ /** SlashClient clothing ({@link Clothing}) on players who wear it, posed like the player model this frame. */
//$ public final class ClothingLayer extends RenderLayer<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> {
//$ 	/** Each item as a model, for wide and slim arms ("id" and "id/slim"), made when first worn. */
//$ 	private final Map<String, ModelPart> clothes = new HashMap<>();
//$
//$ 	public ClothingLayer(RenderLayerParent<AbstractClientPlayer, PlayerModel<AbstractClientPlayer>> parent) {
//$ 		super(parent);
//$ 	}
//$
//$ 	@Override
//$ 	public void render(PoseStack pose, MultiBufferSource buffers, int light, AbstractClientPlayer player, float limbSwing, float limbSwingAmount,
//$ 			float partialTick, float ageInTicks, float netHeadYaw, float headPitch) {
//$ 		if (player.isInvisible() || player.isSpectator() || !Badges.enabled()) return;
//$ 		PlayerModel<AbstractClientPlayer> parent = getParentModel();
//$ 		// the hat that shows (face and ears things it would go through hide), and the clock for twitching ears
//$ 		String hat = Cosmetics.worn(player.getUUID(), "hat");
//$ 		if (hat != null && Clothing.covered("hat", OwnArmor.shown(player, EquipmentSlot.HEAD), OwnArmor.shown(player, EquipmentSlot.CHEST))) hat = null;
//$ 		float seconds = (player.tickCount + partialTick) / 20f + Headwear.offset(player.getUUID());
//$ 		for (String slot : Clothing.SLOTS) {
//$ 			String item = Cosmetics.worn(player.getUUID(), slot);
//$ 			if (item == null || Clothing.covered(slot, item, OwnArmor.shown(player, EquipmentSlot.HEAD), OwnArmor.shown(player, EquipmentSlot.CHEST), OwnArmor.shown(player, EquipmentSlot.FEET)) || Suits.hides(player.getUUID(), slot)) continue;
			//#if MC >= 1.20.2
			//$ boolean slim = player.getSkin().model() == net.minecraft.client.resources.PlayerSkin.Model.SLIM;
			//#else
			//$ boolean slim = "slim".equals(player.getModelName());
			//#endif
//$ 			ModelPart root = clothes.computeIfAbsent(slim ? item + "/slim" : item, k -> Clothing.bake(item, slim));
//$ 			root.getChild("head").copyFrom(parent.head);
//$ 			root.getChild("body").copyFrom(parent.body);
//$ 			root.getChild("right_arm").copyFrom(parent.rightArm);
//$ 			root.getChild("left_arm").copyFrom(parent.leftArm);
//$ 			root.getChild("right_leg").copyFrom(parent.rightLeg);
//$ 			root.getChild("left_leg").copyFrom(parent.leftLeg);
//$ 			Clothing.animate(root, item, hat, seconds);
//$ 			root.render(pose, buffers.getBuffer(RenderType.entityCutoutNoCull(Clothing.texture(item))), light, OverlayTexture.NO_OVERLAY);
//$ 		}
//$ 	}
//$ }
//#endif
