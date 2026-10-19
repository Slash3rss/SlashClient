package dev.slash3rss.slashclient.hud;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.minecraft.client.model.geom.ModelPart;
import net.minecraft.client.model.geom.PartPose;
import net.minecraft.client.model.geom.builders.CubeDeformation;
import net.minecraft.client.model.geom.builders.CubeListBuilder;
import net.minecraft.client.model.geom.builders.LayerDefinition;
import net.minecraft.client.model.geom.builders.MeshDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SlashClient clothing: hats ("hat"), tops ("top"), shoes ("shoes") and things on the hands
 * ("hands") worn over the skin, made of boxes fixed to the head, the body, the arms and the legs,
 * so they turn, swing and crouch with them. The boxes and their
 * pictures come from scripts/make-clothing.mjs (clothing.json, textures/clothing), the same the
 * launcher's and the website's previews show.
 */
public final class Clothing {
	private Clothing() {}

	public static final List<String> SLOTS = List.of("hat", "top", "shoes", "hands", "face", "ears");
	/** The parts of the player model a box can be fixed to, named as in the game's player model. */
	public static final List<String> BONES = List.of("head", "body", "right_arm", "left_arm", "right_leg", "left_leg");

	/**
	 * `pivot`: a box that turns on a point of its own (`rotate`, radians), wiggled now and then by
	 * `twitch` (ears); `hats`: the only hats it shows with (null: all), see {@link Headwear}.
	 */
	private record Box(String bone, float[] from, float[] size, float inflate, int u, int v,
		float[] pivot, float[] rotate, Headwear.Twitch twitch, List<String> hats) {}
	private record Item(String slot, List<Box> wide, List<Box> slim, boolean underHelmet) {}

	private static final Map<String, Item> ITEMS = new LinkedHashMap<>();
	private static int texWidth = 64, texHeight = 64;
	static final List<String> HATS, TOPS, SHOES, HANDS, FACE, EARS;

	static {
		try (InputStream in = Clothing.class.getResourceAsStream("/assets/" + SlashHud.ID + "/clothing.json")) {
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			texWidth = root.getAsJsonArray("texture").get(0).getAsInt();
			texHeight = root.getAsJsonArray("texture").get(1).getAsInt();
			for (JsonElement e : root.getAsJsonArray("items")) {
				JsonObject o = e.getAsJsonObject();
				List<Box> wide = new ArrayList<>(), slim = new ArrayList<>();
				for (JsonElement be : o.getAsJsonArray("boxes")) {
					JsonObject b = be.getAsJsonObject();
					String bone = b.get("bone").getAsString();
					float inflate = b.get("inflate").getAsFloat();
					int u = b.getAsJsonArray("uv").get(0).getAsInt(), v = b.getAsJsonArray("uv").get(1).getAsInt();
					float[] pivot = b.has("pivot") ? floats(b.getAsJsonArray("pivot")) : null;
					float[] rotate = b.has("rotate") ? floats(b.getAsJsonArray("rotate")) : new float[3];
					for (int i = 0; i < 3; i++) rotate[i] = (float) Math.toRadians(rotate[i]);
					Headwear.Twitch twitch = b.has("twitch") ? Headwear.Twitch.of(b.getAsJsonObject("twitch")) : null;
					List<String> hats = null;
					if (b.has("hats")) {
						hats = new ArrayList<>();
						for (JsonElement h : b.getAsJsonArray("hats")) hats.add(h.getAsString());
					}
					Box box = new Box(bone, floats(b.getAsJsonArray("from")), floats(b.getAsJsonArray("size")), inflate, u, v, pivot, rotate, twitch, hats);
					wide.add(box);
					// on slim arms the sleeves are a pixel narrower
					slim.add(b.has("slimFrom") ? new Box(bone, floats(b.getAsJsonArray("slimFrom")), floats(b.getAsJsonArray("slimSize")), inflate, u, v, pivot, rotate, twitch, hats) : box);
				}
				ITEMS.put(o.get("id").getAsString(), new Item(o.get("slot").getAsString(), wide, slim, o.has("underHelmet") && o.get("underHelmet").getAsBoolean()));
			}
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient clothing could not be read", e);
		}
		HATS = ids("hat");
		TOPS = ids("top");
		SHOES = ids("shoes");
		HANDS = ids("hands");
		FACE = ids("face");
		EARS = ids("ears");
	}

