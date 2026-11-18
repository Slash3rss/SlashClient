package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.NarratorStatus;
import net.minecraft.network.chat.Component;

/**
 * The game's narrator left on (Ctrl+B switches it, easily by accident) reads every chat line out
 * through Windows' speech on the game's own thread: on a busy server that is a stall of tens of
 * milliseconds again and again, also with the sound muted, when nobody hears it is on. A toast says
 * so once a game run, on joining a world or a server.
 */
public final class NarratorNotice {
	private static boolean told;

	private NarratorNotice() {}

	/** On joining: the toast when the narrator speaks (and this run has not said so yet); whether it was shown. */
	public static boolean joined(Minecraft mc) {
		if (told || !on(mc)) return false;
		told = true;
		dev.slash3rss.slashclient.hud.social.Social.toast(Component.translatable("slashclient-hud.narrator.title").getString(),
			Component.translatable("slashclient-hud.narrator.text").getString(), "info");
		return true;
	}

	/** The narrator is switched on and this computer has a voice for it (without one it costs nothing). */
	static boolean on(Minecraft mc) {
		return mc.options.narrator().get() != NarratorStatus.OFF && mc.getNarrator().isActive();
	}

	/** For the tests: as at the game's start, not told yet. */
	public static void resetForTest() {
		told = false;
	}
}
