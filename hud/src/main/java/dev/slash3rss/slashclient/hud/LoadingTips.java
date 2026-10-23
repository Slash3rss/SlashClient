package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.TextColor;

import java.util.ArrayList;
import java.util.List;
import java.util.function.BooleanSupplier;

/**
 * The short tips under SlashClient's loading screen. A tip about a key names the key as it is
 * bound now (rebound keys show their new name) and is left out while that key is unbound; tips
 * about something that has to be switched on say so.
 */
public final class LoadingTips {
	private LoadingTips() {}

	/** `key` is the key mapping's name, or null for a tip without one; `when` says if the tip is true now. */
	private record Tip(String lang, String key, BooleanSupplier when) {}

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	private static final List<Tip> TIPS = List.of(
		new Tip("edit", "key.slashclient-hud.edit", () -> true),
		new Tip("replay", "key.slashclient-hud.replay", () -> true),
		new Tip("clip", "key.slashclient-hud.clip", () -> true),
		new Tip("zoom", "key.slashclient-hud.zoom", () -> cfg().zoom),
		new Tip("friends", "key.slashclient-hud.friends", () -> true),
		new Tip("search", null, () -> true),
		new Tip("waypoints", "key.slashclient-hud.waypoints", () -> cfg().waypoints),
		new Tip("emote", "key.slashclient-hud.emote", () -> true),
		new Tip("shulker", null, () -> cfg().shulkerPreview),
		new Tip("lightOverlay", "key.slashclient-hud.lightOverlay", () -> true),
		new Tip("sort", "key.slashclient-hud.sort", () -> cfg().inventorySort),
		new Tip("share", null, () -> true),
		new Tip("slotLock", "key.slashclient-hud.slotLock", () -> cfg().slotLock),
		new Tip("worldMap", "key.slashclient-hud.dungeonMap", () -> cfg().worldMap),
		new Tip("cosmetics", null, () -> cfg().customMenu),
		new Tip("freelook", "key.slashclient-hud.freelook", () -> true),
		new Tip("move", null, () -> cfg().customServerList),
		new Tip("cameraDistance", "key.slashclient-hud.cameraDistance", () -> cfg().cameraDistanceKey),
		new Tip("minimap", null, () -> true),
		new Tip("toggle", null, () -> true));

	/** How many tips there are in all (some may be left out at a time). */
	public static int count() {
		return TIPS.size();
	}

	/** The tips true right now, ready to draw, in their order. */
	public static List<Component> current() {
		List<Component> out = new ArrayList<>();
		if (cfg() == null) return out;
		Minecraft mc = Minecraft.getInstance();
		for (Tip t : TIPS) {
			if (!t.when().getAsBoolean()) continue;
			String lang = "slashclient-hud.loading.tip." + t.lang();
			if (t.key() == null) {
				out.add(Ui.tr(lang));
				continue;
			}
			KeyMapping key = find(mc, t.key());
			if (key == null || key.isUnbound()) continue;
			Component name = Ui.bold(key.getTranslatedKeyMessage().getString()).withStyle(s -> s.withColor(TextColor.fromRgb(Ui.ACCENT_LIGHT & 0xFFFFFF)));
			out.add(Ui.tr(lang, name));
		}
		return out;
	}

	private static KeyMapping find(Minecraft mc, String name) {
		for (KeyMapping k : mc.options.keyMappings) if (k.getName().equals(name)) return k;
		return null;
	}
}
