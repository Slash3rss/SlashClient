// the menu figure holding its shield and weapon (SkinPreview); before 1.21.2 the figure shows no cosmetics
//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.cosmetics.HeldSkins;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.resources.Identifier;

/**
 * A held skin on the menu figure, placed as the game places an item in a hand in third person
 * (ItemInHandLayer, then the item model's display for that hand, then the item): a chain of parts
 * that each move or turn once, under a part that follows the arm. A weapon is one small box a
 * pixel of its sprite (the colours from textures/held_figure), a shield the game's shield model.
 */
public final class HeldFigure {
	private HeldFigure() {}

	private static final float DEG = (float) Math.PI / 180f;

	/** The item model's third person display for the right hand: rotation (degrees), translation (pixels), scale (the game's item models). */
	private static float[][] display(String kind) {
		return switch (kind) {
			case "bow" -> new float[][] {{-80, 260, -40}, {-1, -2, 2.5f}, {0.9f}};
			// a shield is held in the left hand (thirdperson_lefthand, mirrored as the game mirrors the left hand)
			case "shield" -> new float[][] {{0, -90, 0}, {-10, 6, 12}, {1f}};
			default -> new float[][] {{0, -90, 55}, {0, 4, 0.5f}, {0.85f}};
		};
	}

	/** Whether the skin is held in the left hand (the shield). */
	public static boolean leftHand(String id) {
		return "shield".equals(HeldSkins.kind(id));
	}

	/** The skin's picture for the figure. */
	public static Identifier texture(String id) {
		return Identifier.fromNamespaceAndPath(SlashHud.ID, leftHand(id) ? "textures/item/held/" + id + ".png" : "textures/held_figure/" + id + ".png");
	}

	/** A new model of the item in its hand: the root follows the arm (pose(...)), the rest is fixed. */
	public static ModelPart bake(String id) {
		String kind = HeldSkins.kind(id);
		boolean left = leftHand(id);
		float side = left ? -1 : 1;
		float[][] d = display(kind == null ? "sword" : kind);
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition p = mesh.getRoot();
		// ItemInHandLayer: turned to point forward, then a pixel out to the side, 2 down the arm and 10 towards the hand
		p = p.addOrReplaceChild("a", CubeListBuilder.create(), PartPose.offsetAndRotation(0, 0, 0, -90 * DEG, 0, 0));
		p = p.addOrReplaceChild("b", CubeListBuilder.create(), PartPose.offsetAndRotation(0, 0, 0, 0, 180 * DEG, 0));
		p = p.addOrReplaceChild("c", CubeListBuilder.create(), PartPose.offset(side, 2, -10));
		// the display: moved, turned round x, y, then z, scaled
		p = p.addOrReplaceChild("d", CubeListBuilder.create(), PartPose.offset(d[1][0], d[1][1], d[1][2]));
		p = p.addOrReplaceChild("e", CubeListBuilder.create(), PartPose.offsetAndRotation(0, 0, 0, d[0][0] * DEG, 0, 0));
		p = p.addOrReplaceChild("f", CubeListBuilder.create(), PartPose.offsetAndRotation(0, 0, 0, 0, d[0][1] * DEG, 0));
		p = p.addOrReplaceChild("g", CubeListBuilder.create(), PartPose.offsetAndRotation(0, 0, 0, 0, 0, d[0][2] * DEG));
		// the item itself, from its corner (the item renderer's half a block back)
		CubeListBuilder cubes = CubeListBuilder.create();
		int tw, th;
		if (left) {
			// the game's shield model (its renderer turns it upside down and back to front)
			cubes.texOffs(0, 0).addBox(-6, -11, -2, 12, 22, 1).texOffs(26, 0).addBox(-1, -3, -1, 2, 6, 6);
			tw = th = 64;
		} else {
			String[] mask = HeldSkins.mask(id);
			for (int y = 0; mask != null && y < 16; y++) for (int x = 0; x < 16; x++) {
				if (mask[y].charAt(x) != '#') continue;
				// pixel (x, y) of the sprite, one pixel thick round the middle (as the game makes an item of a sprite)
				cubes.texOffs(4 * x, 2 * y).addBox(x, 15 - y, 7.5f, 1, 1, 1);
			}
			tw = 64;
			th = 32;
		}
		p.addOrReplaceChild("item", cubes, PartPose.offset(-8, -8, -8));
		ModelPart root = LayerDefinition.create(mesh, tw, th).bakeRoot();
		ModelPart g = root.getChild("a").getChild("b").getChild("c").getChild("d").getChild("e").getChild("f").getChild("g");
		g.xScale = g.yScale = g.zScale = d[2][0];
		if (left) {
			ModelPart item = g.getChild("item");
			item.yScale = -1;
			item.zScale = -1;
		}
		return root;
	}

	/** Puts the item's root where the figure's arm is (as the game's player model finds the hand, slim arms half a pixel in). */
	public static void pose(ModelPart item, String id, ModelPart figure, boolean slim) {
		boolean left = leftHand(id);
		ModelPart arm = figure.getChild(left ? "left_arm" : "right_arm");
		item.loadPose(arm.storePose());
		if (slim) item.x += 0.5f * (left ? -1 : 1);
	}
}
//#endif
