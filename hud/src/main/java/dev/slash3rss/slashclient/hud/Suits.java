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
import java.util.UUID;

/**
 * SlashClient suits ("suit"): full-body costumes, a second layer of boxes a little bigger than the
 * body on the head, the body, both arms and both legs, so they turn, swing and crouch with them.
 * The boxes and pictures come from scripts/make-suits.mjs (suits.json, textures/suit), the same
 * the launcher's and the website's previews show (src/shared/suits.ts).
 *
 * What clashes with a suit:
 * - it hides the other cosmetics worn on the head or the body ({@link #hides}): the hat and the
 *   top, and any slot named in HIDDEN (face, ears and the like, which would stick through the hood);
 *   the cape, wings, elytra, pet and particles stay;
 * - real armour hides the part of the suit it covers ({@link #hiddenParts}): anything on the head
 *   the head's boxes, a chestplate the body's and the arms', leggings the legs', boots the boots;
 * - what the suit carries on its back (a backpack, a tail) gives way to a cape, wings, an elytra
 *   or a chestplate, which would go through it.
 */
public final class Suits {
	private Suits() {}

	/** Slots a worn suit hides: the clothing, and what other slots wear on the head or over the body. */
	public static final List<String> HIDDEN = List.of("hat", "top", "face", "ears", "mask", "glasses", "hair", "horns", "head", "neck");

	/** The parts of the player model a box can hang on, named as in the game's player model. */
	static final List<String> BONES = List.of("head", "body", "right_arm", "left_arm", "right_leg", "left_leg");
	/** What hides a box (bits of {@link #hiddenParts}). */
	public static final int HEAD = 1, CHEST = 2, LEGS = 4, FEET = 8, BACK = 16;

	private record Box(String bone, int part, float[] from, float[] size, float inflate, int u, int v) {}
	private record Item(List<Box> wide, List<Box> slim) {}

	private static final Map<String, Item> ITEMS = new LinkedHashMap<>();
	private static int texWidth = 128, texHeight = 64;
	public static final List<String> IDS;

	static {
		try (InputStream in = Suits.class.getResourceAsStream("/assets/" + SlashHud.ID + "/suits.json")) {
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			texWidth = root.getAsJsonArray("texture").get(0).getAsInt();
			texHeight = root.getAsJsonArray("texture").get(1).getAsInt();
			for (JsonElement e : root.getAsJsonArray("items")) {
				JsonObject o = e.getAsJsonObject();
				List<Box> wide = new ArrayList<>(), slim = new ArrayList<>();
				for (JsonElement be : o.getAsJsonArray("boxes")) {
					JsonObject b = be.getAsJsonObject();
					String bone = b.get("bone").getAsString();
					int part = switch (b.get("part").getAsString()) {
						case "head" -> HEAD;
						case "legs" -> LEGS;
						case "feet" -> FEET;
						case "back" -> BACK;
						default -> CHEST;
					};
					float inflate = b.get("inflate").getAsFloat();
					JsonArray uv = b.getAsJsonArray("uv");
					wide.add(new Box(bone, part, floats(b.getAsJsonArray("from")), floats(b.getAsJsonArray("size")), inflate, uv.get(0).getAsInt(), uv.get(1).getAsInt()));
					// on slim arms the sleeves are a pixel narrower, with a picture of their own
					if (b.has("slimUv")) {
						JsonArray su = b.getAsJsonArray("slimUv");
						slim.add(new Box(bone, part, floats(b.getAsJsonArray("slimFrom")), floats(b.getAsJsonArray("slimSize")), inflate, su.get(0).getAsInt(), su.get(1).getAsInt()));
					} else slim.add(wide.get(wide.size() - 1));
				}
				ITEMS.put(o.get("id").getAsString(), new Item(wide, slim));
			}
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient suits could not be read", e);
		}
		IDS = List.copyOf(ITEMS.keySet());
	}

	private static float[] floats(JsonArray a) {
		return new float[] {a.get(0).getAsFloat(), a.get(1).getAsFloat(), a.get(2).getAsFloat()};
	}

	/**
	 * A new model of a suit: a root with the six parts of the player model (at rest; posed like the
	 * player's before drawing), each with its boxes, a part of its own each ("box" and its number in
	 * the suit), so the ones armour covers can be hidden ({@link #showParts}).
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
				part.addOrReplaceChild("box" + i, CubeListBuilder.create().texOffs(b.u(), b.v())
					.addBox(b.from()[0], b.from()[1], b.from()[2], b.size()[0], b.size()[1], b.size()[2], new CubeDeformation(b.inflate())), PartPose.ZERO);
			}
		}
		return LayerDefinition.create(mesh, texWidth, texHeight).bakeRoot();
	}

	/** Shows the boxes of a baked suit except those of the `hidden` parts (bits: HEAD, CHEST…). */
	public static void showParts(ModelPart root, String id, int hidden) {
		Item item = ITEMS.get(id);
		if (item == null) return;
		for (int i = 0; i < item.wide().size(); i++) {
			Box b = item.wide().get(i);
			ModelPart bone = root.getChild(b.bone());
			if (bone.hasChild("box" + i)) bone.getChild("box" + i).visible = (hidden & b.part()) == 0;
		}
	}

	public static Identifier texture(String id) {
		return Cosmetics.textureId("suit", id);
	}

	/** The suit seen from the front, a little from above (64×64), for the menu. */
	public static Identifier icon(String id) {
		return Cosmetics.textureId("suit/icon", id);
	}

	/**
	 * Which parts of a suit are hidden (bits): those the real gear covers (anything on the head,
	 * a chestplate, leggings, boots), and its back when something else is worn there (`backTaken`: a
	 * cape or wings showing; an elytra or a chestplate count by themselves).
	 */
	public static int hiddenParts(ItemStack head, ItemStack chest, ItemStack legs, ItemStack feet, boolean backTaken) {
		int hidden = 0;
		if (!head.isEmpty()) hidden |= HEAD;
		if (chest.is(Items.ELYTRA)) hidden |= BACK;
		else if (!chest.isEmpty()) hidden |= CHEST | BACK;
		if (!legs.isEmpty()) hidden |= LEGS;
		if (!feet.isEmpty()) hidden |= FEET;
		if (backTaken) hidden |= BACK;
		return hidden;
	}

	/** Whether a player's suit hides what they wear in another slot (see HIDDEN). */
	public static boolean hides(UUID player, String slot) {
		return HIDDEN.contains(slot) && Cosmetics.worn(player, "suit") != null;
	}
}
