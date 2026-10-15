package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;

/** One block of the HUD. Size can change from frame to frame (e.g. the list of effects). */
public interface HudModule {
	String id();

	/** False when there is nothing to show right now (e.g. ping in singleplayer). */
	default boolean visible(Minecraft mc) {
		return true;
	}

	int width(Minecraft mc);

	int height(Minecraft mc);

	void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y);

	/** What the editor shows while the module has nothing real to show. */
	default void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		draw(g, mc, x, y);
	}
}
