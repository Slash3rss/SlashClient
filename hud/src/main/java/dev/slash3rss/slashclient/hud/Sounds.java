package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.sounds.SoundEvent;

/**
 * Every sound SlashClient plays goes through here: at its module's own volume, times the "all SlashClient sounds"
 * slider, so a player can quiet them all at once (on 1.21.5 and older the game has no "Interface" slider for them).
 */
public final class Sounds {
	private Sounds() {}

	/** The volume (0–1) the last sound was played at, or -1 when it was silenced (for the in-game test). */
	public static float lastVolume = -1;

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
