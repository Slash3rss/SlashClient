package dev.slash3rss.slashclient.hud.servers;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.network.chat.Component;

import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;

/**
 * A server's resource pack kept in the player's own resource packs, so it is not downloaded and
 * loaded again at every join:
 * - "Na stałe" (ServerPacks.Mode.KEEP, any server): the pack is saved as "Serwer <address>.zip",
 *   switched on for good and loaded once; at the next joins the server's offer is answered as loaded.
 * - SkyUp (a setting, on by default): its pack is kept as "SkyUp.zip" for the player to switch on
 *   when they like; once it is on, SkyUp's offer is not asked about either.
 *
 * Each offer checks the copy against the pack offered (the SHA-1 the server gives, else the address
 * it came from) and downloads it again when it differs; until then the server's pack covers the
 * session. A copy in use is switched off (the game lets go of its file), replaced, and switched on
 * again. Should the file stay locked even so, the new one waits next to it (".next") and takes its
 * place at the next start.
 */
public final class KeptPacks {
	private KeptPacks() {}

	public static final String SKYUP = "SkyUp.zip";
	private static final Path META = FabricLoader.getInstance().getConfigDir().resolve("slashclient-kept-packs.json");
	private static final Gson GSON = new Gson();
	/** Copies being downloaded, by file name. */
	private static final Set<String> fetching = ConcurrentHashMap.newKeySet();
	/** The last file checked and its SHA-1, so a pack of tens of MB is not read at every offer. */
	private static String checkedKey = "", checkedSha = "";
	/** For the test: the test world counts as SkyUp. */
	public static volatile boolean testSkyUp;

	/** The game folder's resourcepacks (the game's own place for them), also before the game is up. */
	public static Path dir() {
		return FabricLoader.getInstance().getGameDir().resolve("resourcepacks");
	}

	static boolean skyUp(ServerData server) {
		return testSkyUp || server != null && server.ip != null && server.ip.toLowerCase(Locale.ROOT).contains("skyup.pl");
	}

	/** The file a server's pack is kept in: SkyUp's own name, else one from its address; null when it is not kept. */
	static String fileFor(ServerData server, ServerPacks.Mode mode) {
		if (mode == ServerPacks.Mode.KEEP && skyUp(server)) return SKYUP;
		if (mode == ServerPacks.Mode.KEEP && server != null && server.ip != null) {
			String host = PartnerServers.normalize(server.ip).replaceAll("[^\\w.-]", "_");
			return "Serwer " + host + ".zip";
		}
		if (skyUp(server) && SlashHud.config != null && SlashHud.config.skyPackLocal) return SKYUP;
		return null;
	}

	/**
	 * A server offers its pack: the copy brought up to date (in the background), and whether it
	 * already stands in for the offer (current and switched on): then nothing is downloaded or asked.
	 * Kept "for good", a current copy that was switched off is switched on again.
	 */
	public static boolean covers(ServerData server, ServerPacks.Mode mode, String url, String hash) {
		String name = fileFor(server, mode);
		if (name == null) return false;
		boolean keep = mode == ServerPacks.Mode.KEEP;
		if (!current(name, url, hash)) {
			fetch(name, url, hash, keep);
			return false;
		}
		if (selected(name)) return true;
		if (!keep) return false;
		select(name);
		return true;
	}

	public static String id(String name) {
		return "file/" + name;
	}

	/** A pack the game is asking about now: its server, address and SHA-1. */
	record Offer(ServerData server, String url, String hash) {}

	/** The packs of the game's open question, for its "Ustaw na stałe". */
	private static final java.util.List<Offer> offers = new java.util.concurrent.CopyOnWriteArrayList<>();

	/** The game asks about this pack (with others of the same server, maybe). */
	public static void offered(ServerData server, String url, String hash) {
		offers.add(new Offer(server, url, hash));
	}

	/**
	 * The game's pack question answered: with "Ustaw na stałe" ticked and yes, the server is kept
	 * "for good" and its packs saved; this time the game loads the server's own (two loads at once would
	 * get in each other's way), but the copy is switched on quietly beside it, so leaving the server keeps
	 * the pack on (and from the next join the copy stands in for the server's). Either way the question's
	 * packs are forgotten.
	 */
	public static void answered(boolean yes, boolean forGood) {
		java.util.List<Offer> asked = java.util.List.copyOf(offers);
		offers.clear();
		if (!yes || !forGood || asked.isEmpty()) return;
		ServerPacks.keep(asked.get(0).server());
		for (Offer o : asked) {
			String name = fileFor(o.server(), ServerPacks.Mode.KEEP);
			if (name == null) continue;
			if (current(name, o.url(), o.hash())) selectQuietly(name);
			else {
				quietly.add(name);
				fetch(name, o.url(), o.hash(), false);
			}
		}
	}

