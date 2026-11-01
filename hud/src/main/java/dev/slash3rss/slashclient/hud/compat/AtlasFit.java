package dev.slash3rss.slashclient.hud.compat;

import com.mojang.blaze3d.platform.NativeImage;

/**
 * A server's resource pack whose textures do not fit the graphics card in one atlas (a Raspberry Pi takes
 * 4096 pixels, a big pack's items need 8192): the game would turn the whole pack down ("Unable to fit").
 * Instead its biggest textures are halved until the atlas fits (mixin.AtlasFitMixin) – the player sees
 * the pack a little blurrier rather than not at all. A card that takes it all never gets here.
 */
public final class AtlasFit {
	private AtlasFit() {}

	/** Textures smaller than this stay as they are (shrinking a 16×16 icon would ruin it and gain nothing). */
	public static final int SMALLEST = 32;
	/** How many rounds of halving before the game's own answer (the pack turned down) is let through. */
	public static final int ROUNDS = 6;
	/** For the game test: an atlas limit smaller than the card's, so a test pack has to be shrunk. */
	public static volatile int limitForTest;

	//#if MC >= 1.21.11
	/** The picture at half its size, each pixel the average of four (weighted by how opaque they are, so edges do not darken). */
	public static NativeImage half(NativeImage src) {
		int w = Math.max(1, src.getWidth() / 2), h = Math.max(1, src.getHeight() / 2);
		NativeImage out = new NativeImage(w, h, false);
		for (int y = 0; y < h; y++) {
			for (int x = 0; x < w; x++) {
				long a = 0, r = 0, g = 0, b = 0;
				for (int dy = 0; dy < 2; dy++) {
					for (int dx = 0; dx < 2; dx++) {
						int p = src.getPixel(Math.min(src.getWidth() - 1, x * 2 + dx), Math.min(src.getHeight() - 1, y * 2 + dy));
						int pa = p >>> 24;
						a += pa;
						r += (long) (p >> 16 & 0xFF) * pa;
						g += (long) (p >> 8 & 0xFF) * pa;
						b += (long) (p & 0xFF) * pa;
					}
				}
				int pixel = a == 0 ? 0 : (int) (a / 4) << 24 | (int) (r / a) << 16 | (int) (g / a) << 8 | (int) (b / a);
				out.setPixel(x, y, pixel);
			}
		}
		return out;
	}
	//#endif
}
