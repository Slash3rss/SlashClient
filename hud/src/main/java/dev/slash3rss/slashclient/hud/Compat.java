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

	//#if MC >= 1.21.2
	/** A model drawn with the frame (the outline colour is for glowing players). */
	//#if MC >= 1.21.9
	public static <S> void submitModel(net.minecraft.client.renderer.SubmitNodeCollector out, net.minecraft.client.model.Model<? super S> model, S state,
	//#else
	//$ public static <S> void submitModel(net.minecraft.client.renderer.SubmitNodeCollector out, net.minecraft.client.model.EntityModel<? super S> model, S state,
	//#endif
			com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.rendertype.RenderType type, int light, int overlay, int outline) {
		//#if MC >= 26.3
		out.submitModel(model, state, pose, type, light, overlay, outline);
		//#elif MC >= 1.21.9
		//$ out.submitModel(model, state, pose, type, light, overlay, outline, null);
		//#else
		//$ // drawn at once (a glowing player's outline comes from the buffers themselves)
		//$ model.setupAnim(state);
		//$ model.renderToBuffer(pose, out.getBuffer(type), light, overlay);
		//#endif
	}
	//#endif

	/** Moves an inventory slot's stack into a hotbar slot (as pressing that slot's number over it would). */
	static void swapIntoHotbar(Minecraft mc, net.minecraft.world.entity.player.Player player, int slot, int hotbar) {
		//#if MC >= 26.1
		mc.gameMode.handleContainerInput(player.inventoryMenu.containerId, slot, hotbar, net.minecraft.world.inventory.ContainerInput.SWAP, player);
		//#else
		//$ mc.gameMode.handleInventoryMouseClick(player.inventoryMenu.containerId, slot, hotbar, net.minecraft.world.inventory.ClickType.SWAP, player);
		//#endif
	}

	//#if MC >= 1.21.2
	/** The game's picture of a status effect (the one in the corner of the screen). */
	static net.minecraft.resources.Identifier effectSprite(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect) {
		//#if MC >= 26.2
		return net.minecraft.client.gui.Hud.getMobEffectSprite(effect);
		//#else
		//$ return net.minecraft.client.gui.Gui.getMobEffectSprite(effect);
		//#endif
	}
	//#endif

	/** Lays a screen out again at its size (its widgets made anew). */
	static void relayout(Screen screen) {
		//#if MC >= 1.21.11
		screen.resize(screen.width, screen.height);
		//#else
		//$ screen.resize(Minecraft.getInstance(), screen.width, screen.height);
		//#endif
	}

	/** Leaves the world or server, as the pause menu's button would (`reason` shows while it goes). */
	public static void leaveWorld(Minecraft mc, Component reason) {
		//#if MC >= 1.21.9
		mc.disconnectFromWorld(reason);
		//#else
		//#elif MC >= 1.21.2
		//$ boolean local = mc.isLocalServer();
		//$ var server = mc.getCurrentServer();
		//$ if (mc.level != null) mc.level.disconnect(reason);
		//$ if (local) mc.disconnectWithSavingScreen();
		//$ else mc.disconnectWithProgressScreen();
		//$ var title = new net.minecraft.client.gui.screens.TitleScreen();
		//$ if (local) mc.setScreen(title);
		//$ else if (server != null && server.isRealm()) mc.setScreen(new com.mojang.realmsclient.RealmsMainScreen(title));
		//$ else mc.setScreen(new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(title));
		//#else
		//$ dev.slash3rss.slashclient.hud.compat.Legacy.disconnectFromWorld(mc);
		//#endif
	}

	/** The chat, opened empty. */
	public static net.minecraft.client.gui.screens.ChatScreen chatScreen() {
		//#if MC >= 1.21.9
		return new net.minecraft.client.gui.screens.ChatScreen("", false);
		//#else
		//$ return new net.minecraft.client.gui.screens.ChatScreen("");
		//#endif
	}

	//#if MC >= 1.21.9
	/** A font of our resources, for Style.withFont. */
	public static net.minecraft.network.chat.FontDescription font(net.minecraft.resources.Identifier id) {
		return new net.minecraft.network.chat.FontDescription.Resource(id);
	}
	//#else
	//$ /** A font of our resources, for Style.withFont (before 1.21.9 a font is just its id). */
	//$ public static net.minecraft.resources.Identifier font(net.minecraft.resources.Identifier id) {
	//$ 	return id;
	//$ }
	//#endif
}
