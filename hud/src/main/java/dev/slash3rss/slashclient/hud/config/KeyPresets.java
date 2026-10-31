package dev.slash3rss.slashclient.hud.config;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Saved sets of every key (the game's, SlashClient's and other mods'): one for PvP, one for
 * building, and a click (or the "next preset" key) puts one back. Kept in a file of its own, so a
 * HUD share code does not carry them. A key a preset does not know (a mod added later) stays as it is.
 */
public final class KeyPresets {
	private KeyPresets() {}

	public static final int MAX = 30, NAME_MAX = 24;

	public static final class Preset {
		public String name = "";
		/** A binding's name → its key, as options.txt writes them ("key.jump" → "key.keyboard.space"). */
		public Map<String, String> keys = new LinkedHashMap<>();
	}

	private static final class Saved {
		List<Preset> presets = new ArrayList<>();
		/** The one last put back, shown as in use. */
		String active = "";
	}

	/** Switches to the next preset; no key by default. */
	public static KeyMapping key;

	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-key-presets.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Saved saved;

	private static Saved saved() {
		if (saved == null) {
			try {
				if (Files.exists(FILE)) saved = GSON.fromJson(Files.readString(FILE), Saved.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("Nie udało się wczytać {}: {}", FILE, e.toString());
			}
			if (saved == null) saved = new Saved();
			if (saved.presets == null) saved.presets = new ArrayList<>();
			saved.presets.removeIf(p -> p == null || p.name == null || p.name.isBlank() || p.keys == null);
			if (saved.active == null) saved.active = "";
		}
		return saved;
	}

	private static void write() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(saved()));
		} catch (Exception e) {
			SlashHud.LOG.warn("Nie udało się zapisać {}: {}", FILE, e.toString());
		}
	}

	public static List<Preset> all() {
		return List.copyOf(saved().presets);
	}

	public static String active() {
		return saved().active;
	}

	private static Preset find(String name) {
		for (Preset p : saved().presets) if (p.name.equalsIgnoreCase(name.trim())) return p;
		return null;
	}

	/** Whether a name can be saved: not empty, and a new one only while there is room. */
	public static boolean canSave(String name) {
		String n = name.trim();
		return !n.isEmpty() && (find(n) != null || saved().presets.size() < MAX);
	}

	/** Every key as it is now under this name (one of the same name is written over); it is the one in use. */
	public static boolean save(Minecraft mc, String name) {
		String n = name.trim();
		if (n.length() > NAME_MAX) n = n.substring(0, NAME_MAX);
		if (!canSave(n)) return false;
		Preset p = find(n);
		if (p == null) {
			p = new Preset();
			saved().presets.add(p);
		}
		p.name = n;
		p.keys = new LinkedHashMap<>();
		for (KeyMapping k : mc.options.keyMappings) p.keys.put(k.getName(), k.saveString());
		saved().active = n;
		write();
		return true;
	}

	/** Puts a preset's keys back; how many keys changed (-1 when there is no such preset). */
	public static int apply(Minecraft mc, String name) {
		Preset p = find(name);
		if (p == null) return -1;
		int changed = 0;
		for (KeyMapping k : mc.options.keyMappings) {
			String to = p.keys.get(k.getName());
			if (to == null || to.equals(k.saveString())) continue;
			k.setKey(InputConstants.getKey(to));
			changed++;
		}
		KeyMapping.resetMapping();
		mc.options.save();
		saved().active = p.name;
		write();
		return changed;
	}

	public static void delete(String name) {
		Preset p = find(name);
		if (p == null) return;
		saved().presets.remove(p);
		if (p.name.equalsIgnoreCase(saved().active)) saved().active = "";
		write();
	}

	/** The key: the preset after the one in use, said over the hotbar. */
	public static void tick(Minecraft mc) {
		while (key != null && key.consumeClick()) {
			List<Preset> list = saved().presets;
			if (list.isEmpty()) {
				Compat.overlay(mc, Component.translatable("slashclient-hud.keyPresets.empty"));
				continue;
			}
			Preset now = find(saved().active);
			Preset next = list.get(now == null ? 0 : (list.indexOf(now) + 1) % list.size());
			apply(mc, next.name);
			Compat.overlay(mc, Component.translatable("slashclient-hud.keyPresets.loaded", next.name));
		}
	}

	/** For the tests: forgets what is in memory, so the file is read again. */
	public static void reload() {
		saved = null;
	}
}
