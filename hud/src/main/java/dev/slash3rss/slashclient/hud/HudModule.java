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

	/** A picture without text (e.g. the attack indicator): no box under it, and its only option is its size. */
	default boolean bare() {
		return false;
	}

	/** Whether its text takes the text colour option (not when it colours its text itself, e.g. ping by how good it is). */
	default boolean textColored() {
		return !bare();
	}

	/** Whether it has text whose shadow can be switched. */
	default boolean shadowed() {
		return !bare();
	}

	/** Whether the box and the outline go around it now (not around a round map). */
	default boolean framed() {
		return !bare();
	}

	/** What the editor shows while the module has nothing real to show. */
	default void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
		draw(g, mc, x, y);
	}
}
