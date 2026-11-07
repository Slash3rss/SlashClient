package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.core.Holder;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;

/**
 * Every sound SlashClient plays goes through here: at its module's own volume, times the "all SlashClient sounds"
 * slider, so a player can quiet them all at once (on 1.21.5 and older the game has no "Interface" slider for them).
 * Also the longer list of the game's sounds a notice can ring with, the same in every module that has a sound.
 */
public final class Sounds {
	private Sounds() {}

	/** The volume (0–1) the last sound was played at, or -1 when it was silenced (for the in-game test). */
	public static float lastVolume = -1;

	/**
	 * The sounds every notice can pick besides its module's own first ones (which keep their names, so a saved
	 * choice stays): note blocks, the game's chimes and a few friendly creatures, in the order settings cycle.
	 */
	public static final String[] MORE = { "bass", "flute", "xylophone", "iron_xylophone", "cow_bell", "bit", "banjo", "guitar",
		"didgeridoo", "levelup", "pop", "bell_block", "villager", "toast", "anvil", "teleport", "firework", "trident" };

	/** For notices with no sounds of their own before (the tool warning, SlashClient's notifications): as chat's, plus a bottle. */
	public static final String[] NOTICE = with("none", "bell", "pling", "chime", "harp", "orb", "amethyst", "hat", "bottle");

	/** A module's own sounds, then MORE (without those it has already). */
	public static String[] with(String... own) {
		java.util.LinkedHashSet<String> all = new java.util.LinkedHashSet<>(java.util.List.of(own));
		all.addAll(java.util.List.of(MORE));
		return all.toArray(String[]::new);
	}

	/** A list of sounds with the player's own files (SoundFiles) right after its first one, where they are quick to reach. */
	public static String[] withFiles(String[] list) {
		java.util.List<String> files = SoundFiles.offered();
		if (files.isEmpty() || list.length == 0) return list;
		java.util.List<String> out = new java.util.ArrayList<>(list.length + files.size());
		out.add(list[0]);
		out.addAll(files);
		for (int i = 1; i < list.length; i++) out.add(list[i]);
		return out.toArray(String[]::new);
	}

	/** A saved choice kept when it is one of `allowed` or a file of the player's (even one gone for now: it rings the bell). */
	public static String valid(String value, String[] allowed) {
		if (value != null && value.startsWith(SoundFiles.PREFIX)) return value;
		for (String a : allowed) if (a.equals(value)) return value;
		return allowed[0];
	}

	/** How a choice is named in the settings: a file by its name, the rest by their translation under `prefix`. */
	public static net.minecraft.network.chat.Component label(String prefix, String value) {
		if (value.startsWith(SoundFiles.PREFIX)) return net.minecraft.network.chat.Component.literal("♪ " + SoundFiles.label(value));
		return net.minecraft.network.chat.Component.translatable(prefix + value);
	}

	/** A file of the player's at `percent`; the usual bell when the file is gone or cannot be read. */
	public static void playFile(String value, float pitch, float percent) {
		float all = SlashHud.config == null ? 1f : SlashHud.config.soundVolume / 100f;
		float volume = percent / 100f * all;
		if (volume <= 0f) {
			lastVolume = -1;
			return;
		}
		if (SoundFiles.play(value, pitch, volume)) lastVolume = volume;
		else play("bell", percent);
	}

	/** One of the shared sounds by its name, or null when the name is not one of them. */
	public static SoundEvent event(String name) {
		Object s = switch (name) {
			case "bell" -> SoundEvents.NOTE_BLOCK_BELL;
			case "pling" -> SoundEvents.NOTE_BLOCK_PLING;
			case "harp" -> SoundEvents.NOTE_BLOCK_HARP;
			case "hat" -> SoundEvents.NOTE_BLOCK_HAT;
			case "bass" -> SoundEvents.NOTE_BLOCK_BASS;
			case "flute" -> SoundEvents.NOTE_BLOCK_FLUTE;
			case "xylophone" -> SoundEvents.NOTE_BLOCK_XYLOPHONE;
			case "iron_xylophone" -> SoundEvents.NOTE_BLOCK_IRON_XYLOPHONE;
			case "cow_bell" -> SoundEvents.NOTE_BLOCK_COW_BELL;
			case "bit" -> SoundEvents.NOTE_BLOCK_BIT;
			case "banjo" -> SoundEvents.NOTE_BLOCK_BANJO;
			case "guitar" -> SoundEvents.NOTE_BLOCK_GUITAR;
			case "didgeridoo" -> SoundEvents.NOTE_BLOCK_DIDGERIDOO;
			case "orb" -> SoundEvents.EXPERIENCE_ORB_PICKUP;
			case "amethyst" -> SoundEvents.AMETHYST_BLOCK_CHIME;
			case "bottle" -> SoundEvents.BOTTLE_EMPTY;
			case "levelup" -> SoundEvents.PLAYER_LEVELUP;
			case "pop" -> SoundEvents.ITEM_PICKUP;
			case "bell_block" -> SoundEvents.BELL_BLOCK;
			case "villager" -> SoundEvents.VILLAGER_YES;
			case "toast" -> SoundEvents.UI_TOAST_IN;
			case "anvil" -> SoundEvents.ANVIL_LAND;
			case "teleport" -> SoundEvents.ENDERMAN_TELEPORT;
			case "firework" -> SoundEvents.FIREWORK_ROCKET_TWINKLE;
			case "trident" -> SoundEvents.TRIDENT_RETURN;
			default -> null;
		};
		// some are held by the registry (note blocks), some are the sound itself, depending on the sound and the version
		return s instanceof Holder<?> h ? (SoundEvent) h.value() : (SoundEvent) s;
	}

	/** The pitch a shared sound rings at: note blocks a little higher, like a chime; the rest as the game plays them. */
	public static float pitch(String name) {
		return switch (name) {
			case "bell", "pling", "harp", "hat", "flute", "xylophone", "iron_xylophone", "cow_bell", "bit", "banjo", "guitar" -> 1.4f;
			case "pop" -> 1.6f;
			case "levelup", "anvil", "bell_block" -> 1.2f;
			default -> 1f;
		};
	}

	/** Plays a shared sound by its name at its own pitch; nothing for "none" or an unknown name. */
	public static void play(String name, float percent) {
		if (name.startsWith(SoundFiles.PREFIX)) {
			playFile(name, 1f, percent);
			return;
		}
		SoundEvent s = event(name);
		if (s != null) play(s, pitch(name), percent);
	}

	/** Plays `event` at `percent` (0–100) of its full volume, scaled by the all-sounds slider. */
	public static void play(SoundEvent event, float pitch, float percent) {
		float all = SlashHud.config == null ? 1f : SlashHud.config.soundVolume / 100f;
		float volume = percent / 100f * all;
		if (volume <= 0f) {
			lastVolume = -1;
			return;
		}
		lastVolume = volume;
		Minecraft.getInstance().getSoundManager().play(SimpleSoundInstance.forUI(event, pitch, volume));
	}
}
