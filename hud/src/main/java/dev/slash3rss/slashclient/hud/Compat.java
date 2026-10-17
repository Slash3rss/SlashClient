package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.ChatComponent;
import net.minecraft.client.gui.components.toasts.SystemToast;
import net.minecraft.client.gui.components.toasts.ToastManager;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

/**
 * The few places where Minecraft versions differ, so the rest of the HUD reads the same for
 * all of them. Branches are chosen at build time (see build.gradle, `//#if MC …`).
 */
public final class Compat {
	private Compat() {}

	/** The open screen, or null in game. */
	public static Screen screen(Minecraft mc) {
		//#if MC >= 26.2
		return mc.gui.screen();
		//#else
		//$ return mc.screen;
		//#endif
	}

	public static ChatComponent chat(Minecraft mc) {
		//#if MC >= 26.2
		return mc.gui.hud.getChat();
		//#else
		//$ return mc.gui.getChat();
		//#endif
	}

	public static net.minecraft.client.Camera camera(Minecraft mc) {
		//#if MC >= 26.2
		return mc.gameRenderer.mainCamera();
		//#else
		//$ return mc.gameRenderer.getMainCamera();
		//#endif
	}

	/** What the game draws into before it reaches the screen. */
	public static com.mojang.blaze3d.pipeline.RenderTarget mainTarget(Minecraft mc) {
		//#if MC >= 26.2
		return mc.gameRenderer.mainRenderTarget();
		//#else
		//$ return mc.getMainRenderTarget();
		//#endif
	}

	/** The HUD hidden with F1 (then no names are drawn either). */
	public static boolean hudHidden(Minecraft mc) {
		//#if MC >= 26.2
		return mc.gui.hud.isHidden();
		//#else
		//$ return !Minecraft.renderNames();
		//#endif
	}

	/** The line above the hotbar ("Fullbright on"). */
	public static void overlay(Minecraft mc, Component text) {
		//#if MC >= 26.2
		mc.gui.hud.setOverlayMessage(text, false);
		//#else
		//$ mc.gui.setOverlayMessage(text, false);
		//#endif
	}

	public static ToastManager toasts(Minecraft mc) {
		//#if MC >= 26.2
		return mc.gui.toastManager();
		//#else
		//$ return mc.getToastManager();
		//#endif
	}

	/** The toast kind for friends' messages. */
	public static SystemToast.SystemToastId friendToast() {
		//#if MC >= 26.2
		return SystemToast.SystemToastId.FRIEND_SYSTEM_NOTIFICATION;
		//#else
		//$ return SystemToast.SystemToastId.PERIODIC_NOTIFICATION;
		//#endif
	}

	/** The game's options screen, opened from our menu. */
	public static Screen options(Minecraft mc, Screen parent) {
		//#if MC >= 26.3
		return new net.minecraft.client.gui.screens.options.OptionsScreen(parent, mc.options);
		//#elif MC >= 26.1
		//$ return new net.minecraft.client.gui.screens.options.OptionsScreen(parent, mc.options, false);
		//#else
		//$ return new net.minecraft.client.gui.screens.options.OptionsScreen(parent, mc.options);
		//#endif
	}

	/** Lines the open chat tab shows (before 26.1 used by ChatFilterMixin). */
	public static java.util.function.Predicate<net.minecraft.client.multiplayer.chat.GuiMessage> chatFilter = m -> true;

	/** Shows only the chat lines `filter` accepts, and lays the chat out again. */
	public static void setChatFilter(ChatComponent chat, java.util.function.Predicate<net.minecraft.client.multiplayer.chat.GuiMessage> filter) {
		//#if MC >= 26.1
		chat.setVisibleMessageFilter(filter);
		//#else
		//$ chatFilter = filter;
		//$ chat.rescaleChat();
		//#endif
	}

