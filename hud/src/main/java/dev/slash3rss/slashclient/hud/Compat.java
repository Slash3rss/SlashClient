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
}
