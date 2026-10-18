package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;

import java.util.HashMap;
import java.util.Map;

/**
 * Mob faces for the dungeon map, cut from the game's own mob textures (or a resource pack's): the
 * front of the head, where each model has it. Coordinates are for the texture's usual size; a
 * larger one with the same layout draws the same.
 */
final class MobHeads {
	private MobHeads() {}

	/** Where a face is: candidate texture paths (they moved between versions), the face and an overlay on it. */
	private record Face(String[] paths, int u, int v, int w, int h, int texW, int texH, int hatU, int hatV) {}

	private static Face face(int u, int v, int w, int h, int texW, int texH, String... paths) {
		return new Face(paths, u, v, w, h, texW, texH, -1, -1);
	}

	private static Face hat(int u, int v, int texW, int texH, String... paths) {
		return new Face(paths, u, v, 8, 8, texW, texH, u + 32, v);
	}

	private static final Map<String, Face> FACES = new HashMap<>();

	static {
		FACES.put("zombie", hat(8, 8, 64, 64, "zombie/zombie"));
		FACES.put("husk", hat(8, 8, 64, 64, "zombie/husk"));
		FACES.put("drowned", hat(8, 8, 64, 64, "zombie/drowned"));
		FACES.put("skeleton", face(8, 8, 8, 8, 64, 32, "skeleton/skeleton"));
		FACES.put("stray", face(8, 8, 8, 8, 64, 32, "skeleton/stray"));
		FACES.put("wither_skeleton", face(8, 8, 8, 8, 64, 32, "skeleton/wither_skeleton"));
		FACES.put("bogged", face(8, 8, 8, 8, 64, 32, "skeleton/bogged"));
		FACES.put("parched", face(8, 8, 8, 8, 64, 32, "skeleton/parched"));
		FACES.put("creeper", face(8, 8, 8, 8, 64, 32, "creeper/creeper"));
		FACES.put("spider", face(40, 12, 8, 8, 64, 32, "spider/spider"));
		FACES.put("cave_spider", face(40, 12, 8, 8, 64, 32, "spider/cave_spider"));
		FACES.put("enderman", face(8, 8, 8, 8, 64, 32, "enderman/enderman"));
		FACES.put("blaze", face(8, 8, 8, 8, 64, 32, "blaze/blaze", "blaze"));
		FACES.put("witch", face(8, 8, 8, 10, 64, 128, "witch/witch", "witch"));
		FACES.put("pillager", face(8, 8, 8, 10, 64, 64, "illager/pillager"));
		FACES.put("vindicator", face(8, 8, 8, 10, 64, 64, "illager/vindicator"));
		FACES.put("evoker", face(8, 8, 8, 10, 64, 64, "illager/evoker"));
		FACES.put("illusioner", face(8, 8, 8, 10, 64, 64, "illager/illusioner"));
		FACES.put("vex", face(8, 8, 8, 8, 32, 32, "illager/vex"));
		FACES.put("piglin", face(8, 8, 10, 8, 64, 64, "piglin/piglin"));
		FACES.put("piglin_brute", face(8, 8, 10, 8, 64, 64, "piglin/piglin_brute"));
		FACES.put("zombified_piglin", face(8, 8, 10, 8, 64, 64, "piglin/zombified_piglin"));
		FACES.put("slime", face(8, 8, 8, 8, 64, 32, "slime/slime"));
		FACES.put("iron_golem", face(8, 8, 8, 10, 128, 128, "iron_golem/iron_golem"));
		FACES.put("ghast", face(16, 16, 16, 16, 64, 32, "ghast/ghast"));
		FACES.put("zombie_villager", face(8, 8, 8, 10, 64, 64, "zombie_villager/zombie_villager"));
		FACES.put("villager", face(8, 8, 8, 10, 64, 64, "villager/villager"));
		FACES.put("wither", face(8, 8, 8, 8, 64, 64, "wither/wither"));
	}

	/** The texture each mob's face is in, once looked up (an empty value: none in this game). */
	private static final Map<String, Identifier> FOUND = new HashMap<>();
	private static final Identifier NONE = Identifier.fromNamespaceAndPath("slashclient-hud", "none");

	/** Draws the mob's face, 8 pixels round the point; false when there is none to draw. */
	static boolean draw(GuiGraphicsExtractor g, EntityType<?> type, int x, int y) {
		String id = EntityType.getKey(type).getPath();
		Face f = FACES.get(id);
		if (f == null) return false;
		Identifier tex = FOUND.computeIfAbsent(id, k -> {
			var resources = Minecraft.getInstance().getResourceManager();
			for (String p : f.paths()) {
				Identifier candidate = Identifier.fromNamespaceAndPath("minecraft", "textures/entity/" + p + ".png");
				if (resources.getResource(candidate).isPresent()) return candidate;
			}
			return NONE;
		});
		if (tex == NONE) return false;
		// as wide as tall at most 8: a taller face (the illagers' long heads) keeps its shape
		int w = f.w() >= f.h() ? 8 : Math.round(8f * f.w() / f.h()), h = f.h() >= f.w() ? 8 : Math.round(8f * f.h() / f.w());
		int x0 = x - w / 2, y0 = y - h / 2;
		g.fill(x0 - 1, y0 - 1, x0 + w + 1, y0 + h + 1, 0xFF7F1D1D);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, tex, x0, y0, f.u(), f.v(), w, h, f.w(), f.h(), f.texW(), f.texH(), 0xFFFFFFFF);
		if (f.hatU() >= 0) g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, tex, x0, y0, f.hatU(), f.hatV(), w, h, f.w(), f.h(), f.texW(), f.texH(), 0xFFFFFFFF);
		return true;
	}
}
