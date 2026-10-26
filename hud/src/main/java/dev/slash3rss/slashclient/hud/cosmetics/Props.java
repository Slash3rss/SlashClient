package dev.slash3rss.slashclient.hud.cosmetics;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.Minecraft;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.client.model.geom.builders.PartDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.HumanoidArm;
import net.minecraft.world.entity.player.Player;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Badges;

/**
 * SlashClient props ("prop" slot): a wheelbarrow the player pushes in front of them, the wheel on
 * the ground, the grips in both hands (the arms posed for it, PropArmsMixin), the wheel turning
 * with the distance walked. The parts and their pictures come from scripts/make-props.mjs
 * (props.json, textures/prop), the same the launcher's and the website's previews show.
 *
 * When it shows (the same rule everywhere, see {@link #shown}): only on a player who stands or
 * walks on their feet with their hands free. Anything held in the main hand, or using an item
 * (eating, drinking, blocking with a shield, drawing a bow), hides it and the arms move as
 * usual; so do swimming, flying, gliding with an elytra, riding and sleeping. A punch with the
 * empty hand keeps it: the punching arm swings as usual, the other hand keeps its grip. An item
 * in the off hand stays in that hand on the grip. In first person nothing is drawn (the player
 * is not), and the first person hands are the game's own.
 */
public final class Props {
	private Props() {}

	/** The prop's parts as read: a name, a pose (x, y, z, xRot, yRot, zRot) and boxes, with children. */
	private record Box(float[] from, float[] size, float inflate, int u, int v) {}
	private record Part(String name, float[] pose, List<Box> boxes, List<Part> children) {}

	private static final Map<String, Part> ITEMS = new LinkedHashMap<>();
	private static int texWidth = 128, texHeight = 64;
	/** See src/shared/props.ts: the wheel's radius, the grip from the axle (y, z), the arms' hold and the hand down the arm. */
	static float wheelRadius = 4, gripY = -3, gripZ = 22, hold = -0.5f, holdCrouching = -0.75f, hand = 10;
	public static final List<String> IDS;

	static {
		try (InputStream in = Props.class.getResourceAsStream("/assets/" + SlashHud.ID + "/props.json")) {
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			texWidth = root.getAsJsonArray("texture").get(0).getAsInt();
			texHeight = root.getAsJsonArray("texture").get(1).getAsInt();
			wheelRadius = root.get("wheelRadius").getAsFloat();
			gripY = root.getAsJsonArray("grip").get(0).getAsFloat();
			gripZ = root.getAsJsonArray("grip").get(1).getAsFloat();
			hold = root.get("hold").getAsFloat();
			holdCrouching = root.get("holdCrouching").getAsFloat();
			hand = root.get("hand").getAsFloat();
			for (JsonElement e : root.getAsJsonArray("items")) {
				JsonObject o = e.getAsJsonObject();
				ITEMS.put(o.get("id").getAsString(), part(o.getAsJsonObject("model")));
			}
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient props could not be read", e);
		}
		IDS = List.copyOf(ITEMS.keySet());
	}

	private static Part part(JsonObject o) {
		List<Box> boxes = new ArrayList<>();
		for (JsonElement be : o.getAsJsonArray("boxes")) {
			JsonObject b = be.getAsJsonObject();
			boxes.add(new Box(floats(b.getAsJsonArray("from")), floats(b.getAsJsonArray("size")), b.get("inflate").getAsFloat(),
				b.getAsJsonArray("uv").get(0).getAsInt(), b.getAsJsonArray("uv").get(1).getAsInt()));
		}
		List<Part> children = new ArrayList<>();
		for (JsonElement c : o.getAsJsonArray("children")) children.add(part(c.getAsJsonObject()));
		return new Part(o.get("name").getAsString(), floats(o.getAsJsonArray("pose")), boxes, children);
	}

	private static float[] floats(JsonArray a) {
		float[] f = new float[a.size()];
		for (int i = 0; i < f.length; i++) f[i] = a.get(i).getAsFloat();
		return f;
	}

	/** A new model of a prop: a root holding the part "prop" (placed with {@link #place} before drawing), its wheel named "wheel". */
	public static ModelPart bake(String id) {
		MeshDefinition mesh = new MeshDefinition();
		Part p = ITEMS.get(id);
		if (p != null) add(mesh.getRoot(), p);
		return LayerDefinition.create(mesh, texWidth, texHeight).bakeRoot();
	}

