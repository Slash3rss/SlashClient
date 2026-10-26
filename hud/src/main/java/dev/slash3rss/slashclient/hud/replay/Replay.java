package dev.slash3rss.slashclient.hud.replay;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;

import java.util.List;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * Instant replay: a key (F6) shows, in the game, what was on screen during the last seconds. It
 * needs no recorder of its own: it keeps the clips' frames (Clips) for as long as it is set to,
 * and while it is on the frames are taken even with clips off. The viewer is ReplayScreen.
 */
public final class Replay {
	private Replay() {}

	public static KeyMapping key;

	/** Seconds the frame buffer has to hold for the replay (0 while it is off). */
	static int seconds() {
		return SlashHud.config.replay ? Math.max(15, Math.min(60, SlashHud.config.replaySeconds)) : 0;
	}

	public static void tick(Minecraft mc) {
		if (key == null) return;
		while (key.consumeClick()) open(mc);
	}

	/** Opens the viewer on the last seconds in memory, or says why it cannot. */
	public static void open(Minecraft mc) {
		if (!SlashHud.config.replay) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.replay.off"));
			return;
		}
		if (mc.level == null || Compat.screen(mc) instanceof ReplayScreen) return;
		List<Clips.Frame> frames = Clips.recent(seconds());
		if (frames.size() < 10) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.replay.empty"));
			return;
		}
		mc.setScreenAndShow(new ReplayScreen(frames));
	}
}
