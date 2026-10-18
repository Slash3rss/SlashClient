// wings, pets and clothing are drawn from entity render states, which came in 1.21.2 (before: ClothingLayer)
//#if MC >= 1.21.2
package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.EntityModel;
import net.minecraft.client.model.ambient.BatModel;
import net.minecraft.client.model.animal.allay.AllayModel;
import net.minecraft.client.model.animal.parrot.ParrotModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
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
import net.minecraft.client.renderer.entity.state.EntityRenderState;
import net.minecraft.client.renderer.entity.state.HumanoidRenderState;
import net.minecraft.client.renderer.entity.state.LivingEntityRenderState;
import net.minecraft.client.renderer.entity.state.ParrotRenderState;
import net.minecraft.client.renderer.entity.state.VexRenderState;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.PlayerModelType;
import net.minecraft.world.item.Items;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * Wings on the back, a pet at the shoulder and clothing, for players who wear them. The wings
 * and pets are the game's own models: the wings are the elytra's (with our pictures, gently
 * opening and closing), the pets small copies of a few flying mobs; the clothing is ours ({@link Clothing}).
 */
public final class CosmeticLayer extends RenderLayer<AvatarRenderState, PlayerModel> {
	private final ElytraModel wings;
	private final Map<String, Pet> pets;
	/** Each clothing item as a model, for wide and slim arms ("id" and "id/slim"), made when first worn. */
	private final Map<String, ClothingModel> clothes = new HashMap<>();

	/**
	 * A clothing item: its boxes on the head, the body and the arms, posed like the player's own
	 * (copied into the state when it is submitted, since the model is drawn later).
	 */
	private static final class ClothingModel extends EntityModel<ClothingModel.Poses> {
		static final class Poses extends EntityRenderState {
			PartPose head, body, rightArm, leftArm;
		}

		private final ModelPart head, body, rightArm, leftArm;

		ClothingModel(ModelPart root) {
			super(root);
			head = root.getChild("head");
			body = root.getChild("body");
			rightArm = root.getChild("right_arm");
			leftArm = root.getChild("left_arm");
		}

		@Override
		public void setupAnim(Poses p) {
			super.setupAnim(p);
			head.loadPose(p.head);
			body.loadPose(p.body);
			rightArm.loadPose(p.rightArm);
			leftArm.loadPose(p.leftArm);
		}
	}

	/** A pet: its model, a fresh state for each frame (the model reads it later), its picture and size. */
	private record Pet(EntityModel<?> model, Supplier<LivingEntityRenderState> state, Identifier texture, float scale, float out) {
		Pet(EntityModel<?> model, Supplier<LivingEntityRenderState> state, Identifier texture, float scale) {
			this(model, state, texture, scale, 0f);
		}
	}

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
			"blaze", new Pet(new net.minecraft.client.model.monster.blaze.BlazeModel(context.bakeLayer(ModelLayers.BLAZE)), LivingEntityRenderState::new, petTexture("blaze"), 0.34f, 0.3f),
			"phantom", new Pet(new net.minecraft.client.model.monster.phantom.PhantomModel(context.bakeLayer(ModelLayers.PHANTOM)), net.minecraft.client.renderer.entity.state.PhantomRenderState::new, petTexture("phantom"), 0.55f),
			// the axolotl's and the fox's models got baby twins in 26.1: the adult one is ours
			//#if MC >= 26.1
			"axolotl", new Pet(new net.minecraft.client.model.animal.axolotl.AdultAxolotlModel(context.bakeLayer(ModelLayers.AXOLOTL)), net.minecraft.client.renderer.entity.state.AxolotlRenderState::new, petTexture("axolotl"), 0.7f),
			"fox", new Pet(new net.minecraft.client.model.animal.fox.AdultFoxModel(context.bakeLayer(ModelLayers.FOX)), net.minecraft.client.renderer.entity.state.FoxRenderState::new, petTexture("fox"), 0.55f),
			//#else
			//$ "axolotl", new Pet(new net.minecraft.client.model.animal.axolotl.AxolotlModel(context.bakeLayer(ModelLayers.AXOLOTL)), net.minecraft.client.renderer.entity.state.AxolotlRenderState::new, petTexture("axolotl"), 0.7f),
			//$ "fox", new Pet(new net.minecraft.client.model.animal.fox.FoxModel(context.bakeLayer(ModelLayers.FOX)), net.minecraft.client.renderer.entity.state.FoxRenderState::new, petTexture("fox"), 0.55f),
			//#endif
			"frog", new Pet(new net.minecraft.client.model.animal.frog.FrogModel(context.bakeLayer(ModelLayers.FROG)), net.minecraft.client.renderer.entity.state.FrogRenderState::new, petTexture("frog"), 0.8f));
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
			case "axolotl" -> ModelLayers.AXOLOTL;
			case "frog" -> ModelLayers.FROG;
			case "fox" -> ModelLayers.FOX;
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
			case "axolotl" -> vanilla("axolotl/axolotl_lucy");
			case "fox" -> vanilla("fox/fox");
			// renamed in 26.1 (temperate_frog → frog_temperate)
			//#if MC >= 26.1
			case "frog" -> vanilla("frog/frog_temperate");
			//#else
			//$ case "frog" -> vanilla("frog/temperate_frog");
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
		ClothingModel.Poses poses = null;
		for (String slot : Clothing.SLOTS) {
			String item = Cosmetics.worn(id, slot);
			if (item == null || Clothing.covered(slot, state.headEquipment, state.chestEquipment)) continue;
			if (poses == null) poses = poses(state);
			boolean slim = state.skin.model() == PlayerModelType.SLIM;
			ClothingModel model = clothes.computeIfAbsent(slim ? item + "/slim" : item, k -> new ClothingModel(Clothing.bake(item, slim)));
			Compat.submitModel(out, model, poses, pose, model.renderType(Clothing.texture(item)), light, OverlayTexture.NO_OVERLAY, state.outlineColor);
		}
	}

	/** Where the player's head, body and arms are in this frame (the player model posed for this player first). */
	private ClothingModel.Poses poses(AvatarRenderState state) {
		PlayerModel model = getParentModel();
		model.setupAnim(state);
		ClothingModel.Poses p = new ClothingModel.Poses();
		p.head = model.head.storePose();
		p.body = model.body.storePose();
		p.rightArm = model.rightArm.storePose();
		p.leftArm = model.leftArm.storePose();
		return p;
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
		// wide pets (the blaze's rods go round it) further out, so they stay off the head
		pose.translate(0.62f + pet.out(), (state.isCrouching ? 0.05f : -0.25f) + bob - 1.501f * scale, 0.2f);
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
//#endif
