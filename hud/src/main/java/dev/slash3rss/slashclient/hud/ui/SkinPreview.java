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
		skin = mc.getSkinManager().createLookup(mc.getGameProfile(), false);
	}

	// ---------- SlashClient cosmetics beside the figure: cape, wings, pet ----------

	/** The cape, the wings and pets, each as a model the preview can draw (made when first worn). */
	private Object cape, wings;
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
	//$ 	parts.put("slashclient", extra);
	//$ 	return new net.minecraft.client.model.player.PlayerModel(new ModelPart(java.util.List.of(), parts), false);
	//$ }
	//#endif

	private Object capeModel() {
		if (cape == null) {
			ModelPart body = Minecraft.getInstance().getEntityModels().bakeLayer(ModelLayers.PLAYER_CAPE).getChild("body");
			capePart = body.getChild("cape");
			cape = wrap(body);
		}
		// hanging a little away from the back, as when standing in the game
		capePart.xRot = 0.12f;
		return cape;
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
		if (layer == null) return null;
		Object model = pets.computeIfAbsent(id, k -> {
			ModelPart holder = new ModelPart(java.util.List.of(), java.util.Map.of("pet", Minecraft.getInstance().getEntityModels().bakeLayer(layer)));
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

	private static ModelPart root(Object model) {
		return ((net.minecraft.client.model.Model<?>) model).root();
	}

	/** Draws the figure in the box; the head looks at (mx, my). */
	public void draw(GuiGraphicsExtractor g, int x, int y, int w, int h, int mx, int my) {
		PlayerSkin s = dev.slash3rss.slashclient.hud.Cosmetics.withTestSkin(Minecraft.getInstance().getGameProfile().id(), skin.get());
		var model = s.model() == PlayerModelType.SLIM ? slim : wide;
		float scale = 0.97f * h / MODEL_HEIGHT;
		// where the eyes are on screen: a little below the top of the box, in the middle
		float eyesX = x + w / 2f;
		float eyesY = y + h * 0.12f;
		float dx = mx - eyesX, dy = my - eyesY;
		// angles towards the mouse (positive = to the right / down), limited like a real neck
		float wantYaw = Mth.clamp((float) Math.toDegrees(Math.atan(dx / 100f)), -45, 45);
		float wantPitch = Mth.clamp((float) Math.toDegrees(Math.atan(dy / 120f)), -25, 30);
		headYaw += (wantYaw - headYaw) * 0.25f;
		headPitch += (wantPitch - headPitch) * 0.25f;
		// the body turns a third of the way, from a slight three-quarter view
		bodyYaw += (BODY_YAW + wantYaw * 0.35f - bodyYaw) * 0.15f;

		ModelPart head = model.root().getChild("head");
		// the whole figure (rotY) and the head (yRot, relative to the body) turn in opposite senses:
		// the head's own turn adds back the body's, so the face ends up pointing at the mouse
		head.yRot = (float) Math.toRadians(bodyYaw - headYaw);
		head.xRot = (float) Math.toRadians(headPitch);
		head.zRot = 0;
		var self = Minecraft.getInstance().getGameProfile().id();
		dev.slash3rss.slashclient.hud.CosmeticsScreen.loadOwn(Minecraft.getInstance());
		float time = (System.currentTimeMillis() % 3_600_000) / 1000f;
		String wing = dev.slash3rss.slashclient.hud.Cosmetics.worn(self, "wings");
		String capeId = dev.slash3rss.slashclient.hud.Cosmetics.worn(self, "cape");
		// what is on the back first, the figure over it (each is a picture of its own, laid in order)
		// wings and the pet reach past the figure's narrow box: a wider one around the same middle
		if (wing != null) draw(g, wingsModel(time), dev.slash3rss.slashclient.hud.Cosmetics.textureId("wings", wing), scale, x - w / 2, y, w * 2, h);
		else if (capeId != null) draw(g, capeModel(), dev.slash3rss.slashclient.hud.Cosmetics.capeTexture(capeId), scale, x, y, w, h);
		g.skin(model, s.body().texturePath(), scale, -5, bodyYaw, PIVOT_Y, x, y, x + w, y + h);
		String pet = dev.slash3rss.slashclient.hud.Cosmetics.worn(self, "pet");
		Object petModel = pet == null ? null : petModel(pet, time);
		if (petModel != null) draw(g, petModel, dev.slash3rss.slashclient.hud.CosmeticLayer.petTexture(pet), scale, x - w / 2, y, w * 2, h);
	}

	private void draw(GuiGraphicsExtractor g, Object model, net.minecraft.resources.Identifier texture, float scale, int x, int y, int w, int h) {
		//#if MC >= 26.2
		g.skin((Model.Simple) model, texture, scale, -5, bodyYaw, PIVOT_Y, x, y, x + w, y + h);
		//#else
		//$ g.skin((net.minecraft.client.model.player.PlayerModel) model, texture, scale, -5, bodyYaw, PIVOT_Y, x, y, x + w, y + h);
		//#endif
	}
}
