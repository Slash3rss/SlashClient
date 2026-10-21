package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.renderer.texture.TextureAtlasSprite;
import net.minecraft.resources.Identifier;
import net.minecraft.util.RandomSource;

import java.util.Map;

/**
 * Autumn leaves, for the leaf aura (CosmeticEffects) and the leaves under the feet (RingEffects): real
 * particles of the game, its falling leaves (the cherry tree's, swaying, turning and drifting slowly down
 * until they touch the ground), with pictures of ours instead of the game's (textures/particle/leaf_<colour>_<n>.png,
 * scripts/make-leaves.mjs; the game's particle atlas takes every pack's particle pictures, ours too).
 * The golden variant drops golden leaves only, the autumn one red, brown and golden ones together.
 */
public final class Leaves {
	private Leaves() {}

	/** What falls in each variant (the same as scripts/make-leaves.mjs's VARIANTS). */
	private static final Map<String, String[]> COLOURS = Map.of("gold", new String[] {"gold"}, "autumn", new String[] {"red", "brown", "gold"});
	/** How many leaf shapes each colour has. */
	public static final int SHAPES = 5;
	private static final RandomSource R = RandomSource.create();
	/** For the test: how many leaves have been made. */
	static int made;

	/** The variant of a leaf item ("gold" or "autumn"), or null for any other item. */
	public static String variant(String id) {
		if (id == null || !id.contains("leaves_")) return null;
		return id.endsWith("_gold") ? "gold" : id.endsWith("_autumn") ? "autumn" : null;
	}

	/** One leaf's picture as a texture of its own (for the menus). */
	public static Identifier picture(String colour, int shape) {
		return Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/particle/leaf_" + colour + "_" + shape + ".png");
	}

	/** The colours of a variant's leaves. */
	public static String[] colours(String variant) {
		return COLOURS.getOrDefault(variant, new String[] {"gold"});
	}

	/** A leaf falling from (x, y, z): it sways, turns and drifts down slowly, gone when it lands. */
	static void fall(Minecraft mc, String variant, double x, double y, double z) {
		Leaf leaf = make(mc, variant, x, y, z, 1.7f + R.nextFloat() * 0.5f);
		if (leaf != null) mc.particleEngine.add(leaf);
	}

	/** A leaf kicked up from the ground by the feet: it hops up a little and flutters down again. */
	static void kick(Minecraft mc, String variant, double x, double y, double z, double vx, double vy, double vz) {
		Leaf leaf = make(mc, variant, x, y, z, 1.4f + R.nextFloat() * 0.4f);
		if (leaf == null) return;
		leaf.kick(vx, vy, vz);
		mc.particleEngine.add(leaf);
	}

	private static Leaf make(Minecraft mc, String variant, double x, double y, double z, float size) {
		String[] colours = COLOURS.get(variant);
		if (colours == null || mc.level == null) return null;
		// "minimal" particles (the last of all, decreased and minimal): none
		if (mc.options.particles().get().ordinal() == 2) return null;
		Identifier name = Identifier.fromNamespaceAndPath(SlashHud.ID, "leaf_" + colours[R.nextInt(colours.length)] + "_" + R.nextInt(SHAPES));
		TextureAtlasSprite sprite = sprite(mc, name);
		if (sprite == null) return null;
		Leaf leaf = new Leaf(mc.level, x, y, z, sprite, size);
		// not all of them in the same light
		float light = 0.86f + R.nextFloat() * 0.14f;
		leaf.setColor(light, light, light);
		made++;
		return leaf;
	}

	/** Our picture in the game's particle atlas. */
	private static TextureAtlasSprite sprite(Minecraft mc, Identifier name) {
		//#if MC >= 1.21.9
		return mc.getAtlasManager().getAtlasOrThrow(net.minecraft.data.AtlasIds.PARTICLES).getSprite(name);
		//#else
		//$ // (the particle engine's own atlas, not one of the models': only the texture manager knows it)
		//$ return mc.getTextureManager().getTexture(net.minecraft.client.renderer.texture.TextureAtlas.LOCATION_PARTICLES) instanceof net.minecraft.client.renderer.texture.TextureAtlas atlas ? atlas.getSprite(name) : null;
		//#endif
	}

	//#if MC < 1.21.9
	//$ /** The one picture, for the particles that pick theirs from a set. */
	//$ private static net.minecraft.client.particle.SpriteSet one(TextureAtlasSprite sprite) {
	//$ 	return new net.minecraft.client.particle.SpriteSet() {
	//$ 		@Override
	//$ 		public TextureAtlasSprite get(int age, int lifetime) {
	//$ 			return sprite;
	//$ 		}
	//$
	//$ 		@Override
	//$ 		public TextureAtlasSprite get(RandomSource random) {
	//$ 			return sprite;
	//$ 		}
	//$ 	};
	//$ }
	//#endif

	/**
	 * The game's falling leaf with our picture: like the leaves falling from trees (slow, swaying, with
	 * a swirl), a little bigger than the cherry tree's petals. Before 1.21.4 only the cherry's exists.
	 */
	//#if MC >= 1.21.9
	private static final class Leaf extends net.minecraft.client.particle.FallingLeavesParticle {
		Leaf(ClientLevel level, double x, double y, double z, TextureAtlasSprite sprite, float size) {
			super(level, x, y, z, sprite, 0.07f, 10f, true, false, size, 0.021f);
		}
	//#elif MC >= 1.21.4
	//$ private static final class Leaf extends net.minecraft.client.particle.FallingLeavesParticle {
	//$ 	Leaf(ClientLevel level, double x, double y, double z, TextureAtlasSprite sprite, float size) {
	//$ 		super(level, x, y, z, one(sprite), 0.07f, 10f, true, false, size, 0.021f);
	//$ 	}
	//#else
	//$ private static final class Leaf extends net.minecraft.client.particle.CherryParticle {
	//$ 	Leaf(ClientLevel level, double x, double y, double z, TextureAtlasSprite sprite, float size) {
	//$ 		super(level, x, y, z, one(sprite));
	//$ 		// the cherry's petals are half the size, and fall a little faster
	//$ 		this.quadSize *= size;
	//$ 		this.gravity *= 0.4f;
	//$ 		this.yd = -0.021;
	//$ 	}
	//#endif

		/** Thrown up from the ground: a quick hop, then down again. */
		void kick(double vx, double vy, double vz) {
			this.xd = vx;
			this.yd = vy;
			this.zd = vz;
			this.gravity = 0.0045f;
		}
	}
}
