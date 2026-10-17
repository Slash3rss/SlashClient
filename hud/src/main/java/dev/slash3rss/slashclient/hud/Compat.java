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
	public static <S> void submitModel(net.minecraft.client.renderer.SubmitNodeCollector out, net.minecraft.client.model.Model<? super S> model, S state,
			com.mojang.blaze3d.vertex.PoseStack pose, net.minecraft.client.renderer.rendertype.RenderType type, int light, int overlay, int outline) {
		//#if MC >= 26.3
		out.submitModel(model, state, pose, type, light, overlay, outline);
		//#else
		//$ out.submitModel(model, state, pose, type, light, overlay, outline, null);
		//#endif
	}

	/** Moves an inventory slot's stack into a hotbar slot (as pressing that slot's number over it would). */
	static void swapIntoHotbar(Minecraft mc, net.minecraft.world.entity.player.Player player, int slot, int hotbar) {
		//#if MC >= 26.1
		mc.gameMode.handleContainerInput(player.inventoryMenu.containerId, slot, hotbar, net.minecraft.world.inventory.ContainerInput.SWAP, player);
		//#else
		//$ mc.gameMode.handleInventoryMouseClick(player.inventoryMenu.containerId, slot, hotbar, net.minecraft.world.inventory.ClickType.SWAP, player);
		//#endif
	}

	/** The game's picture of a status effect (the one in the corner of the screen). */
	static net.minecraft.resources.Identifier effectSprite(net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect> effect) {
		//#if MC >= 26.2
		return net.minecraft.client.gui.Hud.getMobEffectSprite(effect);
		//#else
		//$ return net.minecraft.client.gui.Gui.getMobEffectSprite(effect);
		//#endif
	}

	/** Lays a screen out again at its size (its widgets made anew). */
	static void relayout(Screen screen) {
		//#if MC >= 1.21.11
		screen.resize(screen.width, screen.height);
		//#else
		//$ screen.resize(Minecraft.getInstance(), screen.width, screen.height);
		//#endif
	}
}