	/** A model drawn with the frame (the outline colour is for glowing players). */
	//#if MC >= 1.21.6
	public static <S> void submitModel(net.minecraft.client.renderer.SubmitNodeCollector out, net.minecraft.client.model.Model<? super S> model, S state,
			com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.rendertype.RenderType type, int light, int overlay, int outline) {
		//#if MC >= 26.3
		out.submitModel(model, state, pose, type, light, overlay, outline);
		//#else
		//$ out.submitModel(model, state, pose, type, light, overlay, outline, null);
		//#endif
	}
	//#else
	//$ public static <S> void submitModel(net.minecraft.client.renderer.MultiBufferSource out, net.minecraft.client.model.EntityModel<? super S> model, S state,
	//$ 		com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.RenderType type, int light, int overlay, int outline) {
	//$ 	// drawn at once into the frame's buffers; the outline of glowing players is left to the game
	//$ 	model.setupAnim(state);
	//$ 	model.renderToBuffer(pose, out.getBuffer(type), light, overlay);
	//$ }
	//#endif

	/** Moves an inventory slot's stack into a hotbar slot (as pressing that slot's number over it would). */
	static void swapIntoHotbar(Minecraft mc, net.minecraft.world.entity.player.Player player, int slot, int hotbar) {
		//#if MC >= 26.1
		mc.gameMode.handleContainerInput(player.inventoryMenu.containerId, slot, hotbar, net.minecraft.world.inventory.ContainerInput.SWAP, player);
		//#else
		//$ mc.gameMode.handleInventoryMouseClick(player.inventoryMenu.containerId, slot, hotbar, net.minecraft.world.inventory.ClickType.SWAP, player);
		//#endif
	}

	/** The game's picture of a status effect (the one in the corner of the screen). */
	//#if MC >= 1.21.6
	static net.minecraft.resources.Identifier effectSprite(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect) {
		//#if MC >= 26.2
		return net.minecraft.client.gui.Hud.getMobEffectSprite(effect);
		//#else
		//$ return net.minecraft.client.gui.Gui.getMobEffectSprite(effect);
		//#endif
	}
	//#else
	//$ static net.minecraft.client.renderer.texture.TextureAtlasSprite effectSprite(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect) {
	//$ 	return Minecraft.getInstance().getMobEffectTextures().get(effect);
	//$ }
	//#endif

	/** Lays a screen out again at its size (its widgets made anew). */
	static void relayout(Screen screen) {
		//#if MC >= 1.21.11
		screen.resize(screen.width, screen.height);
		//#else
		//$ screen.resize(Minecraft.getInstance(), screen.width, screen.height);
		//#endif
	}

	/** A texture made from a picture in memory; `label` names it in the game's debug output. */
	public static net.minecraft.client.renderer.texture.DynamicTexture dynamicTexture(String label, com.mojang.blaze3d.platform.NativeImage image) {
		//#if MC >= 1.21.5
		return new net.minecraft.client.renderer.texture.DynamicTexture(() -> label, image);
		//#else
		//$ return new net.minecraft.client.renderer.texture.DynamicTexture(image);
		//#endif
	}

	//#if MC < 1.21.5
	//$ /** The hotbar slot in hand (a plain field of the inventory before 1.21.5). */
	//$ static void setSelectedSlot(net.minecraft.world.entity.player.Inventory inv, int slot) {
	//$ 	inv.selected = slot;
	//$ }
	//#endif

	/** An empty chat line being typed (the chat opened with T). */
	public static net.minecraft.client.gui.screens.ChatScreen chatScreen() {
		//#if MC >= 1.21.6
		return new net.minecraft.client.gui.screens.ChatScreen("", false);
		//#else
		//$ return new net.minecraft.client.gui.screens.ChatScreen("");
		//#endif
	}

	/** Takes a value only so it is used (where versions/<mc>.properties folds a later call's argument away); always false. */
	public static boolean ignore(Object unused) {
		return false;
	}

	//#if MC >= 1.21.6
	/** A font of this mod by its id (fonts/<id>.json). */
	public static net.minecraft.network.chat.FontDescription font(net.minecraft.resources.Identifier id) {
		return new net.minecraft.network.chat.FontDescription.Resource(id);
	}

	/** One of our textures as a skin part: `id` names it, `path` is the picture. */
	public static net.minecraft.core.ClientAsset.Texture texture(net.minecraft.resources.Identifier id, net.minecraft.resources.Identifier path) {
		return new net.minecraft.core.ClientAsset.ResourceTexture(id, path);
	}

