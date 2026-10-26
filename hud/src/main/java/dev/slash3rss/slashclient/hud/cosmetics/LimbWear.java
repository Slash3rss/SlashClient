package dev.slash3rss.slashclient.hud.cosmetics;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.player.AbstractClientPlayer;
//#if MC >= 1.21.2
import net.minecraft.client.renderer.SubmitNodeCollector;
//#else
//$ import net.minecraft.client.renderer.MultiBufferSource;
//#endif
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.util.RandomSource;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.player.Player;

import java.util.HashMap;
import java.util.Map;
import dev.slash3rss.slashclient.hud.Badges;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.OwnArmor;

/**
 * What the shoes and the hands' items ({@link Clothing}, slots "shoes" and "hands") do beyond
 * being worn on the model: the hands' items on our own arms in first person (where the game draws
 * the arm itself, see HandWearMixin), and the rocket boots' little flames under the heels.
 */
public final class LimbWear {
	private LimbWear() {}

	/** Players further than this get no flames: nobody would see them. */
	private static final double RANGE_SQ = 32 * 32;
	private static final RandomSource RANDOM = RandomSource.create();
	/** The hands' items as models for first person, wide and slim ("id" and "id/slim"); their own copies, posed like the arm drawn. */
	private static final Map<String, ModelPart> firstPerson = new HashMap<>();
	private static int tick;

	/**
	 * After the game drew one of our arms in first person (the empty main hand, or both arms
	 * holding a map): what we wear on that hand, on it. The arm is posed as it was drawn; a held
	 * item is drawn without the arm, so a glove never covers one.
	 */
	//#if MC >= 1.21.2
	public static void firstPerson(PoseStack pose, SubmitNodeCollector out, int light, ModelPart arm, AbstractClientPlayer player) {
	//#else
	//$ public static void firstPerson(PoseStack pose, MultiBufferSource out, int light, ModelPart arm, AbstractClientPlayer player) {
	//#endif
		if (player == null || player.isInvisible() || !Badges.enabled()) return;
		String item = Cosmetics.worn(player.getUUID(), "hands");
		// a suit's sleeves cover the hands (Suits.hides): not in first person either
		if (item == null || Suits.hides(player.getUUID(), "hands")) return;
		//#if MC >= 1.21.9
		boolean slim = player.getSkin().model() == net.minecraft.world.entity.player.PlayerModelType.SLIM;
		//#elif MC >= 1.20.2
		//$ boolean slim = player.getSkin().model() == net.minecraft.client.resources.PlayerSkin.Model.SLIM;
		//#else
		//$ boolean slim = "slim".equals(player.getModelName());
		//#endif
		ModelPart root = firstPerson.computeIfAbsent(slim ? item + "/slim" : item, k -> Clothing.bake(item, slim));
		// the right arm hangs at -5 from the body's middle, the left at +5
		ModelPart part = root.getChild(arm.x < 0 ? "right_arm" : "left_arm");
		part.loadPose(arm.storePose());
		// both sides drawn, as the clothing on the model (26.1 calls that plain "cutout")
		//#if MC >= 26.1
		var type = RenderTypes.entityCutout(Clothing.texture(item));
		//#else
		//$ var type = RenderTypes.entityCutoutNoCull(Clothing.texture(item));
		//#endif
		//#if MC >= 1.21.9
		out.submitModelPart(part, pose, type, light, OverlayTexture.NO_OVERLAY, null);
		//#else
		//$ part.render(pose, out.getBuffer(type), light, OverlayTexture.NO_OVERLAY);
		//#endif
	}

	/** The rocket boots' flames, for every player near enough who wears them (not under real boots). */
	public static void tick(Minecraft mc) {
		if (mc.level == null || mc.player == null || !Badges.enabled() || Compat.screen(mc) instanceof net.minecraft.client.gui.screens.PauseScreen) return;
		tick++;
		for (Player p : mc.level.players()) {
			if (p.isInvisible() || p.isSpectator() || p.distanceToSqr(mc.player) > RANGE_SQ) continue;
			if (!"rocketboots".equals(Cosmetics.worn(p.getUUID(), "shoes")) || !OwnArmor.shown(p, EquipmentSlot.FEET).isEmpty() || Suits.hides(p.getUUID(), "shoes")) continue;
			// in the air they fire harder
			if (p.onGround() && tick % 2 != 0) continue;
			double yaw = Math.toRadians(p.yBodyRot);
			double fx = -Math.sin(yaw), fz = Math.cos(yaw);
			// the player's right: the forward direction turned a quarter
			double rx = -fz, rz = fx;
			for (int side = -1; side <= 1; side += 2) {
				// under the heel's nozzle: an eighth of a block to the side, a little behind the feet
				double x = p.getX() + rx * 0.12 * side - fx * 0.2 + (RANDOM.nextDouble() - 0.5) * 0.05;
				double z = p.getZ() + rz * 0.12 * side - fz * 0.2 + (RANDOM.nextDouble() - 0.5) * 0.05;
				mc.level.addParticle(ParticleTypes.SMALL_FLAME, x, p.getY() + 0.12, z, -fx * 0.01, -0.03, -fz * 0.01);
			}
		}
	}
}
