package dev.slash3rss.slashclient.hud.compat;

//#if MC < 1.21.6
//$ import net.fabricmc.fabric.api.client.rendering.v1.HudLayerRegistrationCallback;
//$ import net.fabricmc.fabric.api.client.rendering.v1.IdentifiedLayer;
//$ import net.minecraft.resources.ResourceLocation;
//$
//$ import java.util.function.Function;
//$
//$ /** Fabric's HudElementRegistry (1.21.6+) on the older HudLayerRegistrationCallback. */
//$ public final class HudElementRegistry {
//$ 	private HudElementRegistry() {}
//$
//$ 	public static void replaceElement(ResourceLocation id, Function<HudElement, HudElement> replace) {
//$ 		HudLayerRegistrationCallback.EVENT.register(layers -> layers.replaceLayer(id, old -> IdentifiedLayer.of(id, replace.apply(old::render))));
//$ 	}
//$
//$ 	public static void attachElementBefore(ResourceLocation before, ResourceLocation id, HudElement element) {
//$ 		HudLayerRegistrationCallback.EVENT.register(layers -> layers.attachLayerBefore(before, IdentifiedLayer.of(id, element)));
//$ 	}
//$ }
//#endif
