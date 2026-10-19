// before 1.21.2 (no render states) the figure is drawn as 1.21.1's PlayerSkinWidget draws it
//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud.ui;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.model.Model;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.geom.ModelPart;
//#if MC >= 26.2
import net.minecraft.client.renderer.rendertype.RenderTypes;
//#endif
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.entity.player.PlayerSkin;

import java.util.function.Supplier;

/**
 * The player's own skin standing in the menu, the head turning towards the mouse (the body
 * follows a little), like the inventory figure. Drawn the way the game's PlayerSkinWidget is.
 */
public final class SkinPreview {
	/** Model height in blocks and the pivot the game's widget uses, so the figure fits its box. */
	private static final float MODEL_HEIGHT = 2.125f;
	private static final float PIVOT_Y = -1.0625f;
	/** A slight three-quarter view, so the figure has depth. */
	private static final float BODY_YAW = 15;

	//#if MC >= 26.2
	private final Model.Simple wide;
	private final Model.Simple slim;
	//#else
	//$ private final net.minecraft.client.model.player.PlayerModel wide;
	//$ private final net.minecraft.client.model.player.PlayerModel slim;
	//#endif
	private final Supplier<PlayerSkin> skin;
	// smoothed so the head eases after the mouse instead of snapping
	private float headYaw, headPitch, bodyYaw = BODY_YAW;
	/** Turned, running, wearing a set of the screen's: see FigureLook. */
	public final FigureLook look = new FigureLook();

	public SkinPreview(Minecraft mc) {
		var models = mc.getEntityModels();
		//#if MC >= 26.2
		wide = new Model.Simple(models.bakeLayer(ModelLayers.PLAYER), RenderTypes::entityTranslucent);
		slim = new Model.Simple(models.bakeLayer(ModelLayers.PLAYER_SLIM), RenderTypes::entityTranslucent);
		//#else
		//$ wide = new net.minecraft.client.model.player.PlayerModel(models.bakeLayer(ModelLayers.PLAYER), false);
		//$ slim = new net.minecraft.client.model.player.PlayerModel(models.bakeLayer(ModelLayers.PLAYER_SLIM), true);
		//#endif
		// the session's skin, fetched in the background; the default skin until it arrives
		//#if MC >= 1.21.9
		skin = mc.getSkinManager().createLookup(mc.getGameProfile(), false);
		//#else
		//$ skin = mc.getSkinManager().lookupInsecure(mc.getGameProfile());
		//#endif
	}

	// ---------- SlashClient cosmetics beside the figure: cape, wings, pet, clothing ----------

	/** The cape, the wings and pets, each as a model the preview can draw (made when first worn). */
	private Object cape, wings, elytra;
	private final java.util.Map<String, Object> pets = new java.util.HashMap<>();
	private ModelPart capePart, leftWing, rightWing;

	/**
	 * `extra` drawn with the figure's own model and placement. Before 26.2 the preview draws only
	 * player models, so it goes in one whose own parts are hidden (the cape layer's has no cubes but the cape).
	 */
	//#if MC >= 26.2
	private static Model.Simple wrap(ModelPart extra) {
		return new Model.Simple(new ModelPart(java.util.List.of(), java.util.Map.of("slashclient", extra)), RenderTypes::entityTranslucent);
	}
	//#else
	//$ private static net.minecraft.client.model.player.PlayerModel wrap(ModelPart extra) {
	//$ 	ModelPart base = Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.PLAYER_CAPE);
	//$ 	java.util.Map<String, ModelPart> parts = new java.util.HashMap<>();
	//$ 	for (String n : java.util.List.of("head", "body", "left_arm", "right_arm", "left_leg", "right_leg")) parts.put(n, base.getChild(n));
	//$ 	base.getChild("body").getChild("cape").visible = false;
	//#if MC < 1.21.9
	//$ 	// here the cape layer's limbs lack the outer layer the player model looks up: empty parts stand in
	//$ 	java.util.Map<String, String> outer = java.util.Map.of("head", "hat", "body", "jacket", "left_arm", "left_sleeve",
	//$ 		"right_arm", "right_sleeve", "left_leg", "left_pants", "right_leg", "right_pants");
	//$ 	outer.forEach((part, child) -> parts.put(part, new ModelPart(java.util.List.of(), java.util.Map.of(child, new ModelPart(java.util.List.of(), java.util.Map.of())))));
	//#endif
	//$ 	parts.put("slashclient", extra);
	//$ 	return new net.minecraft.client.model.player.PlayerModel(new ModelPart(java.util.List.of(), parts), false);
	//$ }
	//#endif

