// SkyUp is played on 26.3: its pack is kept there only (and the client gametests are from 1.21.4)
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import com.sun.net.httpserver.HttpServer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;

import java.io.ByteArrayOutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/** SkyUp's pack in the resource packs, for the in-game test (src/gametest GameServerPacks): a pack served locally. */
public final class SkyPackTestHooks {
	private SkyPackTestHooks() {}

	private static HttpServer server;
	private static volatile byte[] pack = new byte[0];
	private static volatile String sha = "";

	/** Serves a pack of this "version" (its description) at a local address; that address. */
	public static String serve(String version) throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		try (ZipOutputStream zip = new ZipOutputStream(out)) {
			zip.putNextEntry(new ZipEntry("pack.mcmeta"));
			zip.write(("{\"pack\":{\"pack_format\":99,\"description\":\"SkyUp " + version + "\"}}").getBytes(StandardCharsets.UTF_8));
			zip.closeEntry();
		}
		pack = out.toByteArray();
		sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(pack));
		if (server == null) {
			server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
			server.createContext("/skyup.zip", ex -> {
				byte[] body = pack;
				ex.sendResponseHeaders(200, body.length);
				ex.getResponseBody().write(body);
				ex.close();
			});
			server.start();
		}
		return "http://127.0.0.1:" + server.getAddress().getPort() + "/skyup.zip";
	}

	/** The test world counts as SkyUp (or no longer). */
	public static void skyUp(boolean on) {
		KeptPacks.testSkyUp = on;
	}

	public static String sha() {
		return sha;
	}

	/** SkyUp offering its pack (by address and SHA-1): whether the copy stands in for it. */
	public static boolean offer(String url) {
		return KeptPacks.covers(new ServerData("SkyUp", "skyup.pl", ServerData.Type.OTHER), ServerPacks.Mode.PROMPT, url, sha);
	}

	public static boolean fetching() {
		return KeptPacks.fetchingForTest();
	}

	/** The copy's state: missing, or its SHA-1 matches the pack served now ("current") or not ("old"). */
	public static String copy() throws Exception {
		var file = KeptPacks.dir().resolve(KeptPacks.SKYUP);
		if (!Files.isRegularFile(file)) return "missing";
		String got = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(Files.readAllBytes(file)));
		return got.equals(sha) ? "current" : "old";
	}

	/** A new copy waiting for the next start (the old one in use). */
	public static boolean waiting() {
		return Files.isRegularFile(KeptPacks.dir().resolve(KeptPacks.SKYUP + ".next"));
	}

	/** Whether the copy is switched on in the game's resource packs. */
	public static boolean selected() {
		return KeptPacks.selected(KeptPacks.SKYUP);
	}

	/** "Keep SkyUp's pack for good?" answered, as its button would; false when the question is not open. */
	public static boolean answerQuestion(boolean yes) {
		if (!(Compat.screen(Minecraft.getInstance()) instanceof net.minecraft.client.gui.screens.ConfirmScreen screen)) return false;
		String want = net.minecraft.network.chat.Component.translatable(yes ? "slashclient-hud.skyPack.askYes" : "slashclient-hud.skyPack.askNo").getString();
		for (var child : screen.children()) {
			if (child instanceof net.minecraft.client.gui.components.Button b && b.getMessage().getString().equals(want)) {
				//#if MC >= 1.21.9
				b.onPress(new net.minecraft.client.input.KeyEvent(com.mojang.blaze3d.platform.InputConstants.KEY_RETURN, 0, 0));
				//#else
				//$ b.onPress();
				//#endif
				return true;
			}
		}
		return false;
	}

	/** Switched on in the game's resource packs (and loaded), or off again. */
	public static void select(boolean on) {
		var repo = Minecraft.getInstance().getResourcePackRepository();
		repo.reload();
		var ids = new java.util.ArrayList<>(repo.getSelectedIds());
		ids.remove(KeptPacks.id(KeptPacks.SKYUP));
		if (on) ids.add(KeptPacks.id(KeptPacks.SKYUP));
		repo.setSelected(ids);
	}

	/** Stops the local pack server (its thread would keep the game from closing); SkyUp asked about again. */
	public static void stop() {
		ServerPacks.remember("skyup.pl", null, ServerPacks.Mode.PROMPT);
		if (server != null) server.stop(0);
		server = null;
	}
}
//#endif