	public static net.minecraft.world.entity.player.PlayerSkin playerSkin(net.minecraft.core.ClientAsset.Texture body, net.minecraft.core.ClientAsset.Texture cape,
			net.minecraft.core.ClientAsset.Texture elytra, net.minecraft.world.entity.player.PlayerModelType model, boolean secure) {
		return new net.minecraft.world.entity.player.PlayerSkin(body, cape, elytra, model, secure);
	}
	//#else
	//$ /** Before 1.21.9 a font was named by its id alone. */
	//$ public static net.minecraft.resources.Identifier font(net.minecraft.resources.Identifier id) {
	//$ 	return id;
	//$ }
	//$
	//$ /** Before 1.21.9 a skin part was just the picture. */
	//$ public static net.minecraft.resources.Identifier texture(net.minecraft.resources.Identifier id, net.minecraft.resources.Identifier path) {
	//$ 	return path;
	//$ }
	//$
	//$ public static net.minecraft.client.resources.PlayerSkin playerSkin(net.minecraft.resources.Identifier body, net.minecraft.resources.Identifier cape,
	//$ 		net.minecraft.resources.Identifier elytra, net.minecraft.client.resources.PlayerSkin.Model model, boolean secure) {
	//$ 	return new net.minecraft.client.resources.PlayerSkin(body, null, cape, elytra, model, secure);
	//$ }
	//$
	//$ /** Leaves the world or server, as the pause menu's button does (later versions have Minecraft.disconnectFromWorld). */
	//$ public static void disconnectFromWorld(Minecraft mc, Component reason) {
	//$ 	boolean local = mc.isLocalServer();
	//$ 	net.minecraft.client.multiplayer.ServerData server = mc.getCurrentServer();
	//$ 	if (mc.level != null) mc.level.disconnect();
	//$ 	if (local) mc.disconnect(new net.minecraft.client.gui.screens.GenericMessageScreen(Component.translatable("menu.savingLevel")));
	//$ 	else mc.disconnect();
	//$ 	var title = new net.minecraft.client.gui.screens.TitleScreen();
	//$ 	if (local) mc.setScreen(title);
	//$ 	else if (server != null && server.isRealm()) mc.setScreen(new com.mojang.realmsclient.RealmsMainScreen(title));
	//$ 	else mc.setScreen(new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(title));
	//$ }
	//$
	//$ public static Component disconnectButtonLabel(boolean local) {
	//$ 	return local ? Component.translatable("menu.returnToMenu") : net.minecraft.network.chat.CommonComponents.GUI_DISCONNECT;
	//$ }
	//$
	//$ /**
	//$  * A player model standing in the box, as the game's PlayerSkinWidget draws it before 1.21.6
	//$  * (later versions have GuiGraphics.submitSkinRenderState with these arguments).
	//$  */
	//$ public static void skin(net.minecraft.client.gui.GuiGraphics graphics, net.minecraft.client.model.Model model, net.minecraft.resources.Identifier texture,
	//$ 		float scale, float rotX, float rotY, float pivotY, int x0, int y0, int x1, int y1) {
	//$ 	var pose = graphics.pose();
	//$ 	pose.pushPose();
	//$ 	pose.translate((x0 + x1) / 2f, y1, 100);
	//$ 	pose.scale(scale, scale, scale);
	//$ 	pose.translate(0, -0.0625f, 0);
	//$ 	pose.rotateAround(com.mojang.math.Axis.XP.rotationDegrees(rotX), 0, pivotY, 0);
	//$ 	pose.mulPose(com.mojang.math.Axis.YP.rotationDegrees(rotY));
	//$ 	graphics.flush();
	//$ 	com.mojang.blaze3d.platform.Lighting.setupForEntityInInventory(com.mojang.math.Axis.XP.rotationDegrees(rotX));
	//$ 	pose.pushPose();
	//$ 	pose.scale(1, 1, -1);
	//$ 	pose.translate(0, -1.5f, 0);
	//$ 	graphics.drawSpecial(buffers -> model.renderToBuffer(pose, buffers.getBuffer(model.renderType(texture)), 0xF000F0, net.minecraft.client.renderer.texture.OverlayTexture.NO_OVERLAY));
	//$ 	pose.popPose();
	//$ 	graphics.flush();
	//$ 	com.mojang.blaze3d.platform.Lighting.setupFor3DItems();
	//$ 	pose.popPose();
	//$ }
	//#endif
}
