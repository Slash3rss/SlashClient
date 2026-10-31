package dev.slash3rss.slashclient.hud.ui;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;

import java.util.ArrayList;
import java.util.List;

/**
 * Servers' windows with a text field (a login with a password, say): Enter in the field presses the
 * window's first button under it ("Zaloguj się"), as in a form on a website. The game has these
 * windows from 1.21.6.
 */
public final class DialogEnter {
	private DialogEnter() {}

	public static void attach(Screen screen) {
		//#if MC >= 1.21.9
		if (!(screen instanceof net.minecraft.client.gui.screens.dialog.DialogScreen<?>)) return;
		net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> !enter(screen, e.key()));
		//#elif MC >= 1.21.6
		//$ if (!(screen instanceof net.minecraft.client.gui.screens.dialog.DialogScreen<?>)) return;
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, key, scancode, mods) -> !enter(screen, key));
		//#endif
	}

	/** True when Enter in a text field pressed the button for it. */
	static boolean enter(Screen screen, int key) {
		if (key != InputConstants.KEY_RETURN && key != InputConstants.KEY_NUMPADENTER) return false;
		// the fields sit in the window's scrolling part: the focus goes down through it
		net.minecraft.client.gui.components.events.GuiEventListener focused = screen.getFocused();
		while (focused instanceof net.minecraft.client.gui.components.events.ContainerEventHandler inner && inner.getFocused() != null) focused = inner.getFocused();
		if (!(focused instanceof EditBox field)) return false;
		List<Button> buttons = new ArrayList<>();
		collect(screen.children(), buttons);
		Button first = null;
		for (Button b : buttons) {
			if (!b.active || !b.visible || b.getY() <= field.getY()) continue;
			if (first == null || b.getY() < first.getY() || b.getY() == first.getY() && b.getX() < first.getX()) first = b;
		}
		if (first == null) return false;
		press(first);
		return true;
	}

	/** Every button of the window, inside its parts too. */
	private static void collect(List<? extends net.minecraft.client.gui.components.events.GuiEventListener> children, List<Button> out) {
		for (var child : children) {
			if (child instanceof Button b) out.add(b);
			else if (child instanceof net.minecraft.client.gui.components.events.ContainerEventHandler inner) collect(inner.children(), out);
		}
	}

	/** Every text field of the window (for the test). */
	static void fields(List<? extends net.minecraft.client.gui.components.events.GuiEventListener> children, List<EditBox> out) {
		for (var child : children) {
			if (child instanceof EditBox b) out.add(b);
			else if (child instanceof net.minecraft.client.gui.components.events.ContainerEventHandler inner) fields(inner.children(), out);
		}
	}

	/** For the test: the middle of the window's first text field, in window pixels (for a click); null without one. */
	public static double[] firstFieldPoint(Screen screen) {
		List<EditBox> found = new ArrayList<>();
		fields(screen.children(), found);
		if (found.isEmpty()) return null;
		EditBox f = found.get(0);
		double scale = Minecraft.getInstance().getWindow().getGuiScale();
		return new double[] { (f.getX() + f.getWidth() / 2.0) * scale, (f.getY() + f.getHeight() / 2.0) * scale };
	}

	private static void press(AbstractWidget button) {
		((Button) button).onPress(
			//#if MC >= 1.21.9
			new net.minecraft.client.input.KeyEvent(InputConstants.KEY_RETURN, 0, 0)
			//#endif
		);
	}
}