	private static void add(PartDefinition parent, Part p) {
		CubeListBuilder cubes = CubeListBuilder.create();
		for (Box b : p.boxes()) {
			cubes.texOffs(b.u(), b.v()).addBox(b.from()[0], b.from()[1], b.from()[2], b.size()[0], b.size()[1], b.size()[2], new CubeDeformation(b.inflate()));
		}
		float[] o = p.pose();
		PartDefinition here = parent.addOrReplaceChild(p.name(), cubes, PartPose.offsetAndRotation(o[0], o[1], o[2], o[3], o[4], o[5]));
		for (Part c : p.children()) add(here, c);
	}

	public static Identifier texture(String id) {
		return Cosmetics.textureId("prop", id);
	}

	/** The prop seen from its side (64×64), for the menu. */
	public static Identifier icon(String id) {
		return Cosmetics.textureId("prop/icon", id);
	}

	/**
	 * Puts the prop in front of the player model: the axle on the ground (`ground`: 24 standing,
	 * lower in the model's own space when crouching), tilted so the grips are in the hands of arms
	 * whose shoulders are at (`armY`, `armZ`), turned forwards by `hold`; the wheel turned by `walked`
	 * (the walk animation's position: four a block).
	 */
	public static void place(ModelPart root, float armY, float armZ, float hold, float ground, float walked) {
		if (!root.hasChild("prop")) return;
		ModelPart prop = root.getChild("prop");
		float handY = armY + hand * (float) Math.cos(hold), handZ = armZ + hand * (float) Math.sin(hold);
		float axleY = ground - wheelRadius;
		float r = (float) Math.hypot(gripY, gripZ), phi = (float) Math.atan2(gripZ, -gripY);
		float pitch = phi - (float) Math.acos(Math.max(-1, Math.min(1, -(handY - axleY) / r)));
		float along = gripY * (float) Math.sin(pitch) + gripZ * (float) Math.cos(pitch);
		prop.x = 0;
		prop.y = axleY;
		prop.z = handZ - along;
		prop.xRot = pitch;
		prop.yRot = prop.zRot = 0;
		// rolling forwards without slipping: a block (16 pixels) walked is 16 / radius of a turn
		if (prop.hasChild("wheel")) prop.getChild("wheel").xRot = walked / 4f * 16f / wheelRadius;
	}

	/** The arms' forward turn while holding the grips. */
	public static float hold(boolean crouching) {
		return crouching ? holdCrouching : hold;
	}

	/** The prop `p` shows now, or null (the rule in the class comment). */
	public static String shown(Entity e) {
		if (!(e instanceof Player p) || !Badges.enabled() || p.isSpectator() || p.isInvisible()) return null;
		String item = Cosmetics.worn(p.getUUID(), "prop");
		if (item == null || !ITEMS.containsKey(item)) return null;
		if (p.isSleeping() || p.isPassenger() || p.isFallFlying() || p.isSwimming() || p.isVisuallySwimming() || p.getAbilities().flying) return null;
		if (!p.getMainHandItem().isEmpty() || p.isUsingItem()) return null;
		return item;
	}

	/** The prop of the player with this entity id (a render state's), or null. */
	public static String shown(int entityId) {
		Minecraft mc = Minecraft.getInstance();
		return mc.level == null ? null : shown(mc.level.getEntity(entityId));
	}

	/**
	 * Poses the arms of a player model that holds a prop: both forwards and down to the grips,
	 * instead of swinging while walking; an arm punching keeps its swing.
	 */
	public static void holdArms(Entity e, boolean crouching, ModelPart rightArm, ModelPart leftArm) {
		if (shown(e) == null) return;
		Player p = (Player) e;
		HumanoidArm punching = null;
		//#if MC >= 26.3
		if (p.isSwinging()) punching = p.getMainArm();
		//#else
		//$ if (p.swinging) punching = p.swingingArm == InteractionHand.MAIN_HAND ? p.getMainArm() : p.getMainArm().getOpposite();
		//#endif
		float x = hold(crouching);
		if (punching != HumanoidArm.RIGHT) {
			rightArm.xRot = x;
			rightArm.yRot = 0;
		}
		if (punching != HumanoidArm.LEFT) {
			leftArm.xRot = x;
			leftArm.yRot = 0;
		}
	}
}
