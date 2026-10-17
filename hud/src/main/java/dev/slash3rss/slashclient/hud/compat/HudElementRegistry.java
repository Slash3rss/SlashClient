//#if MC < 1.21.2
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ import net.minecraft.client.DeltaTracker;
//$ import net.minecraft.client.gui.GuiGraphics;
//$ import net.minecraft.resources.ResourceLocation;
//$
//$ import java.util.ArrayList;
//$ import java.util.HashMap;
//$ import java.util.List;
//$ import java.util.Map;
//$ import java.util.function.Function;
//$
//$ /**
//$  * The part of Fabric's HUD element registry the HUD uses, for 1.21.1 where Fabric has only
//$  * HudRenderCallback: the game's own parts are wrapped in LegacyHudMixin and pass through here.
//$  */
//$ public final class HudElementRegistry {
//$ 	private HudElementRegistry() {}
//$
//$ 	private static final Map<ResourceLocation, List<Function<HudElement, HudElement>>> REPLACED = new HashMap<>();
//$ 	private static final Map<ResourceLocation, List<HudElement>> BEFORE = new HashMap<>();
//$
//$ 	public static void replaceElement(ResourceLocation id, Function<HudElement, HudElement> replace) {
//$ 		REPLACED.computeIfAbsent(id, k -> new ArrayList<>()).add(replace);
//$ 	}
//$
//$ 	public static void attachElementBefore(ResourceLocation before, ResourceLocation id, HudElement element) {
//$ 		BEFORE.computeIfAbsent(before, k -> new ArrayList<>()).add(element);
//$ 	}
//$
//$ 	/** Draws the game's part `id` (drawn by `vanilla`) with what was attached before it and its replacements. */
//$ 	public static void render(ResourceLocation id, GuiGraphics g, DeltaTracker delta, HudElement vanilla) {
//$ 		for (HudElement e : BEFORE.getOrDefault(id, List.of())) e.render(g, delta);
//$ 		HudElement element = vanilla;
//$ 		for (Function<HudElement, HudElement> replace : REPLACED.getOrDefault(id, List.of())) element = replace.apply(element);
//$ 		element.render(g, delta);
//$ 	}
//$ }
//#endif
