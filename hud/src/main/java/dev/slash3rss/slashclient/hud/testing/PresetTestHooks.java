package dev.slash3rss.slashclient.hud.testing;

import com.google.gson.Gson;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.config.HudPresets;
import dev.slash3rss.slashclient.hud.gamehud.GameParts;
import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.ui.HudEditScreen;
import net.minecraft.client.Minecraft;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** For the in-game test of the ready layouts (GamePresets). */
public final class PresetTestHooks {
	private PresetTestHooks() {}

	/**
	 * Places that two modules share on purpose: they never show at once (no summons in a dungeon), or a
	 * toast for a moment over the effects is all right.
	 */
	private static final Set<String> SHARED = Set.of("dungeonmap|skyshaman", "dungeonloot|skyshaman", "dungeonloot|dungeonmap", "effects|toasts");

	public static void reset() {
		HudPresets.clearForTest();
	}

	/** The modules as the config file holds them, for comparing. */
	public static String modules() {
		return new Gson().toJson(SlashHud.config.modules);
	}

	public static boolean enabled(String id) {
		HudConfig.Placement p = SlashHud.config.modules.get(id);
		return p != null && p.enabled;
	}

	/** True when this point of the Share page can be clicked; else the page is scrolled a step towards it (drawn again on the next frame). */
	public static boolean scrollStep(double[] at) {
		HudEditScreen screen = (HudEditScreen) Compat.screen(Minecraft.getInstance());
		if (at == null) return false;
		if (screen.onSharePage(at)) return true;
		double step = at[1] < Minecraft.getInstance().getWindow().getGuiScaledHeight() / 2.0 ? 1 : -1;
		//#if MC >= 1.20.2
		screen.mouseScrolled(at[0], at[1], 0, step);
		//#else
		//$ screen.mouseScrolled(at[0], at[1], step);
		//#endif
		return false;
	}

	/** Types a name in the Share page's field for a new preset. */
	public static void typeName(String name) {
		((HudEditScreen) Compat.screen(Minecraft.getInstance())).presetNameForTest(name);
	}

	/**
	 * The switched-on modules whose boxes lie on each other or on one of the game's parts (the chat, the
	 * scoreboard, the player list, the titles, …: as big as the editor's samples of them) on this
	 * screen, as "a|b" and their boxes; empty when none. The game's parts among themselves are the game's.
	 */
	public static List<String> overlaps() {
		Minecraft mc = Minecraft.getInstance();
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		List<String> ids = new ArrayList<>();
		List<int[]> boxes = new ArrayList<>();
		for (HudModule m : SlashHud.MODULES) {
			if (!enabled(m.id())) continue;
			HudConfig.Placement p = SlashHud.config.placement(m.id());
			int[] size = SlashHud.size(m, mc, p);
			if (size[0] <= 0 || size[1] <= 0) continue;
			int[] at = SlashHud.position(p, size[0], size[1], sw, sh);
			ids.add(m.id());
			boxes.add(new int[] { at[0], at[1], size[0], size[1] });
		}
		List<String> out = new ArrayList<>();
		for (int i = 0; i < ids.size(); i++) for (int j = i + 1; j < ids.size(); j++) {
			int[] a = boxes.get(i), b = boxes.get(j);
			boolean over = a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
			String pair = ids.get(i).compareTo(ids.get(j)) < 0 ? ids.get(i) + "|" + ids.get(j) : ids.get(j) + "|" + ids.get(i);
			boolean game = GameParts.IDS.contains(ids.get(i)) && GameParts.IDS.contains(ids.get(j));
			if (over && !game && !SHARED.contains(pair)) out.add(pair + " " + java.util.Arrays.toString(a) + java.util.Arrays.toString(b));
		}
		return out;
	}
}
