package dev.slash3rss.slashclient.hud;

import net.minecraft.client.multiplayer.ServerData;

import java.util.List;
import java.util.Locale;

/**
 * SkyUp.pl always sits first in the multiplayer list: it is added when missing, moved to
 * the top when elsewhere, and cannot be edited, deleted or moved (see the server list mixins).
 */
public final class PinnedServer {
	private PinnedServer() {}

	public static final String NAME = "SkyUp.pl";
	public static final String IP = "skyup.pl";

	public static boolean is(ServerData server) {
		if (server == null || server.ip == null) return false;
		String ip = server.ip.trim().toLowerCase(Locale.ROOT);
		return ip.equals(IP) || ip.equals(IP + ":25565");
	}

	/** Puts SkyUp.pl at the top of `servers`, adding it when it is not there. */
	public static void ensure(List<ServerData> servers) {
		ServerData found = null;
		for (ServerData s : servers) {
			if (is(s)) {
				found = s;
				break;
			}
		}
		if (found == null) found = new ServerData(NAME, IP, ServerData.Type.OTHER);
		else servers.remove(found);
		servers.add(0, found);
	}

	/** Whether swapping these two positions would move the pinned server. */
	public static boolean blocksSwap(List<ServerData> servers, int a, int b) {
		return touches(servers, a) || touches(servers, b);
	}

	private static boolean touches(List<ServerData> servers, int i) {
		return i >= 0 && i < servers.size() && is(servers.get(i));
	}
}
