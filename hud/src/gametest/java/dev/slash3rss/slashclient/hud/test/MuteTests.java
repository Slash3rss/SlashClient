package dev.slash3rss.slashclient.hud.test;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.minecraft.sounds.SoundSource;

/** The test games play silently: the master volume at 0 (not saved, only for the run). */
public class MuteTests implements ClientModInitializer {
	@Override
	public void onInitializeClient() {
		ClientLifecycleEvents.CLIENT_STARTED.register(mc -> mc.options.getSoundSourceOptionInstance(SoundSource.MASTER).set(0.0));
	}
}