	private Object capeModel(float swing) {
		if (cape == null) {
			ModelPart body = Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.PLAYER_CAPE).getChild("body");
			capePart = body.getChild("cape");
			cape = wrap(body);
		}
		// hanging a little away from the back, as when standing in the game; blown back when running
		// (the cape part is turned round to face backwards, so tilting its bottom back is a negative turn)
		capePart.xRot = -(look.running ? 0.75f + Math.abs(swing) * 0.12f : 0.12f);
		return cape;
	}

	/** The elytra folded on the back, as the game draws a worn one when not flying. */
	private Object elytraModel() {
		if (elytra == null) {
			ModelPart root = Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.ELYTRA);
			ModelPart left = root.getChild("left_wing"), right = root.getChild("right_wing");
			root.z = 2;
			left.xRot = right.xRot = 0.2618f;
			left.zRot = -0.2618f;
			right.zRot = 0.2618f;
			left.yRot = right.yRot = 0;
			elytra = wrap(root);
		}
		return elytra;
	}

	private Object wingsModel(float time) {
		if (wings == null) {
			ModelPart root = Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.ELYTRA);
			leftWing = root.getChild("left_wing");
			rightWing = root.getChild("right_wing");
			// the elytra's place on the back, as the game draws wings (2 pixels behind the body)
			root.z = 2;
			wings = wrap(root);
		}
		// half open and slowly beating, as on players in the game
		float beat = (float) Math.sin(time * 1.8f);
		leftWing.xRot = rightWing.xRot = 0.2618f + beat * 0.03f;
		leftWing.yRot = 0.08f;
		rightWing.yRot = -0.08f;
		leftWing.zRot = -0.62f - beat * 0.16f;
		rightWing.zRot = -leftWing.zRot;
		return wings;
	}

	private Object petModel(String id, float time) {
		var layer = dev.slash3rss.slashclient.hud.CosmeticLayer.petLayer(id);
		// the game's mobs by their layer, ours from their boxes
		if (layer == null && !dev.slash3rss.slashclient.hud.OurPets.IDS.contains(id)) return null;
		Object model = pets.computeIfAbsent(id, k -> {
			ModelPart pet = layer != null ? Minecraft.getInstance().getEntityModels().bakeLayer(layer) : dev.slash3rss.slashclient.hud.OurPets.bake(id);
			ModelPart holder = new ModelPart(java.util.List.of(), java.util.Map.of("pet", pet));
			holder.xScale = holder.yScale = holder.zScale = 0.55f;
			return wrap(holder);
		});
		// by the shoulder, its feet (24 pixels under its origin) a little above it, bobbing
		ModelPart holder = root(model).getChild("slashclient");
		holder.x = 9;
		holder.y = -3 - 24 * 0.55f + (float) Math.sin(time * 2.2f) * 0.8f;
		holder.z = 1;
		return model;
	}

	/** A clothing item on the figure, its head, body, arms and legs posed as the figure's (with `hat` on; ears twitch by `time`). */
	private Object clothingModel(String id, boolean slimArms, ModelPart figure, String hat, float time) {
		Object model = clothes.computeIfAbsent(slimArms ? id + "/slim" : id, k -> wrap(dev.slash3rss.slashclient.hud.Clothing.bake(id, slimArms)));
		ModelPart parts = root(model).getChild("slashclient");
		for (String bone : dev.slash3rss.slashclient.hud.Clothing.BONES) parts.getChild(bone).loadPose(figure.getChild(bone).storePose());
		dev.slash3rss.slashclient.hud.Clothing.animate(parts, id, hat, time);
		return model;
	}
	private final java.util.Map<String, Object> clothes = new java.util.HashMap<>();

	/** A suit on the figure, its six parts posed as the figure's; its back gives way to a cape, wings or an elytra there. */
	private Object suitModel(String id, boolean slimArms, ModelPart figure, boolean backTaken) {
		Object model = suits.computeIfAbsent(slimArms ? id + "/slim" : id, k -> wrap(dev.slash3rss.slashclient.hud.Suits.bake(id, slimArms)));
		ModelPart parts = root(model).getChild("slashclient");
		for (String bone : java.util.List.of("head", "body", "right_arm", "left_arm", "right_leg", "left_leg")) parts.getChild(bone).loadPose(figure.getChild(bone).storePose());
		dev.slash3rss.slashclient.hud.Suits.showParts(parts, id, backTaken ? dev.slash3rss.slashclient.hud.Suits.BACK : 0);
		return model;
	}
	private final java.util.Map<String, Object> suits = new java.util.HashMap<>();

	/** A held skin in its hand (HeldFigure), following the figure's arm. */
	private Object heldModel(String id, boolean slimArms, ModelPart figure) {
		Object model = held.computeIfAbsent(id, k -> wrap(HeldFigure.bake(id)));
		HeldFigure.pose(root(model).getChild("slashclient"), id, figure, slimArms);
		return model;
	}
	private final java.util.Map<String, Object> held = new java.util.HashMap<>();

	/** A back item or a tail on the figure (model and rig, made when first worn), its body posed as the figure's, the tail moving. */
	private Object gearModel(String id, ModelPart figure, float time, float walk, float phase, boolean caped) {
		Object[] made = gear.computeIfAbsent(id, k -> {
			var rig = dev.slash3rss.slashclient.hud.Gear.bake(k);
			return new Object[] {wrap(rig.root), rig};
		});
		var rig = (dev.slash3rss.slashclient.hud.Gear.Rig) made[1];
		rig.body.loadPose(figure.getChild("body").storePose());
		dev.slash3rss.slashclient.hud.Gear.animate(rig, time, walk, phase, caped, 0);
		return made[0];
	}
	private final java.util.Map<String, Object[]> gear = new java.util.HashMap<>();

	private static ModelPart root(Object model) {
		return ((net.minecraft.client.model.Model<?>) model).root();
	}

	/**
	 * How far the figure's picture reaches past its box, in box widths to each side and box
	 * heights above: wings, the pet by the shoulder, swinging arms and legs and a cape blown
	 * back when running all stay inside it (the picture is cut at its edges).
	 */
	public static final float REACH_SIDE = 1.25f, REACH_UP = 0.4f;

	/** Draws the figure in the box; the head looks at (mx, my). */
	public void draw(GuiGraphicsExtractor g, int x, int y, int w, int h, int mx, int my) {
		PlayerSkin s = dev.slash3rss.slashclient.hud.Cosmetics.withTestSkin(Minecraft.getInstance().getGameProfile().id(), skin.get());
		var model = s.model() == PlayerModelType.SLIM ? slim : wide;
		float scale = 0.97f * h / MODEL_HEIGHT;
		// where the eyes are on screen: a little below the top of the box, in the middle
		float eyesX = x + w / 2f;
		float eyesY = y + h * 0.12f;
		float dx = mx - eyesX, dy = my - eyesY;
		// turned away (its side or back shown) the head no longer follows the mouse
		float follow = look.step();
		// angles towards the mouse (positive = to the right / down), limited like a real neck
		float wantYaw = Mth.clamp((float) Math.toDegrees(Math.atan(dx / 100f)), -45, 45) * follow;
		float wantPitch = Mth.clamp((float) Math.toDegrees(Math.atan(dy / 120f)), -25, 30) * follow;
		headYaw += (wantYaw - headYaw) * 0.25f;
		headPitch += (wantPitch - headPitch) * 0.25f;
		// the body turns a third of the way, from a slight three-quarter view
		bodyYaw += (BODY_YAW + wantYaw * 0.35f - bodyYaw) * 0.15f;
		float yaw = bodyYaw + look.turned;

		var root = model.root();
		ModelPart head = root.getChild("head");
		// the whole figure (rotY) and the head (yRot, relative to the body) turn in opposite senses:
		// the head's own turn adds back the body's, so the face ends up pointing at the mouse
		head.yRot = (float) Math.toRadians(bodyYaw - headYaw);
		head.xRot = (float) Math.toRadians(headPitch);
		head.zRot = 0;
		float time = (System.currentTimeMillis() % 3_600_000) / 1000f;
		// running on the spot: arms and legs swing, the body bobs a little
		float swing = look.swing(time);
		root.getChild("right_arm").xRot = swing * 0.9f;
		root.getChild("left_arm").xRot = -swing * 0.9f;
		root.getChild("right_leg").xRot = -swing;
		root.getChild("left_leg").xRot = swing;
		if (look.running) y -= Math.round(Math.abs(swing) * h * 0.012f);
		var self = Minecraft.getInstance().getGameProfile().id();
		// on the shield's and weapon's tabs it holds them, its arms raised a little as the game's players holding an item
		String[] holding = look.held ? new String[] {look.worn(self, "shield"), look.worn(self, "weapon")} : new String[0];
		for (String item : holding) {
			if (item == null || dev.slash3rss.slashclient.hud.HeldSkins.kind(item) == null) continue;
			ModelPart arm = root.getChild(HeldFigure.leftHand(item) ? "left_arm" : "right_arm");
			arm.xRot = -(float) Math.PI / 10f;
			arm.yRot = 0;
		}
		dev.slash3rss.slashclient.hud.CosmeticsScreen.loadOwn(Minecraft.getInstance());
		// the aura and the trail: the game's particle pictures, those behind the figure first
		look.tickParticles(self);
		float feetX = x + w / 2f, feetY = y + h / 2f + (MODEL_HEIGHT / 2 - 0.0625f) * scale;
		// the ring on the ground under it, and the movement effect's show (the figure hops for some)
		FigureMoves.drawRing(g, look.worn(self, "ring"), feetX, feetY, scale, yaw);
		look.moves.draw(g, feetX, feetY, scale, yaw, false);
		y -= Math.round(look.moves.lift() * scale);
		look.particles.draw(g, feetX, feetY, scale, yaw, false);
		// the figure and all it wears, one picture with depth: whatever is nearer covers the rest
		java.util.List<FigureRender.Layer> layers = new java.util.ArrayList<>();
		layers.add(new FigureRender.Layer(model, s.body().texturePath()));
		boolean slimArms = s.model() == PlayerModelType.SLIM;
		// on the back: the elytra (on its slot's tab), else a back item, else the wings, else the cape
		String elytraId = look.elytra ? look.worn(self, "elytra") : null, wing = look.worn(self, "wings"), capeId = look.worn(self, "cape");
		// a suit over all of it hides the clothing (and gives its back to what is worn there)
		String suit = look.worn(self, "suit");
		String backId = look.worn(self, "back"), tailId = look.worn(self, "tail");
		if (suit != null) layer(layers, suitModel(suit, slimArms, root, elytraId != null || backId != null || wing != null || capeId != null), dev.slash3rss.slashclient.hud.Suits.texture(suit));
		// the hat that shows (face and ears things it would go through hide)
		String hat = suit != null && dev.slash3rss.slashclient.hud.Suits.HIDDEN.contains("hat") ? null : look.worn(self, "hat");
		for (String slot : dev.slash3rss.slashclient.hud.Clothing.SLOTS) {
			String item = suit != null && dev.slash3rss.slashclient.hud.Suits.HIDDEN.contains(slot) ? null : look.worn(self, slot);
			if (item != null) layer(layers, clothingModel(item, slimArms, root, hat, time), dev.slash3rss.slashclient.hud.Clothing.texture(item));
		}
		boolean caped = false;
		if (elytraId != null) layer(layers, elytraModel(), dev.slash3rss.slashclient.hud.Cosmetics.textureId("elytra", elytraId));
		else if (backId != null) layer(layers, gearModel(backId, root, time, 0, 0, false), dev.slash3rss.slashclient.hud.Gear.texture(backId));
		else if (wing != null) layer(layers, wingsModel(time), dev.slash3rss.slashclient.hud.Cosmetics.textureId("wings", wing));
		else if (capeId != null) {
			layer(layers, capeModel(swing), dev.slash3rss.slashclient.hud.Cosmetics.capeTexture(capeId));
			caped = true;
		}
		for (String item : holding) {
			if (item != null && dev.slash3rss.slashclient.hud.HeldSkins.kind(item) != null) layer(layers, heldModel(item, slimArms, root), HeldFigure.texture(item));
		}
		// a tail swings with the running steps (the legs swing with sin(time · 11))
		if (tailId != null) layer(layers, gearModel(tailId, root, time, look.running ? 1 : 0, time * 11f + (float) Math.PI / 2, caped), dev.slash3rss.slashclient.hud.Gear.texture(tailId));
		String pet = look.worn(self, "pet");
		Object petModel = pet == null ? null : petModel(pet, time);
		if (petModel != null) layer(layers, petModel, dev.slash3rss.slashclient.hud.CosmeticLayer.petTexture(pet));
		// a box round the figure's own with the same bottom middle (where its feet stand), wide and tall enough for all of it
		int side = Math.round(w * REACH_SIDE), up = Math.round(h * REACH_UP);
		FigureRender.draw(g, layers, scale, -5, yaw, PIVOT_Y, x - side, y - up, x + w + side, y + h);
		look.particles.draw(g, feetX, feetY, scale, yaw, true);
		look.moves.draw(g, feetX, feetY, scale, yaw, true);
	}

	private static void layer(java.util.List<FigureRender.Layer> layers, Object model, net.minecraft.resources.Identifier texture) {
		layers.add(new FigureRender.Layer((net.minecraft.client.model.Model<?>) model, texture));
	}
}
//#elif MC >= 1.20.2
//$ package dev.slash3rss.slashclient.hud.ui;
//$
//$ import com.mojang.blaze3d.platform.Lighting;
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import com.mojang.math.Axis;
//$ import net.minecraft.client.Minecraft;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.client.model.PlayerModel;
//$ import net.minecraft.client.model.geom.ModelLayers;
//$ import net.minecraft.client.renderer.texture.OverlayTexture;
//$ import net.minecraft.client.resources.PlayerSkin;
//$ import net.minecraft.util.Mth;
//$
//$ import java.util.function.Supplier;
//$
//$ /**
//$  * The player's own skin standing in the menu, the head turning towards the mouse, drawn the way
//$  * 1.21.1's PlayerSkinWidget draws it (before render states). Only the figure: the cosmetics
//$  * beside it need the newer model API.
//$  */
//$ public final class SkinPreview {
//$ 	private static final float MODEL_HEIGHT = 2.125f;
//$ 	private static final float BODY_YAW = 15;
//$
//$ 	private final PlayerModel<?> wide;
//$ 	private final PlayerModel<?> slim;
//$ 	private final Supplier<PlayerSkin> skin;
//$ 	private float headYaw, headPitch, bodyYaw = BODY_YAW;
//$ 	/** Turned, running, the aura and the trail around it: see FigureLook. */
//$ 	public final FigureLook look = new FigureLook();
//$
//$ 	public SkinPreview(Minecraft mc) {
//$ 		var models = mc.getEntityModels();
//$ 		wide = new PlayerModel<>(models.bakeLayer(ModelLayers.PLAYER), false);
//$ 		slim = new PlayerModel<>(models.bakeLayer(ModelLayers.PLAYER_SLIM), true);
//$ 		wide.young = slim.young = false;
//$ 		skin = mc.getSkinManager().lookupInsecure(mc.getGameProfile());
//$ 	}
//$
//$ 	/** Draws the figure in the box; the head looks at (mx, my). */
//$ 	public void draw(GuiGraphics graphics, int x, int y, int w, int h, int mx, int my) {
//$ 		PlayerSkin s = dev.slash3rss.slashclient.hud.Cosmetics.withTestSkin(Minecraft.getInstance().getGameProfile().getId(), skin.get());
//$ 		PlayerModel<?> model = s.model() == PlayerSkin.Model.SLIM ? slim : wide;
//$ 		float eyesX = x + w / 2f;
//$ 		float eyesY = y + h * 0.12f;
//$ 		float dx = mx - eyesX, dy = my - eyesY;
//$ 		float follow = look.step();
//$ 		float wantYaw = Mth.clamp((float) Math.toDegrees(Math.atan(dx / 100f)), -45, 45) * follow;
//$ 		float wantPitch = Mth.clamp((float) Math.toDegrees(Math.atan(dy / 120f)), -25, 30) * follow;
//$ 		headYaw += (wantYaw - headYaw) * 0.25f;
//$ 		headPitch += (wantPitch - headPitch) * 0.25f;
//$ 		bodyYaw += (BODY_YAW + wantYaw * 0.35f - bodyYaw) * 0.15f;
//$ 		float yaw = bodyYaw + look.turned;
//$ 		model.head.yRot = (float) Math.toRadians(bodyYaw - headYaw);
//$ 		model.head.xRot = (float) Math.toRadians(headPitch);
//$ 		model.hat.copyFrom(model.head);
//$ 		float swing = look.swing((System.currentTimeMillis() % 3_600_000) / 1000f);
//$ 		model.rightArm.xRot = swing * 0.9f;
//$ 		model.leftArm.xRot = -swing * 0.9f;
//$ 		model.rightLeg.xRot = -swing;
//$ 		model.leftLeg.xRot = swing;
//$ 		model.rightSleeve.copyFrom(model.rightArm);
//$ 		model.leftSleeve.copyFrom(model.leftArm);
//$ 		model.rightPants.copyFrom(model.rightLeg);
//$ 		model.leftPants.copyFrom(model.leftLeg);
//$ 		if (look.running) y -= Math.round(Math.abs(swing) * h * 0.012f);
//$ 		float scale = 0.97f * h / MODEL_HEIGHT;
//$ 		var self = Minecraft.getInstance().getGameProfile().getId();
//$ 		look.tickParticles(self);
//$ 		float feetY = y + h - 0.0625f * scale;
//$ 		var g = graphics;
//$ 		FigureMoves.drawRing(g, look.worn(self, "ring"), x + w / 2f, feetY, scale, yaw);
//$ 		look.moves.draw(g, x + w / 2f, feetY, scale, yaw, false);
//$ 		y -= Math.round(look.moves.lift() * scale);
//$ 		look.particles.draw(graphics, x + w / 2f, feetY, scale, yaw, false);
//$
//$ 		PoseStack pose = graphics.pose();
//$ 		pose.pushPose();
//$ 		pose.translate(x + w / 2f, y + h, 100f);
//$ 		pose.scale(scale, scale, scale);
//$ 		pose.translate(0f, -0.0625f, 0f);
//$ 		pose.rotateAround(Axis.XP.rotationDegrees(-5), 0f, -1.0625f, 0f);
//$ 		pose.mulPose(Axis.YP.rotationDegrees(yaw));
//$ 		graphics.flush();
//$ 		Lighting.setupForEntityInInventory(Axis.XP.rotationDegrees(-5));
//$ 		pose.pushPose();
//$ 		pose.scale(1f, 1f, -1f);
//$ 		pose.translate(0f, -1.5f, 0f);
//$ 		model.renderToBuffer(pose, graphics.bufferSource().getBuffer(model.renderType(s.texture())), 15728880, OverlayTexture.NO_OVERLAY);
//$ 		pose.popPose();
//$ 		graphics.flush();
//$ 		Lighting.setupFor3DItems();
//$ 		pose.popPose();
//$ 		// the particles in front, over the figure's depth
//$ 		pose.pushPose();
//$ 		pose.translate(0f, 0f, 300f);
//$ 		look.particles.draw(graphics, x + w / 2f, feetY, scale, yaw, true);
//$ 		look.moves.draw(g, x + w / 2f, feetY, scale, yaw, true);
//$ 		pose.popPose();
//$ 	}
//$ }
//#else
//$ package dev.slash3rss.slashclient.hud.ui;
//$
//$ import com.mojang.authlib.minecraft.MinecraftProfileTexture;
//$ import com.mojang.blaze3d.platform.Lighting;
//$ import com.mojang.blaze3d.vertex.PoseStack;
//$ import com.mojang.math.Axis;
//$ import net.minecraft.client.Minecraft;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.client.model.PlayerModel;
//$ import net.minecraft.client.model.geom.ModelLayers;
//$ import net.minecraft.client.model.geom.ModelPart;
//$ import net.minecraft.client.renderer.RenderType;
//$ import net.minecraft.client.renderer.texture.OverlayTexture;
//$ import net.minecraft.client.resources.DefaultPlayerSkin;
//$ import net.minecraft.resources.ResourceLocation;
//$ import net.minecraft.util.Mth;
//$
//$ /**
//$  * The player's own skin standing in the menu, the head turning towards the mouse (1.20.1: the
//$  * player model drawn straight into the GUI, with the picked cape; wings and pets are not shown).
//$  */
//$ public final class SkinPreview {
//$ 	private static final float BODY_YAW = 15;
//$
//$ 	private final PlayerModel<?> wide;
//$ 	private final PlayerModel<?> slim;
//$ 	private volatile ResourceLocation skin;
//$ 	private volatile boolean slimSkin;
//$ 	private float headYaw, headPitch, bodyYaw = BODY_YAW;
//$ 	/** Turned, running, the aura and the trail around it: see FigureLook. */
//$ 	public final FigureLook look = new FigureLook();
//$
//$ 	public SkinPreview(Minecraft mc) {
//$ 		var models = mc.getEntityModels();
//$ 		wide = new PlayerModel<>(models.bakeLayer(ModelLayers.PLAYER), false);
//$ 		slim = new PlayerModel<>(models.bakeLayer(ModelLayers.PLAYER_SLIM), true);
//$ 		var profile = mc.getUser().getGameProfile();
//$ 		skin = DefaultPlayerSkin.getDefaultSkin(profile.getId());
//$ 		slimSkin = "slim".equals(DefaultPlayerSkin.getSkinModelName(profile.getId()));
//$ 		// the session's skin, fetched in the background; the default skin until it arrives
//$ 		Thread t = new Thread(() -> {
//$ 			try {
//$ 				var filled = mc.getMinecraftSessionService().fillProfileProperties(profile, false);
//$ 				MinecraftProfileTexture texture = mc.getSkinManager().getInsecureSkinInformation(filled).get(MinecraftProfileTexture.Type.SKIN);
//$ 				if (texture == null) return;
//$ 				mc.execute(() -> {
//$ 					skin = mc.getSkinManager().registerTexture(texture, MinecraftProfileTexture.Type.SKIN);
//$ 					slimSkin = "slim".equals(texture.getMetadata("model"));
//$ 				});
//$ 			} catch (RuntimeException e) {
//$ 				// offline or no skin: the default one stays
//$ 			}
//$ 		}, "SlashClient skin");
//$ 		t.setDaemon(true);
//$ 		t.start();
//$ 	}
//$
//$ 	/** Draws the figure in the box; the head looks at (mx, my). */
//$ 	public void draw(GuiGraphics g, int x, int y, int w, int h, int mx, int my) {
//$ 		PlayerModel<?> model = slimSkin ? slim : wide;
//$ 		float scale = 0.97f * h / 2.125f;
//$ 		float eyesX = x + w / 2f;
//$ 		float eyesY = y + h * 0.12f;
//$ 		float dx = mx - eyesX, dy = my - eyesY;
//$ 		float follow = look.step();
//$ 		float wantYaw = Mth.clamp((float) Math.toDegrees(Math.atan(dx / 100f)), -45, 45) * follow;
//$ 		float wantPitch = Mth.clamp((float) Math.toDegrees(Math.atan(dy / 120f)), -25, 30) * follow;
//$ 		headYaw += (wantYaw - headYaw) * 0.25f;
//$ 		headPitch += (wantPitch - headPitch) * 0.25f;
//$ 		bodyYaw += (BODY_YAW + wantYaw * 0.35f - bodyYaw) * 0.15f;
//$ 		float yaw = bodyYaw + look.turned;
//$ 		float swing = look.swing((System.currentTimeMillis() % 3_600_000) / 1000f);
//$ 		if (look.running) y -= Math.round(Math.abs(swing) * h * 0.012f);
//$
//$ 		model.young = false;
//$ 		model.crouching = false;
//$ 		model.riding = false;
//$ 		model.attackTime = 0;
//$ 		model.setAllVisible(true);
//$ 		for (ModelPart p : new ModelPart[] { model.body, model.leftArm, model.rightArm, model.leftLeg, model.rightLeg }) p.resetPose();
//$ 		model.head.resetPose();
//$ 		model.rightArm.xRot = swing * 0.9f;
//$ 		model.leftArm.xRot = -swing * 0.9f;
//$ 		model.rightLeg.xRot = -swing;
//$ 		model.leftLeg.xRot = swing;
//$ 		model.head.yRot = (float) Math.toRadians(headYaw - bodyYaw);
//$ 		model.head.xRot = (float) Math.toRadians(headPitch);
//$ 		model.hat.copyFrom(model.head);
//$ 		model.jacket.copyFrom(model.body);
//$ 		model.leftSleeve.copyFrom(model.leftArm);
//$ 		model.rightSleeve.copyFrom(model.rightArm);
//$ 		model.leftPants.copyFrom(model.leftLeg);
//$ 		model.rightPants.copyFrom(model.rightLeg);
//$
//$ 		var self = Minecraft.getInstance().getUser().getProfileId();
//$ 		look.tickParticles(self);
//$ 		float feetY = y + h / 2f + scale;
//$ 		FigureMoves.drawRing(g, look.worn(self, "ring"), x + w / 2f, feetY, scale, yaw);
//$ 		look.moves.draw(g, x + w / 2f, feetY, scale, yaw, false);
//$ 		y -= Math.round(look.moves.lift() * scale);
//$ 		look.particles.draw(g, x + w / 2f, feetY, scale, yaw, false);
//$ 		PoseStack pose = ((GuiGraphics) g).pose();
//$ 		pose.pushPose();
//$ 		// the model's origin is at the neck: the head 0.5 blocks above it, the feet 1.5 below
//$ 		pose.translate(x + w / 2f, y + h / 2f - 0.5f * scale, 100);
//$ 		pose.scale(scale, scale, -scale);
//$ 		pose.mulPose(Axis.YP.rotationDegrees(yaw));
//$ 		Lighting.setupForEntityInInventory();
//$ 		var buffers = g.bufferSource();
//$ 		String cape = look.worn(self, "cape");
//$ 		// a back item takes the cape's place (it is not drawn here)
//$ 		if (cape != null && look.worn(self, "back") == null) {
//$ 			pose.pushPose();
//$ 			pose.translate(0, 0, 0.125f);
//$ 			pose.mulPose(Axis.XP.rotationDegrees(6));
//$ 			pose.mulPose(Axis.YP.rotationDegrees(180));
//$ 			model.renderCloak(pose, buffers.getBuffer(RenderType.entitySolid(dev.slash3rss.slashclient.hud.Cosmetics.capeTexture(cape))), 0xF000F0, OverlayTexture.NO_OVERLAY);
//$ 			pose.popPose();
//$ 		}
//$ 		model.renderToBuffer(pose, buffers.getBuffer(RenderType.entityTranslucent(skin)), 0xF000F0, OverlayTexture.NO_OVERLAY, 1, 1, 1, 1);
//$ 		g.flush();
//$ 		Lighting.setupFor3DItems();
//$ 		pose.popPose();
//$ 		// the particles in front, over the figure's depth
//$ 		pose.pushPose();
//$ 		pose.translate(0f, 0f, 300f);
//$ 		look.particles.draw(g, x + w / 2f, feetY, scale, yaw, true);
//$ 		look.moves.draw(g, x + w / 2f, feetY, scale, yaw, true);
//$ 		pose.popPose();
//$ 	}
//$ }
//#endif
