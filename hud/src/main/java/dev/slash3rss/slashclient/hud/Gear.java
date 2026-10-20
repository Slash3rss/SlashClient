package dev.slash3rss.slashclient.hud;

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
 * SlashClient back items ("back": a backpack, a quiver, a katana…) and tails ("tail"), made of
 * boxes fixed to the body, so they turn, lean and crouch with it; a tail's pieces sway slowly
 * standing and swing with the steps walking. The boxes and their pictures come from
 * scripts/make-gear.mjs (gear.json, textures/gear), the same the launcher's and the website's
 * previews show (src/shared/gear.ts, whose tailAngles this mirrors).
 *
 * With the rest of the back: a back item takes the place of the cape and the wings (neither is
 * drawn while it shows) and hides under a real elytra; a tail hangs lower under a cape, which
 * falls over it.
 */
public final class Gear {
	private Gear() {}

	public static final List<String> SLOTS = List.of("back", "tail");

	private record Box(float[] from, float[] size, float inflate, int u, int v, float[] pivot, float[] rot, boolean flame) {}
	private record Extra(float[] from, float[] size, int u, int v) {}
	private record Segment(float[] size, int u, int v, List<Extra> extras) {}
	private record Chain(float spread, float lift, List<Segment> segments) {}
	private record Item(String slot, List<Box> boxes, float droop, float curl, List<Chain> chains) {}

	private static final Map<String, Item> ITEMS = new LinkedHashMap<>();
	private static int texWidth = 64, texHeight = 64;
	private static float[] tailBase = {0, 10.75f, 2.1f};
	private static float overlap = 0.8f;
	static final List<String> BACKS, TAILS;

	static {
		try (InputStream in = Gear.class.getResourceAsStream("/assets/" + SlashHud.ID + "/gear.json")) {
			JsonObject root = JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
			texWidth = root.getAsJsonArray("texture").get(0).getAsInt();
			texHeight = root.getAsJsonArray("texture").get(1).getAsInt();
			tailBase = floats(root.getAsJsonArray("tailBase"));
			overlap = root.get("overlap").getAsFloat();
			for (JsonElement e : root.getAsJsonArray("items")) {
				JsonObject o = e.getAsJsonObject();
				String slot = o.get("slot").getAsString();
				List<Box> boxes = new ArrayList<>();
				List<Chain> chains = new ArrayList<>();
				if (o.has("boxes")) for (JsonElement be : o.getAsJsonArray("boxes")) {
					JsonObject b = be.getAsJsonObject();
					int[] uv = uv(b);
					boxes.add(new Box(floats(b.getAsJsonArray("from")), floats(b.getAsJsonArray("size")), b.get("inflate").getAsFloat(), uv[0], uv[1],
						floats(b.getAsJsonArray("pivot")), floats(b.getAsJsonArray("rot")), b.has("flame") && b.get("flame").getAsBoolean()));
				}
				if (o.has("chains")) for (JsonElement ce : o.getAsJsonArray("chains")) {
					JsonObject c = ce.getAsJsonObject();
					List<Segment> segments = new ArrayList<>();
					for (JsonElement se : c.getAsJsonArray("segments")) {
						JsonObject s = se.getAsJsonObject();
						List<Extra> extras = new ArrayList<>();
						for (JsonElement xe : s.getAsJsonArray("extras")) {
							JsonObject x = xe.getAsJsonObject();
							int[] uv = uv(x);
							extras.add(new Extra(floats(x.getAsJsonArray("from")), floats(x.getAsJsonArray("size")), uv[0], uv[1]));
						}
						int[] uv = uv(s);
						segments.add(new Segment(floats(s.getAsJsonArray("size")), uv[0], uv[1], extras));
					}
					chains.add(new Chain(c.get("spread").getAsFloat(), c.get("lift").getAsFloat(), segments));
				}
				ITEMS.put(o.get("id").getAsString(), new Item(slot, boxes, o.has("droop") ? o.get("droop").getAsFloat() : 0,
					o.has("curl") ? o.get("curl").getAsFloat() : 0, chains));
			}
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient back items and tails could not be read", e);
		}
		BACKS = ids("back");
		TAILS = ids("tail");
	}

