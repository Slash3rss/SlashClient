package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * The game's question about a server's resource pack gets "Ustaw na stałe" under its buttons: ticked
 * and answered yes, the server is kept "for good" (ServerPacks.Mode.KEEP) and its pack saved in the
 * player's resource packs and switched on, so later joins download and load nothing again (KeptPacks).
 */
public final class PackForGood {
	private PackForGood() {}

	/** Each question's tick (kept when the window is resized and the screen laid out again). */
	private static final Map<Screen, boolean[]> ticked = Collections.synchronizedMap(new WeakHashMap<>());

	public static void attach(Minecraft mc, Screen screen) {
		//#if MC >= 1.21
		if (!(screen instanceof ConfirmScreen confirm) || !screen.getClass().getName().contains("PackConfirmScreen") || !KeptPacks.asking()) return;
		boolean[] on = ticked.get(screen);
		if (on == null) {
			on = new boolean[1];
			ticked.put(screen, on);
			// the answer heard first by SlashClient, then by the game as always
			var access = (dev.slash3rss.slashclient.hud.mixin.ConfirmScreenAccessor) confirm;
			var game = access.slashclient$callback();
			boolean[] box = on;
			access.slashclient$setCallback(yes -> {
				KeptPacks.answered(yes, box[0]);
				game.accept(yes);
			});
		}
		// under the lowest button, in the middle
		int below = screen.height / 2;
		for (var child : screen.children()) if (child instanceof Button b) below = Math.max(below, b.getY() + b.getHeight());
		Component label = Component.translatable("slashclient-hud.serverPacks.forGood");
		int w = mc.font.width(label) + 24;
		boolean[] box = on;
		var checkbox = net.minecraft.client.gui.components.Checkbox.builder(label, mc.font).pos(screen.width / 2 - w / 2, below + 6).selected(on[0])
			.onValueChange((c, value) -> box[0] = value)
			.tooltip(net.minecraft.client.gui.components.Tooltip.create(Component.translatable("slashclient-hud.serverPacks.forGoodHint"))).build();
		net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen).add(checkbox);
		//#endif
	}

	/** For the test: ticks the open question's box (as a click on it would). */
	public static boolean tickForTest(Screen screen) {
		boolean[] on = ticked.get(screen);
		if (on == null) return false;
		on[0] = true;
		return true;
	}
}
