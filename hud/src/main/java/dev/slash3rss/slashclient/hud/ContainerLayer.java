package dev.slash3rss.slashclient.hud;

import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * What our inventory tools draw over a window (the sort buttons, the search's frames, the locks,
 * SkyUp's task marks) goes over the window but under the item tooltips, as the game's own parts do.
 *
 * Fabric's "after render" comes once the whole screen is drawn, tooltips included. Before 1.21.6
 * that was fine: the GUI was drawn with depth and tooltips stand far in front. Later versions draw
 * in layers in the order things come, so anything drawn there covered the tooltip of the item under
 * the mouse. There it is drawn just before the item in hand instead (ContainerLayerMixin), after
 * the slots and before the tooltip's layer.
 */
public final class ContainerLayer {
	private ContainerLayer() {}

	public interface Drawer {
		void draw(GuiGraphicsExtractor g, int mouseX, int mouseY);
	}

	//#if MC >= 1.21.6
	private static final Map<Screen, List<Drawer>> UNDER = new WeakHashMap<>();

	static {
		// a window set up again (a new size) gets its drawers again, as Fabric's own events do
		ScreenEvents.BEFORE_INIT.register((mc, screen, w, h) -> UNDER.remove(screen));
	}
	//#endif

	/** Draws over this window every frame, under its tooltips. */
	public static void under(AbstractContainerScreen<?> screen, Drawer drawer) {
		//#if MC >= 1.21.6
		UNDER.computeIfAbsent(screen, s -> new ArrayList<>()).add(drawer);
		//#else
		//$ ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> drawer.draw(g, mx, my));
		//#endif
	}

	/** From ContainerLayerMixin: the window's own parts are drawn, its tooltip not yet. */
	public static void draw(Screen screen, GuiGraphicsExtractor g, int mouseX, int mouseY) {
		//#if MC >= 1.21.6
		List<Drawer> drawers = UNDER.get(screen);
		if (drawers != null) for (Drawer d : drawers) d.draw(g, mouseX, mouseY);
		//#endif
	}
}