	private static List<String> ids(String slot) {
		return ITEMS.entrySet().stream().filter(e -> e.getValue().slot().equals(slot)).map(Map.Entry::getKey).toList();
	}

	private static float[] floats(JsonArray a) {
		return new float[] {a.get(0).getAsFloat(), a.get(1).getAsFloat(), a.get(2).getAsFloat()};
	}

	private static int[] uv(JsonObject o) {
		return new int[] {o.getAsJsonArray("uv").get(0).getAsInt(), o.getAsJsonArray("uv").get(1).getAsInt()};
	}

	/**
	 * An item as a model: a root with the body (named as in the player model, posed like the
	 * player's before drawing), a part in it that sets the item off the back for armour ("fit"),
	 * and the item's parts in that; a tail's pieces each in the one before, and the flames, kept
	 * to be moved each frame.
	 */
	public static final class Rig {
		public final ModelPart root, body;
		final ModelPart fit;
		final ModelPart[][] segments;
		final ModelPart[] flames;
		final Item item;

		private Rig(ModelPart root, Item item) {
			this.root = root;
			this.item = item;
			body = root.getChild("body");
			fit = body.getChild("fit");
			if (item == null) {
				segments = new ModelPart[0][];
				flames = new ModelPart[0];
				return;
			}
			segments = new ModelPart[item.chains().size()][];
			for (int c = 0; c < segments.length; c++) {
				int n = item.chains().get(c).segments().size();
				segments[c] = new ModelPart[n];
				ModelPart p = fit.getChild("chain" + c);
				for (int i = 0; i < n; i++) {
					segments[c][i] = p;
					if (i + 1 < n) p = p.getChild("next");
				}
			}
			List<ModelPart> f = new ArrayList<>();
			for (int i = 0; i < item.boxes().size(); i++) if (item.boxes().get(i).flame()) f.add(fit.getChild("box" + i));
			flames = f.toArray(new ModelPart[0]);
		}
	}

	public static Rig bake(String id) {
		Item item = ITEMS.get(id);
		MeshDefinition mesh = new MeshDefinition();
		PartDefinition fit = mesh.getRoot().addOrReplaceChild("body", CubeListBuilder.create(), PartPose.ZERO)
			.addOrReplaceChild("fit", CubeListBuilder.create(), PartPose.ZERO);
		if (item != null) {
			for (int i = 0; i < item.boxes().size(); i++) {
				Box b = item.boxes().get(i);
				fit.addOrReplaceChild("box" + i, CubeListBuilder.create().texOffs(b.u(), b.v())
						.addBox(b.from()[0], b.from()[1], b.from()[2], b.size()[0], b.size()[1], b.size()[2], new CubeDeformation(b.inflate())),
					PartPose.offsetAndRotation(b.pivot()[0], b.pivot()[1], b.pivot()[2], b.rot()[0], b.rot()[1], b.rot()[2]));
			}
			for (int c = 0; c < item.chains().size(); c++) {
				PartDefinition parent = fit;
				String name = "chain" + c;
				float[] at = tailBase;
				for (Segment s : item.chains().get(c).segments()) {
					float w = s.size()[0], h = s.size()[1], len = s.size()[2];
					CubeListBuilder cubes = CubeListBuilder.create().texOffs(s.u(), s.v()).addBox(-w / 2, -h / 2, -overlap / 2, w, h, len);
					for (Extra x : s.extras()) cubes.texOffs(x.u(), x.v()).addBox(x.from()[0], x.from()[1], x.from()[2], x.size()[0], x.size()[1], x.size()[2]);
					parent = parent.addOrReplaceChild(name, cubes, PartPose.offset(at[0], at[1], at[2]));
					name = "next";
					at = new float[] {0, 0, len - overlap};
				}
			}
		}
		return new Rig(LayerDefinition.create(mesh, texWidth, texHeight).bakeRoot(), item);
	}

