package dev.slash3rss.slashclient.hud.cosmetics;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

/** The cosmetics menu's look at a spray: its picture on a stone-brick wall, big, and which key sprays it. */
final class SprayPreview {
	private SprayPreview() {}

	private static final Identifier WALL = Identifier.withDefaultNamespace("textures/block/stone_bricks.png");

	/** In the box (x, y, w, h): a wall of 2×2 blocks with the spray on the middle, or the bare wall for none. */
	static void draw(GuiGraphicsExtractor g, int x, int y, int w, int h, String spray) {
		// whole pixels of the 16-pixel blocks, so the bricks stay sharp
		int block = Math.max(16, Math.min(Math.min(w - 32, h - 80) / 2, 80) / 16 * 16);
		int size = block * 2;
		int bx = x + (w - size) / 2, by = y + (h - size) / 2 - 8;
		for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) {
			g.blit(RenderPipelines.GUI_TEXTURED, WALL, bx + i * block, by + j * block, 0, 0, block, block, 16, 16, 16, 16, 0xFFB4B4B4);
		}
		Ui.roundOutline(g, bx - 1, by - 1, size + 2, size + 2, 2, 0x60FFFFFF);
		if (spray != null && !spray.isEmpty()) {
			// one block's face, as in the world, in the middle of the wall
			int s = block;
			g.blit(RenderPipelines.GUI_TEXTURED, Sprays.texture(spray), bx + (size - s) / 2, by + (size - s) / 2, 0, 0, s, s, 64, 64, 64, 64, 0xFFFFFFFF);
		}
		Ui.centered(g, Ui.fit(keyHint(), w - 16), x + w / 2, by + size + 10, Ui.TEXT_2);
	}

	/** "Spray: key G (up to 5 blocks)", or how to get a key when there is none. */
	static Component keyHint() {
		if (Sprays.key == null || Sprays.key.isUnbound()) return Ui.tr("slashclient-hud.cosmetics.sprayNoKey");
		return Ui.tr("slashclient-hud.cosmetics.sprayHint", Sprays.key.getTranslatedKeyMessage());
	}
}
