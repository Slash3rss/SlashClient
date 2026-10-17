package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.protocol.ping.ServerboundPingRequestPacket;
import net.minecraft.util.Util;

/**
 * The ping to the server, measured: every few seconds a ping packet with the time it was sent, and
 * the server's pong brings that time back. The tab list's number is no good on many servers
 * (proxies send 0, others update it once a minute).
 */
public final class Latency {
	private Latency() {}

	private static final long EVERY_MS = 2000;
	private static volatile int ms = -1;
	private static long sent;

	/** The measured round trip in milliseconds, smoothed a little; -1 before the first answer. */
	public static int ms() {
		return ms;
	}

	static void tick(Minecraft mc) {
		var connection = mc.getConnection();
		if (connection == null || mc.hasSingleplayerServer()) {
			ms = -1;
			return;
		}
		long now = Util.getMillis();
		if (now - sent < EVERY_MS) return;
		sent = now;
		connection.send(new ServerboundPingRequestPacket(now));
	}

	/** A pong from the server (the game's own debug pings come back here too). */
	public static void pong(long time) {
		long rtt = Util.getMillis() - time;
		if (rtt < 0 || rtt > 60_000) return;
		int now = (int) rtt;
		ms = ms < 0 ? now : Math.round(ms * 0.6f + now * 0.4f);
	}
}