	/**
	 * Moves what moves: a tail's pieces and a jet's flames. `time` in seconds, `walk` the walk
	 * animation's speed (0 standing … 1 running), `phase` where the legs are in their swing,
	 * `caped` when a cape hangs over the tail; `fit` how far it stands off the back (armour).
	 */
	public static void animate(Rig rig, float time, float walk, float phase, boolean caped, float fit) {
		rig.fit.z = fit;
		if (rig.item == null) return;
		for (int c = 0; c < rig.segments.length; c++) {
			for (int i = 0; i < rig.segments[c].length; i++) {
				float[] a = tailAngles(rig.item, c, i, time, walk, phase, caped);
				rig.segments[c][i].xRot = a[0];
				rig.segments[c][i].yRot = a[1];
			}
		}
		for (int i = 0; i < rig.flames.length; i++) rig.flames[i].yScale = flameScale(time, i);
	}

	/** As src/shared/gear.ts's tailAngles: [tilt up, turn to the side] of a tail's piece. */
	private static float[] tailAngles(Item item, int chain, int segment, float time, float walk, float phase, boolean caped) {
		Chain c = item.chains().get(chain);
		float w = Math.max(0, Math.min(1, walk));
		double sway = 0.11 * Math.sin(time * 1.7 - segment * 0.55 + chain * 1.3) + w * 0.32 * Math.sin(phase - segment * 0.7);
		double pitch = segment == 0 ? item.droop() + c.lift() + (caped ? -0.6 : 0) + w * 0.45 : item.curl() * (1 - 0.35 * w);
		pitch += 0.04 * Math.sin(time * 1.1 + segment * 0.4) + w * 0.07 * Math.sin(2 * phase - segment * 0.5);
		double yaw = (segment == 0 ? c.spread() : 0) + sway * (segment == 0 ? 0.6 : 0.3);
		return new float[] {(float) pitch, (float) yaw};
	}

	/** As src/shared/gear.ts's flameScale: how long a jet's flame is now. */
	private static float flameScale(float time, int index) {
		return (float) (0.75 + 0.2 * Math.sin(time * 23 + index * 2.1) + 0.12 * Math.sin(time * 37 + index));
	}

	public static Identifier texture(String id) {
		return Cosmetics.textureId("gear", id);
	}

	/** The item seen from behind (a tail from behind and the side), a little from above (64×64), for the menu. */
	public static Identifier icon(String id) {
		return Cosmetics.textureId("gear/icon", id);
	}

	/** Whether a back item shows: a real elytra takes the back (and the item would be inside it). */
	public static boolean backShown(ItemStack chest) {
		return !chest.is(Items.ELYTRA);
	}

	/** How far an item stands off the body for the armour worn: over a chestplate, a tail also over leggings. */
	public static float fit(String slot, ItemStack chest, ItemStack legs) {
		boolean plate = !chest.isEmpty() && !chest.is(Items.ELYTRA);
		if (slot.equals("back")) return plate ? 1f : 0f;
		return plate ? 1f : legs.isEmpty() ? 0f : 0.6f;
	}

	/** As {@link #fit(String, ItemStack, ItemStack)}, over a suit (Suits) too: its body and legs stand about 0.6 off the skin. */
	public static float fit(String slot, ItemStack chest, ItemStack legs, boolean suited) {
		float fit = fit(slot, chest, legs);
		return suited ? Math.max(fit, 0.6f) : fit;
	}

	/** Whether a player we see wears a real elytra (for the versions that ask for the cape by player id). */
	static boolean wearsElytra(UUID id) {
		var level = Minecraft.getInstance().level;
		var player = level == null ? null : level.getPlayerByUUID(id);
		return player != null && OwnArmor.shown(player, net.minecraft.world.entity.EquipmentSlot.CHEST).is(Items.ELYTRA);
	}
}
