package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.ambient.BatModel;
import net.minecraft.client.model.animal.allay.AllayModel;
import net.minecraft.client.model.animal.parrot.ParrotModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.monster.vex.VexModel;
import net.minecraft.client.model.object.equipment.ElytraModel;
import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.SubmitNodeCollector;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.RenderLayerParent;
import net.minecraft.client.renderer.entity.layers.RenderLayer;
import net.minecraft.client.renderer.entity.state.AllayRenderState;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.client.renderer.entity.state.BatRenderState;
import net.minecraft.client.renderer.entity.state.BeeRenderState;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.entity.state.ParrotRenderState;
import net.minecraft.client.renderer.entity.state.VexRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Items;

import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Wings on the back and a pet at the shoulder, for players who wear them. Both are the game's
 * own models: the wings are the elytra's (with our pictures, gently opening and closing), the
 * pets small copies of a few flying mobs.
 */
public final class CosmeticLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final ElytraModel wings;
	private final Map<String, Pet> pets;

	/** A pet: its model, a fresh state for each frame (the model reads it later), its picture and size. */
	private record Pet(EntityModel<?> model, Supplier<LivingEntityRenderState> state, Identifier texture, float scale) {}

	CosmeticLayer(RenderLayerParent<AvatarRenderState, PlayerModel> parent, EntityRendererProvider.Context context) {
		super(parent);
		wings = new ElytraModel(context.bakeLayer(ModelLayers.ELYTRA));
		pets = Map.of(
			"allay", new Pet(new AllayModel(context.bakeLayer(ModelLayers.ALLAY)), AllayRenderState::new, vanilla("allay/allay"), 0.7f),
			"vex", new Pet(new VexModel(context.bakeLayer(ModelLayers.VEX)), VexRenderState::new, vanilla("illager/vex"), 0.7f),
			//#if MC >= 26.1
			"bat", new Pet(new BatModel(context.bakeLayer(ModelLayers.BAT)), BatRenderState::new, vanilla("bat/bat"), 0.6f),
			"bee", new Pet(new net.minecraft.client.model.animal.bee.AdultBeeModel(context.bakeLayer(ModelLayers.BEE)), BeeRenderState::new, vanilla("bee/bee"), 0.6f),
			//#else
			//$ "bat", new Pet(new BatModel(context.bakeLayer(ModelLayers.BAT)), BatRenderState::new, vanilla("bat"), 0.6f),
			//$ "bee", new Pet(new net.minecraft.client.model.animal.bee.BeeModel(context.bakeLayer(ModelLayers.BEE)), BeeRenderState::new, vanilla("bee/bee"), 0.6f),
			//#endif
			"parrot", new Pet(new ParrotModel(context.bakeLayer(ModelLayers.PARROT)), ParrotRenderState::new, vanilla("parrot/parrot_red_blue"), 0.65f),
			"blaze", new Pet(new net.minecraft.client.model.monster.blaze.BlazeModel(context.bakeLayer(ModelLayers.BLAZE)), LivingEntityRenderState::new, petTexture("blaze"), 0.4f),
			"phantom", new Pet(new net.minecraft.client.model.monster.phantom.PhantomModel(context.bakeLayer(ModelLayers.PHANTOM)), net.minecraft.client.renderer.entity.state.PhantomRenderState::new, petTexture("phantom"), 0.55f));
	}

	/** A pet's model layer and picture, for drawing it elsewhere too (the menu's skin preview). */
	public static net.minecraft.client.model.geom.ModelLayerLocation petLayer(String id) {
		return switch (id) {
			case "allay" -> ModelLayers.ALLAY;
			case "vex" -> ModelLayers.VEX;
			case "bat" -> ModelLayers.BAT;
			case "bee" -> ModelLayers.BEE;
			case "parrot" -> ModelLayers.PARROT;
			case "blaze" -> ModelLayers.BLAZE;
			case "phantom" -> ModelLayers.PHANTOM;
			default -> null;
		};
	}

	public static Identifier petTexture(String id) {
		return switch (id) {
			case "allay" -> vanilla("allay/allay");
			case "vex" -> vanilla("illager/vex");
			//#if MC >= 26.1
			case "bat" -> vanilla("bat/bat");
			//#else
			//$ case "bat" -> vanilla("bat");
			//#endif
			case "bee" -> vanilla("bee/bee");
			case "parrot" -> vanilla("parrot/parrot_red_blue");
			// both moved into folders of their own in 26.1
			//#if MC >= 26.1
			case "blaze" -> vanilla("blaze/blaze");
			case "phantom" -> vanilla("phantom/phantom");
			//#else
			//$ case "blaze" -> vanilla("blaze");
			//$ case "phantom" -> vanilla("phantom");
			//#endif
			default -> null;
		};
	}

	private static Identifier vanilla(String path) {
		return Identifier.withDefaultNamespace("textures/entity/" + path + ".png");
	}

	/** The player a render state is for, by its entity id. */
	private static UUID playerOf(AvatarRenderState state) {
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return null;
		Entity e = mc.level.getEntity(state.id);
		return e == null ? null : e.getUUID();
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
		String wing = Cosmetics.worn(id, "wings");
		// a real elytra is worn instead: it already has its own place on the back
		if (wing != null && !state.chestEquipment.is(Items.ELYTRA)) submitWings(pose, out, light, state, wing);
		String pet = Cosmetics.worn(id, "pet");
		if (pet != null && pets.containsKey(pet)) submitPet(pose, out, light, state, pets.get(pet));
	}

	private void submitWings(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, String wing) {
		HumanoidRenderState s = new HumanoidRenderState();
		s.isCrouching = state.isCrouching;
		if (state.isFallFlying) {
			s.elytraRotX = state.elytraRotX;
			s.elytraRotY = state.elytraRotY;
			s.elytraRotZ = state.elytraRotZ;
		} else {
			// half open, slowly beating, instead of the elytra's folded rest
			float beat = (float) Math.sin(state.ageInTicks * 0.09f);
			s.elytraRotX = 0.2618f + beat * 0.03f;
			s.elytraRotY = 0.08f;
			s.elytraRotZ = -0.62f - beat * 0.16f;
		}
		pose.pushPose();
		pose.translate(0, 0, 0.125f);
		Compat.submitModel(out, wings, s, pose, RenderTypes.entityTranslucent(Cosmetics.textureId("wings", wing)), light, OverlayTexture.NO_OVERLAY, state.outlineColor);
		pose.popPose();
	}

	@SuppressWarnings({"unchecked", "rawtypes"})
	private void submitPet(PoseStack pose, SubmitNodeCollector out, int light, AvatarRenderState state, Pet pet) {
		LivingEntityRenderState s = pet.state().get();
		float age = state.ageInTicks;
		s.ageInTicks = age;
		s.walkAnimationSpeed = 0;
		if (s instanceof ParrotRenderState p) {
			p.pose = ParrotModel.Pose.FLYING;
			p.flapAngle = (float) (Math.sin(age * 0.6f) + 1) * 0.6f;
		} else if (s instanceof BatRenderState b) {
			b.isResting = false;
			b.flyAnimationState.startIfStopped(0);
		}
		// floats by the shoulder, a little behind the head, bobbing up and down; the mob's feet are 1.5 down from its origin
		float bob = (float) Math.sin(age * 0.12f) * 0.06f;
		float scale = pet.scale();
		pose.pushPose();
		pose.translate(0.62f, (state.isCrouching ? 0.05f : -0.25f) + bob - 1.501f * scale, 0.2f);
		pose.scale(scale, scale, scale);
		// the phantom flies lying flat: tipped towards the viewer, or it is only a line
		if (s instanceof net.minecraft.client.renderer.entity.state.PhantomRenderState) {
			//#if MC >= 26.3
			pose.rotate(com.mojang.math.Axis.XP.rotationDegrees(-55));
			//#else
			//$ pose.mulPose(com.mojang.math.Axis.XP.rotationDegrees(-55));
			//#endif
		}
		EntityModel model = pet.model();
		Compat.submitModel(out, model, s, pose, model.renderType(pet.texture()), light, OverlayTexture.NO_OVERLAY, state.outlineColor);
		pose.popPose();
	}
}
