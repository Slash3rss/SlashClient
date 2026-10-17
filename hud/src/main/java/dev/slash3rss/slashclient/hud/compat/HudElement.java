//#if MC < 1.21.6
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//#if MC >= 1.20.2
//$ import net.minecraft.client.DeltaTracker;
//#else
//#endif
//$ import net.minecraft.client.gui.GuiGraphics;
//$
//$ /** A part of the HUD, as Fabric's HUD element API has it from 1.21.6 on (see HudElementRegistry). */
//$ @FunctionalInterface
//$ public interface HudElement {
//$ 	void render(GuiGraphics g, DeltaTracker delta);
//#if MC < 1.20.2
//$
//$ 	/** 1.20.1 has no DeltaTracker: the HUD parts take nothing from it, so it carries nothing. */
//$ 	final class DeltaTracker {
//$ 		private DeltaTracker() {}
//$ 	}
//#endif
//$ }
//#endif