	private static List<String> ids(String slot) {
		return ITEMS.entrySet().stream().filter(e -> e.getValue().slot().equals(slot)).map(Map.Entry::getKey).toList();
	}

	private static float[] floats(JsonArray a) {
		return new float[] {a.get(0).getAsFloat(), a.get(1).getAsFloat(), a.get(2).getAsFloat()};
	}

	/**
	 * A new model of an item: a root with the head, the body and both arms (named as in the
	 * player model, at rest; posed like the player's before drawing), each with its boxes, a part
	 * of its own each ("box" and its number in the item), so a few can be hidden.
	 */
	public static ModelPart bake(String id, boolean slim) {
		Item item = ITEMS.get(id);
		MeshDefinition mesh = new MeshDefinition();
		for (String bone : BONES) {
			var part = mesh.getRoot().addOrReplaceChild(bone, CubeListBuilder.create(), PartPose.ZERO);
			if (item == null) continue;
			List<Box> boxes = slim ? item.slim() : item.wide();
			for (int i = 0; i < boxes.size(); i++) {
				Box b = boxes.get(i);
				if (!b.bone().equals(bone)) continue;
				// a box with a pivot of its own: the part stands there, turned, the box drawn from it
				float[] p = b.pivot() != null ? b.pivot() : new float[3];
				PartPose pose = b.pivot() != null ? PartPose.offsetAndRotation(p[0], p[1], p[2], b.rotate()[0], b.rotate()[1], b.rotate()[2]) : PartPose.ZERO;
				part.addOrReplaceChild("box" + i, CubeListBuilder.create().texOffs(b.u(), b.v())
					.addBox(b.from()[0] - p[0], b.from()[1] - p[1], b.from()[2] - p[2], b.size()[0], b.size()[1], b.size()[2], new CubeDeformation(b.inflate())), pose);
			}
		}
		return LayerDefinition.create(mesh, texWidth, texHeight).bakeRoot();
	}

	public static Identifier texture(String id) {
		return Cosmetics.textureId("clothing", id);
	}

	/** The item seen from the front, a little from above (64×64), for the menu. */
	public static Identifier icon(String id) {
		return Cosmetics.textureId("clothing/icon", id);
	}

	/**
	 * Whether real gear hides it: a hat under anything worn on the head (a helmet, a pumpkin, a
	 * skull), a top under a chestplate (an elytra leaves it), shoes under boots; nothing hides the hands' items.
	 */
	public static boolean covered(String slot, ItemStack head, ItemStack chest, ItemStack feet) {
		return switch (slot) {
			case "hat" -> !head.isEmpty();
			case "top" -> !chest.isEmpty() && !chest.is(Items.ELYTRA);
			case "shoes" -> !feet.isEmpty();
			default -> false;
		};
	}

	/** As {@link #covered(String, ItemStack, ItemStack, ItemStack)} for a hat or a top (nothing on the feet matters to them). */
	public static boolean covered(String slot, ItemStack head, ItemStack chest) {
		return covered(slot, head, chest, ItemStack.EMPTY);
	}

	/** As {@link #covered(String, ItemStack, ItemStack, ItemStack)}, for this item: the face's glasses stay on under a helmet, masks and ears hide. */
	public static boolean covered(String slot, String id, ItemStack head, ItemStack chest, ItemStack feet) {
		if (slot.equals("face") || slot.equals("ears")) {
			Item item = ITEMS.get(id);
			return !head.isEmpty() && (item == null || !item.underHelmet());
		}
		return covered(slot, head, chest, feet);
	}

	/**
	 * Poses an item's own boxes in a model from {@link #bake} (after its head, body and arms are
	 * posed): boxes that a worn `hat` would go through hide, ears twitch (`seconds`: any clock).
	 */
	public static void animate(ModelPart root, String id, String hat, float seconds) {
		Item item = ITEMS.get(id);
		if (item == null || !(item.slot().equals("face") || item.slot().equals("ears"))) return;
		List<Box> boxes = item.wide();
		for (int i = 0; i < boxes.size(); i++) {
			Box b = boxes.get(i);
			ModelPart part = root.getChild(b.bone()).getChild("box" + i);
			part.visible = Headwear.shownWith(b.hats(), hat);
			if (b.twitch() == null) continue;
			float a = b.twitch().angle(seconds);
			part.xRot = b.rotate()[0] + (b.twitch().axisX() ? a : 0);
			part.zRot = b.rotate()[2] + (b.twitch().axisX() ? 0 : a);
		}
	}
}
