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

import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Pets of our own (not the game's mobs), made from Blockbench models by scripts/make-model-pet.mjs:
 * their boxes (pet/<id>.json, placed like the game's mobs: the feet 24 pixels under the origin)
 * and their pictures, a frame a second (textures/pet/<id>_<frame>.png).
 */
public final class OurPets {
	private OurPets() {}

	public static final List<String> IDS = List.of("duszek_haze");
	private static final long FRAME_MS = 1000;

	private static JsonObject read(String id) {
		try (InputStream in = OurPets.class.getResourceAsStream("/assets/" + SlashHud.ID + "/pet/" + id + ".json")) {
			return in == null ? null : JsonParser.parseReader(new InputStreamReader(in, StandardCharsets.UTF_8)).getAsJsonObject();
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient pet {} could not be read", id, e);
			return null;
		}
	}

	private static final java.util.Map<String, Integer> frames = new java.util.concurrent.ConcurrentHashMap<>();

	/** A new model of the pet: a box for each part of the Blockbench model, turned about its own pivot; null if unknown. */
	public static ModelPart bake(String id) {
		JsonObject o = read(id);
		if (o == null) return null;
		frames.put(id, o.get("frames").getAsInt());
		MeshDefinition mesh = new MeshDefinition();
		int i = 0;
		for (JsonElement e : o.getAsJsonArray("boxes")) {
			JsonObject b = e.getAsJsonObject();
			float[] pivot = floats(b.getAsJsonArray("pivot")), rot = floats(b.getAsJsonArray("rotation"));
			float[] from = floats(b.getAsJsonArray("from")), size = floats(b.getAsJsonArray("size"));
			JsonArray uv = b.getAsJsonArray("uv");
			mesh.getRoot().addOrReplaceChild("box" + i++,
				CubeListBuilder.create().texOffs(uv.get(0).getAsInt(), uv.get(1).getAsInt()).addBox(from[0], from[1], from[2], size[0], size[1], size[2], CubeDeformation.NONE),
				PartPose.offsetAndRotation(pivot[0], pivot[1], pivot[2], rot[0], rot[1], rot[2]));
		}
		JsonArray tex = o.getAsJsonArray("texture");
		return LayerDefinition.create(mesh, tex.get(0).getAsInt(), tex.get(1).getAsInt()).bakeRoot();
	}

	private static float[] floats(JsonArray a) {
		return new float[] {a.get(0).getAsFloat(), a.get(1).getAsFloat(), a.get(2).getAsFloat()};
	}

	/** The pet's picture now (its current frame). */
	public static Identifier texture(String id) {
		int n = frames.computeIfAbsent(id, k -> {
			JsonObject o = read(k);
			return o == null ? 1 : o.get("frames").getAsInt();
		});
		return Cosmetics.textureId("pet", id + "_" + (System.currentTimeMillis() / FRAME_MS) % n);
	}

	/** The pet seen from the front, a little from above (64×64), for the menu. */
	public static Identifier icon(String id) {
		return Cosmetics.textureId("pet/icon", id);
	}
}
