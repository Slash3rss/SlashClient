package dev.slash3rss.slashclient.hud;

import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents;
import net.minecraft.client.Minecraft;

/**
 * When the game crashes it ends at once, without the closing that mods save their settings on:
 * whatever the player changed in other mods since was lost. On the way out after a crash the game's
 * own options are saved and the closing is announced to every mod as on a normal close, with a
 * few seconds' limit so a crashed game never hangs on it.
 */
public final class CrashSave {
	private CrashSave() {}

	private static volatile boolean stopped;

	public static void register() {
		ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> stopped = true);
		Runtime.getRuntime().addShutdownHook(new Thread(CrashSave::onExit, "SlashClient crash save"));
	}

	private static void onExit() {
		Minecraft mc = Minecraft.getInstance();
		if (stopped || mc == null) return;
		stopped = true;
		Thread save = new Thread(() -> {
			try {
				mc.options.save();
			} catch (Throwable e) {
				SlashHud.LOG.warn("SlashClient: saving the options after a crash: {}", e.toString());
			}
			try {
				if (SlashHud.config != null) SlashHud.config.save();
			} catch (Throwable e) {
				SlashHud.LOG.warn("SlashClient: saving our settings after a crash: {}", e.toString());
			}
			try {
				ClientLifecycleEvents.CLIENT_STOPPING.invoker().onClientStopping(mc);
			} catch (Throwable e) {
				SlashHud.LOG.warn("SlashClient: mods' closing after a crash: {}", e.toString());
			}
		}, "SlashClient crash save worker");
		save.setDaemon(true);
		save.start();
		try {
			save.join(5000);
		} catch (InterruptedException ignored) {
		}
		SlashHud.LOG.info("SlashClient: settings saved after a crash{}", save.isAlive() ? " (not all within 5 s)" : "");
	}
}