	/** Copies to switch on quietly once downloaded. */
	private static final java.util.Set<String> quietly = java.util.concurrent.ConcurrentHashMap.newKeySet();

	/**
	 * Switches the copy on without loading the packs now (the server's own is loading or loaded): it
	 * is in the options (saved) and the selection, so leaving the server, when the game drops the server's
	 * pack and loads the packs again, keeps it on.
	 */
	static void selectQuietly(String name) {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			var repo = mc.getResourcePackRepository();
			repo.reload();
			if (!repo.getAvailableIds().contains(id(name))) return;
			if (!mc.options.resourcePacks.contains(id(name))) {
				mc.options.resourcePacks.add(id(name));
				mc.options.save();
			}
			if (!repo.getSelectedIds().contains(id(name))) {
				var ids = new java.util.ArrayList<>(repo.getSelectedIds());
				ids.add(id(name));
				repo.setSelected(ids);
			}
		});
	}

	/** Whether the game's question is about packs this can keep (so it gets the checkbox). */
	public static boolean asking() {
		return !offers.isEmpty();
	}

	/** Switched on in the game's resource packs (as loaded now). */
	public static boolean selected(String name) {
		return Minecraft.getInstance().getResourcePackRepository().getSelectedIds().contains(id(name));
	}

	/** Switches the copy on (last, so it lies over the others) and loads the packs again; on the game's thread. */
	static void select(String name) {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			var repo = mc.getResourcePackRepository();
			repo.reload();
			if (!repo.getAvailableIds().contains(id(name)) || repo.getSelectedIds().contains(id(name))) return;
			var ids = new java.util.ArrayList<>(repo.getSelectedIds());
			ids.add(id(name));
			repo.setSelected(ids);
			// the options keep it (and save it); the packs load again with it
			mc.options.updateResourcePacks(repo);
		});
	}

	/** Whether the copy is the pack the server offers now. */
	static boolean current(String name, String url, String hash) {
		Path file = dir().resolve(name);
		if (!Files.isRegularFile(file)) return false;
		try {
			if (hash != null && !hash.isBlank()) return hash.strip().equalsIgnoreCase(sha1(file));
			JsonObject meta = GSON.fromJson(Files.readString(META), JsonObject.class);
			return meta != null && meta.has(name) && url.equals(meta.getAsJsonObject(name).get("url").getAsString());
		} catch (Exception e) {
			return false;
		}
	}

	private static synchronized String sha1(Path file) throws Exception {
		String key = file + "|" + Files.size(file) + "@" + Files.getLastModifiedTime(file).toMillis();
		if (key.equals(checkedKey)) return checkedSha;
		MessageDigest md = MessageDigest.getInstance("SHA-1");
		try (InputStream in = Files.newInputStream(file)) {
			byte[] buf = new byte[1 << 16];
			for (int n; (n = in.read(buf)) > 0;) md.update(buf, 0, n);
		}
		checkedKey = key;
		checkedSha = HexFormat.of().formatHex(md.digest());
		return checkedSha;
	}

	/** Downloads the offered pack into the resource packs (one at a time per file), checked against its SHA-1. */
	static void fetch(String name, String url, String hash, boolean keep) {
		if (!fetching.add(name)) return;
		Thread t = new Thread(() -> {
			try {
				HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NORMAL).connectTimeout(Duration.ofSeconds(15)).build();
				HttpResponse<byte[]> res = http.send(HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(3))
					.header("User-Agent", "SlashClient").GET().build(), HttpResponse.BodyHandlers.ofByteArray());
				if (res.statusCode() != 200) throw new IllegalStateException("HTTP " + res.statusCode());
				byte[] data = res.body();
				if (hash != null && !hash.isBlank()) {
					String got = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-1").digest(data));
					if (!got.equalsIgnoreCase(hash.strip())) throw new IllegalStateException("SHA-1 " + got + " ≠ " + hash);
				}
				Path dir = dir();
				Files.createDirectories(dir);
				Path part = dir.resolve(name + ".part"), file = dir.resolve(name);
				Files.write(part, data);
				boolean inUse = false;
				try {
					Files.move(part, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
				} catch (Exception locked) {
					// the copy is loaded (Windows keeps it open): it is switched off, replaced and switched on below
					Files.move(part, dir.resolve(name + ".next"), StandardCopyOption.REPLACE_EXISTING);
					inUse = true;
				}
				remember(name, url, hash);
				Minecraft mc = Minecraft.getInstance();
				if (inUse) {
					swapInUse(name);
					return;
				}
				// kept for good: switched on now, so the next join needs nothing (quietly while the server's own is in use)
				if (keep) select(name);
				else if (quietly.remove(name)) selectQuietly(name);
				toast(name, keep ? "slashclient-hud.keptPack.kept" : selected(name) ? "slashclient-hud.keptPack.updated" : "slashclient-hud.keptPack.saved");
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: keeping the server's pack {}: {}", name, e.toString());
			} finally {
				fetching.remove(name);
			}
		}, "SlashClient kept pack");
		t.setDaemon(true);
		t.start();
	}

	private static void toast(String name, String key) {
		dev.slash3rss.slashclient.hud.social.Social.toast(Component.translatable("slashclient-hud.keptPack.title", name.replaceFirst("\\.zip$", "")).getString(),
			Component.translatable(key).getString(), "m-server");
	}

	/**
	 * The copy in use replaced by the new one waiting beside it: switched off and the packs loaded
	 * without it (so the game lets go of its file), the file replaced, then switched on again and the
	 * packs loaded with the new one. The options are not saved in between, so a crash leaves it on.
	 */
	static void swapInUse(String name) {
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			var repo = mc.getResourcePackRepository();
			var ids = new java.util.ArrayList<>(repo.getSelectedIds());
			int at = ids.indexOf(id(name));
			if (at < 0) {
				// not on (any more): only the file is replaced
				replaceWaiting(name);
				return;
			}
			ids.remove(at);
			repo.setSelected(ids);
			mc.reloadResourcePacks().thenRun(() -> mc.execute(() -> {
				boolean replaced = replaceWaiting(name);
				repo.reload();
				var back = new java.util.ArrayList<>(repo.getSelectedIds());
				if (repo.getAvailableIds().contains(id(name))) back.add(Math.min(at, back.size()), id(name));
				repo.setSelected(back);
				mc.options.updateResourcePacks(repo);
				toast(name, replaced ? "slashclient-hud.keptPack.updated" : "slashclient-hud.keptPack.later");
			}));
		});
	}

	/** The new copy waiting beside the old one put in its place; false when the old file is still held. */
	private static boolean replaceWaiting(String name) {
		Path next = dir().resolve(name + ".next");
		try {
			if (Files.isRegularFile(next)) Files.move(next, dir().resolve(name), StandardCopyOption.REPLACE_EXISTING);
			return true;
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: replacing the kept pack {}: {}", name, e.toString());
			return false;
		}
	}

	private static synchronized void remember(String name, String url, String hash) throws Exception {
		JsonObject all = Files.exists(META) ? GSON.fromJson(Files.readString(META), JsonObject.class) : null;
		if (all == null) all = new JsonObject();
		JsonObject one = new JsonObject();
		one.addProperty("url", url);
		one.addProperty("hash", hash == null ? "" : hash);
		all.add(name, one);
		Files.writeString(META, GSON.toJson(all), StandardCharsets.UTF_8);
	}

	/** At the start, before the packs load: new copies that waited take the old ones' places. */
	public static void applyWaiting() {
		try (var files = Files.list(dir())) {
			for (Path next : files.filter(p -> p.getFileName().toString().endsWith(".zip.next")).toList()) {
				String name = next.getFileName().toString();
				Files.move(next, next.resolveSibling(name.substring(0, name.length() - ".next".length())), StandardCopyOption.REPLACE_EXISTING);
			}
		} catch (java.nio.file.NoSuchFileException none) {
			// no resource packs folder yet
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: kept packs waiting: {}", e.toString());
		}
	}

	/** For the test: whether a copy is being downloaded. */
	public static boolean fetchingForTest() {
		return !fetching.isEmpty();
	}
}
