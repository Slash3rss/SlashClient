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
		g.skin(model, s.body().texturePath(), scale, -5, bodyYaw, PIVOT_Y, x, y, x + w, y + h);
	}
}
