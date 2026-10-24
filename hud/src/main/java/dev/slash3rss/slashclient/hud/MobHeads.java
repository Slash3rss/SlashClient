package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Mob faces for the maps (the minimap, the full map, the dungeon map), cut from the very texture
 * the game draws the mob with: its variant (a cold cow, a tabby cat, a villager's biome…) and
 * whatever a resource pack puts there. Each face is the front of the model's head boxes as the
 * game builds them (the same texOffs/addBox numbers), so a pig gets its snout and a villager its
 * nose. Coordinates are in pixels of the texture's usual size; a pack's larger texture with the
 * same layout is read at its own size. Mobs not listed here (and other mods' mobs) have no face.
 */
final class MobHeads {
	private MobHeads() {}

	/** The front of one box: where it is in the texture (u, v, w, h) and where it sits seen from the front (x, y; z: how far back). */
	private record Part(float u, float v, int w, int h, float x, float y, float z) {}

	/** A mob's face: the texture's usual width and height, its parts back to front and their outline. */
	private record Face(int texW, int texH, Part[] parts, float x0, float y0, float w, float h) {}

	/** A face ready to draw: the mob's texture and its real size. */
	record Head(Identifier texture, Face face, int texW, int texH) {
		/** How wide the face is against its height (a villager's long head is narrower than tall). */
		float aspect() {
			return face.w() / face.h();
		}
	}

	/** Builds a face from the model's own numbers: texOffs(u, v) then addBox(x, y, z, w, h, d). */
	private static final class Builder {
		final int texW, texH;
		final List<Part> parts = new ArrayList<>();

		Builder(int texW, int texH) {
			this.texW = texW;
			this.texH = texH;
		}

		/** A box's front: in the texture it starts `d` to the right of and below the texOffs corner. */
		Builder box(int u, int v, float x, float y, float z, int w, int h, int d) {
			parts.add(new Part(u + d, v + d, w, h, x, y, z));
			return this;
		}

		Face done() {
			Part[] all = parts.toArray(new Part[0]);
			// the farthest first, so what sticks out (a snout, a nose) lies on top
			Arrays.sort(all, (a, b) -> Float.compare(b.z(), a.z()));
			float x0 = Float.MAX_VALUE, y0 = Float.MAX_VALUE, x1 = -Float.MAX_VALUE, y1 = -Float.MAX_VALUE;
			for (Part p : all) {
				x0 = Math.min(x0, p.x());
				y0 = Math.min(y0, p.y());
				x1 = Math.max(x1, p.x() + p.w());
				y1 = Math.max(y1, p.y() + p.h());
			}
			return new Face(texW, texH, all, x0, y0, x1 - x0, y1 - y0);
		}
	}

	private static Builder tex(int w, int h) {
		return new Builder(w, h);
	}

	private static final Map<String, Face> FACES = new HashMap<>();

	private static void put(Face face, String... ids) {
		for (String id : ids) FACES.put(id, face);
	}

	static {
		// humanoids: the head and, for the zombies, the hat layer over it
		put(tex(64, 64).box(0, 0, -4, -8, -4, 8, 8, 8).box(32, 0, -4, -8, -4.5f, 8, 8, 8).done(), "zombie", "husk", "drowned");
		put(tex(64, 32).box(0, 0, -4, -8, -4, 8, 8, 8).done(), "skeleton", "stray", "wither_skeleton", "bogged", "parched");
		put(tex(64, 32).box(0, 0, -4, -8, -4, 8, 8, 8).done(), "creeper", "enderman", "blaze");
		put(tex(64, 32).box(32, 4, -4, -4, -8, 8, 8, 8).done(), "spider", "cave_spider");
		// a slime's eyes and mouth are inside its jelly: on a map they are drawn over it, to be seen
		put(tex(64, 32).box(0, 0, -4, 16, 4, 8, 8, 8).box(0, 16, -3, 17, -3, 6, 6, 6).box(32, 0, -3.25f, 18, -3.5f, 2, 2, 2).box(32, 4, 1.25f, 18, -3.5f, 2, 2, 2)
			.box(32, 8, 0, 21, -3.5f, 1, 1, 1).done(), "slime");
		// a magma cube is eight slices, each its own strip of the texture
		Builder magma = tex(64, 64);
		for (int i = 0; i < 8; i++) {
			//#if MC >= 1.21.2
			int u = i > 3 ? 32 : 0, v = i == 0 ? 0 : i < 4 ? 9 * i : 9 * i - 36;
			//#else
			//$ int u = i == 2 || i == 3 ? 24 : 0, v = i == 2 ? 10 : i == 3 ? 19 : i;
			//#endif
			magma.box(u, v, -4, 16 + i, -4, 8, 1, 8);
		}
		put(magma.done(), "magma_cube");
		put(tex(64, 32).box(0, 0, -8, -8, -8, 16, 16, 16).done(), "ghast");
		put(tex(64, 64).box(0, 0, -4, -2, -5, 7, 3, 5).done(), "phantom");
		put(tex(64, 64).box(0, 0, -6, 10, -8, 12, 12, 16).box(8, 0, -1, 15, -8.25f, 2, 2, 1).done(), "guardian", "elder_guardian");
		put(tex(128, 128).box(0, 32, -8, -16, -5, 16, 16, 10).done(), "warden");
		put(tex(64, 64).box(0, 0, -4, -4, -4, 8, 8, 8).done(), "wither");
		put(tex(32, 32).box(0, 0, -2.5f, -5, -2.5f, 5, 5, 5).done(), "vex");
		// villagers and illagers: a long head with the nose hanging over the chin
		put(tex(64, 64).box(0, 0, -4, -10, -4, 8, 10, 8).box(24, 0, -1, -3, -6, 2, 4, 2).done(),
			"villager", "wandering_trader", "zombie_villager", "pillager", "vindicator", "evoker", "illusioner");
		put(tex(64, 128).box(0, 0, -4, -10, -4, 8, 10, 8).box(24, 0, -1, -3, -6, 2, 4, 2).done(), "witch");
		put(tex(64, 64).box(0, 0, -5, -8, -4, 10, 8, 8).box(31, 1, -2, -4, -5, 4, 4, 1).box(2, 4, 2, -2, -5, 1, 2, 1).box(2, 0, -3, -2, -5, 1, 2, 1).done(),
			"piglin", "piglin_brute", "zombified_piglin");
		put(tex(128, 128).box(0, 0, -4, -12, -5.5f, 8, 10, 8).box(24, 0, -1, -5, -7.5f, 2, 4, 2).done(), "iron_golem");
		put(tex(64, 64).box(0, 0, -4, -8, -4, 8, 8, 8).done(), "snow_golem");

		// animals
		//#if MC >= 1.21.5
		// the cow of 1.21.5 has a muzzle of its own
		put(tex(64, 64).box(0, 0, -4, -4, -6, 8, 8, 6).box(1, 33, -3, 1, -7, 6, 3, 1).box(22, 0, -5, -5, -5, 1, 3, 1).box(22, 0, 4, -5, -5, 1, 3, 1).done(), "cow", "mooshroom");
		//#else
		//$ put(tex(64, 32).box(0, 0, -4, -4, -6, 8, 8, 6).box(22, 0, -5, -5, -4, 1, 3, 1).box(22, 0, 4, -5, -4, 1, 3, 1).done(), "cow", "mooshroom");
		//#endif
		put(tex(64, 32).box(0, 0, -4, -4, -8, 8, 8, 8).box(16, 16, -2, 0, -9, 4, 3, 1).done(), "pig");
		put(tex(64, 32).box(0, 0, -3, -4, -6, 6, 6, 8).done(), "sheep");
		put(tex(64, 32).box(0, 0, -2, -6, -2, 4, 6, 3).box(14, 0, -2, -4, -4, 4, 2, 2).box(14, 4, -1, -2, -3, 2, 2, 2).done(), "chicken");
		// a horse's head leans forward: seen from the front its muzzle is below the forehead
		put(tex(64, 64).box(0, 13, -3, -11, -2, 6, 5, 7).box(0, 25, -2, -9, -7, 4, 5, 5).box(19, 16, 0.55f, -13, 4, 2, 3, 1).box(19, 16, -2.55f, -13, 4, 2, 3, 1).done(),
			"horse", "zombie_horse", "skeleton_horse");
		put(tex(64, 64).box(0, 13, -3, -11, -2, 6, 5, 7).box(0, 25, -2, -9, -7, 4, 5, 5).done(), "donkey", "mule");
		put(tex(64, 32).box(0, 0, -2, -3, -2, 6, 6, 4).box(16, 14, -2, -5, 0, 2, 2, 1).box(16, 14, 2, -5, 0, 2, 2, 1).box(0, 10, -0.5f, 0, -5, 3, 3, 4).done(), "wolf");
		put(tex(64, 32).box(0, 0, -2.5f, -2, -3, 5, 4, 5).box(0, 24, -1.5f, 0, -4, 3, 2, 2).box(0, 10, -2, -3, 1, 1, 1, 2).box(6, 10, 1, -3, 1, 1, 1, 2).done(), "cat", "ocelot");
		put(tex(48, 32).box(1, 5, -3, -2, -5, 8, 6, 6).box(8, 1, -3, -4, -4, 2, 2, 1).box(15, 1, 3, -4, -4, 2, 2, 1).box(6, 18, -1, 2, -8, 4, 2, 3).done(), "fox");
		//#if MC >= 26.1
		// the rabbit of 26.1 has a new model
		put(tex(64, 64).box(0, 16, -2.5f, -3, -4, 5, 5, 5).box(32, 0, 0.5f, -8, -1, 2, 5, 1).box(26, 0, -2.5f, -8, -1, 2, 5, 1).done(), "rabbit");
		//#else
		//$ put(tex(64, 32).box(32, 0, -2.5f, -4, -5, 5, 4, 5).box(32, 9, -0.5f, -2.5f, -5.5f, 1, 1, 1).box(52, 0, -2.5f, -9, -1, 2, 5, 1).box(58, 0, 0.5f, -9, -1, 2, 5, 1).done(), "rabbit");
		//#endif
		put(tex(64, 64).box(0, 0, -3.5f, -4, -5, 7, 7, 10).done(), "bee");
		put(tex(64, 64).box(0, 1, -4, -3, -5, 8, 5, 5).box(3, 37, -4, -6, -1, 8, 3, 0).done(), "axolotl");
		put(tex(128, 64).box(3, 0, -3, -1, -3, 6, 5, 6).done(), "turtle");
		// a frog's head over its chin, the eyes on top
		put(tex(48, 48).box(3, 1, -3.5f, -2, -8, 7, 3, 9).box(0, 13, -3.5f, -4, -8.01f, 7, 3, 9).box(0, 0, -3.5f, -6, -7, 3, 2, 3).box(0, 5, 0.5f, -6, -7, 3, 2, 3).done(), "frog");
		// a llama: the top of its neck with the muzzle in front and the ears above
		put(tex(128, 64).box(0, 14, -4, -16, -6, 8, 8, 6).box(0, 0, -2, -14, -10, 4, 4, 9).box(17, 0, -4, -19, -4, 3, 3, 2).box(17, 0, 1, -19, -4, 3, 3, 2).done(), "llama", "trader_llama");
		put(tex(64, 64).box(34, 46, -3, -4, -8, 5, 7, 10).done(), "goat");
		put(tex(128, 64).box(0, 0, -3.5f, -3, -3, 7, 7, 7).box(0, 44, -2.5f, 1, -6, 5, 3, 3).box(26, 0, -4.5f, -4, -1, 2, 2, 1).box(26, 0, 2.5f, -4, -1, 2, 2, 1).done(), "polar_bear");
		put(tex(64, 64).box(0, 6, -6.5f, -5, -4, 13, 10, 9).box(45, 16, -3.5f, 0, -6, 7, 5, 2).box(52, 25, 3.5f, -8, -1, 5, 4, 1).box(52, 25, -8.5f, -8, -1, 5, 4, 1).done(), "panda");
		put(tex(64, 32).box(0, 0, -6, -8, -6, 12, 16, 12).done(), "squid", "glow_squid");
	}

	/** Which mob kinds have a face (only the game's own: another mod's "zombie" is not ours). */
	private static final Map<EntityType<?>, Face> BY_TYPE = new IdentityHashMap<>();
	private static final Face NO_FACE = new Face(0, 0, new Part[0], 0, 0, 1, 1);

	private static Face face(EntityType<?> type) {
		return BY_TYPE.computeIfAbsent(type, t -> {
			Identifier id = net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(t);
			Face f = id != null && id.getNamespace().equals("minecraft") ? FACES.get(id.getPath()) : null;
			return f == null ? NO_FACE : f;
		});
	}

	/** Has a face at all (without looking at its texture yet). */
	static boolean listed(EntityType<?> type) {
		return face(type) != NO_FACE;
	}

	/** Each mob's texture, looked up now and then (a variant rarely changes: a sheared sheep, a shooting ghast). */
	private record Looked(Identifier texture, long until) {}

	private static final Map<Entity, Looked> TEXTURES = new WeakHashMap<>();
	/** Each texture's real size, read from the file again after a few seconds (a resource pack may have changed it). */
	private record Size(int w, int h, long until) {}

	private static final Map<Identifier, Size> SIZES = new HashMap<>();
	private static final Identifier NONE = Identifier.fromNamespaceAndPath("slashclient-hud", "none");

	/** The mob's face, ready to draw, or null when it has none (not listed, or its texture is not one we know the layout of). */
	static Head head(Entity e) {
		Face f = face(e.getType());
		if (f == NO_FACE) return null;
		Minecraft mc = Minecraft.getInstance();
		long now = System.currentTimeMillis();
		Looked looked = TEXTURES.get(e);
		if (looked == null || now > looked.until()) {
			Identifier tex = texture(mc, e);
			// spread over time, not every mob of a herd at once
			looked = new Looked(tex == null ? NONE : tex, now + 1500 + (e.getId() & 511));
			TEXTURES.put(e, looked);
		}
		if (looked.texture() == NONE) return null;
		Size size = SIZES.get(looked.texture());
		if (size == null || now > size.until()) {
			int[] wh = pngSize(mc, looked.texture());
			size = wh == null ? new Size(f.texW(), f.texH(), now + 5000) : new Size(wh[0], wh[1], now + 5000);
			SIZES.put(looked.texture(), size);
		}
		return new Head(looked.texture(), f, size.w(), size.h());
	}

	/**
	 * The texture the game draws this mob with, from its renderer (so variants come along). In 26.1
	 * the young have models of their own with "_baby" textures: they get the grown-up variant's face.
	 */
	@SuppressWarnings({ "rawtypes", "unchecked" })
	private static Identifier texture(Minecraft mc, Entity e) {
		Identifier tex;
		try {
			net.minecraft.client.renderer.entity.EntityRenderer r = mc.getEntityRenderDispatcher().getRenderer(e);
			//#if MC >= 1.21.2
			if (!(r instanceof net.minecraft.client.renderer.entity.LivingEntityRenderer living)) return null;
			if (!(r.createRenderState(e, 1f) instanceof net.minecraft.client.renderer.entity.state.LivingEntityRenderState state)) return null;
			tex = living.getTextureLocation(state);
			//#else
			//$ tex = r.getTextureLocation(e);
			//#endif
		} catch (RuntimeException ex) {
			return null;
		}
		if (tex == null || !tex.getPath().contains("_baby")) return tex;
		Identifier grown = Identifier.fromNamespaceAndPath(tex.getNamespace(), tex.getPath().replace("_baby", ""));
		return mc.getResourceManager().getResource(grown).isPresent() ? grown : null;
	}

	/** A PNG's width and height from its header, or null when there is no such file (a texture made in the game). */
	private static int[] pngSize(Minecraft mc, Identifier tex) {
		var resource = mc.getResourceManager().getResource(tex);
		if (resource.isEmpty()) return null;
		try (var in = resource.get().open()) {
			byte[] b = in.readNBytes(24);
			if (b.length < 24 || b[12] != 'I' || b[13] != 'H' || b[14] != 'D' || b[15] != 'R') return null;
			int w = (b[16] & 255) << 24 | (b[17] & 255) << 16 | (b[18] & 255) << 8 | b[19] & 255;
			int h = (b[20] & 255) << 24 | (b[21] & 255) << 16 | (b[22] & 255) << 8 | b[23] & 255;
			return w > 0 && h > 0 ? new int[] { w, h } : null;
		} catch (java.io.IOException ex) {
			return null;
		}
	}

	/** Draws the face as large as fits in the w × h area at (x, y), in the middle. */
	static void draw(GuiGraphicsExtractor g, Head head, float x, float y, float w, float h) {
		Face f = head.face();
		// a pack's texture twice as large has every pixel twice as large
		float k = (float) head.texW() / f.texW();
		float s = Math.min(w / f.w(), h / f.h());
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(x + (w - f.w() * s) / 2, y + (h - f.h() * s) / 2);
		pose.scale(s, s);
		for (Part p : f.parts()) {
			pose.pushMatrix();
			pose.translate(p.x() - f.x0(), p.y() - f.y0());
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, head.texture(), 0, 0, p.u() * k, p.v() * k, p.w(), p.h(),
				Math.max(1, Math.round(p.w() * k)), Math.max(1, Math.round(p.h() * k)), head.texW(), head.texH(), 0xFFFFFFFF);
			pose.popMatrix();
		}
		pose.popMatrix();
	}

	/** The dungeon map's face: `size` pixels round the point in a frame of that colour; false when the mob has none. */
	static boolean draw(GuiGraphicsExtractor g, Entity e, int x, int y, int size, int frame) {
		Head head = head(e);
		if (head == null) return false;
		// as wide as tall at most `size`: a taller face (the illagers' long heads) keeps its shape
		float a = head.aspect();
		int w = a >= 1 ? size : Math.round(size * a), h = a >= 1 ? Math.round(size / a) : size;
		int x0 = x - w / 2, y0 = y - h / 2;
		g.fill(x0 - 1, y0 - 1, x0 + w + 1, y0 + h + 1, frame);
		draw(g, head, x0, y0, w, h);
		return true;
	}
}
