//#if MC < 1.21.2
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ import net.minecraft.resources.ResourceLocation;
//$
//$ /** The game's HUD parts that HudElementRegistry can wrap on 1.21.1 (each one hooked in LegacyHudMixin). */
//$ public final class VanillaHudElements {
//$ 	private VanillaHudElements() {}
//$
//$ 	public static final ResourceLocation CROSSHAIR = ResourceLocation.withDefaultNamespace("crosshair");
//$ 	public static final ResourceLocation STATUS_EFFECTS = ResourceLocation.withDefaultNamespace("status_effects");
//$ 	public static final ResourceLocation BOSS_BAR = ResourceLocation.withDefaultNamespace("boss_bar");
//$ 	public static final ResourceLocation SCOREBOARD = ResourceLocation.withDefaultNamespace("scoreboard");
//$ 	public static final ResourceLocation TITLE_AND_SUBTITLE = ResourceLocation.withDefaultNamespace("title_and_subtitle");
//$ 	public static final ResourceLocation CHAT = ResourceLocation.withDefaultNamespace("chat");
//$ 	public static final ResourceLocation PLAYER_LIST = ResourceLocation.withDefaultNamespace("player_list");
//$ 	public static final ResourceLocation OVERLAY_MESSAGE = ResourceLocation.withDefaultNamespace("overlay_message");
//$ }
//#elif MC < 1.21.6
//$ package dev.slash3rss.slashclient.hud.compat;
//$
//$ import net.fabricmc.fabric.api.client.rendering.v1.IdentifiedLayer;
//$ import net.minecraft.resources.ResourceLocation;
//$
//$ /** The game's HUD layers under the names Fabric gives them from 1.21.6 on. */
//$ public final class VanillaHudElements {
//$ 	private VanillaHudElements() {}
//$
//$ 	public static final ResourceLocation CROSSHAIR = IdentifiedLayer.CROSSHAIR;
//$ 	public static final ResourceLocation STATUS_EFFECTS = IdentifiedLayer.STATUS_EFFECTS;
//$ 	public static final ResourceLocation BOSS_BAR = IdentifiedLayer.BOSS_BAR;
//$ 	public static final ResourceLocation SCOREBOARD = IdentifiedLayer.SCOREBOARD;
//$ 	public static final ResourceLocation TITLE_AND_SUBTITLE = IdentifiedLayer.TITLE_AND_SUBTITLE;
//$ 	public static final ResourceLocation CHAT = IdentifiedLayer.CHAT;
//$ 	public static final ResourceLocation PLAYER_LIST = IdentifiedLayer.PLAYER_LIST;
//$ 	public static final ResourceLocation OVERLAY_MESSAGE = IdentifiedLayer.OVERLAY_MESSAGE;
//$ }
//#endif
