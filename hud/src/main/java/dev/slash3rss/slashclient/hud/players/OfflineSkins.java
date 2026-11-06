package dev.slash3rss.slashclient.hud.players;

import com.google.gson.JsonObject;
import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
//#if MC >= 1.21.9
import net.minecraft.core.ClientAsset;
//#endif
import net.minecraft.resources.Identifier;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Collection;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/**
 * Skins of players with offline accounts: such a player sets a skin in the launcher, and the SlashClient
 * server tells the games of other SlashClient players on the same server (the lookup in {@link Badges},
 * `skins`), which then draw that player in it instead of the game's Steve or Alex. The picture is fetched
 * once by its hash and kept on disk (slashclient/skins), so the same skin is not downloaded again.
 */
public final class OfflineSkins {
	private OfflineSkins() {}

	/** The skin the server says a player wears: the picture's hash and whether the arms are slim. */
	record Skin(String hash, boolean slim) {}

	private static final Pattern HASH = Pattern.compile("[0-9a-f]{8,64}");
	/** A picture that could not be fetched is tried again after this long. */
	private static final long RETRY_MS = 60_000;
	static final Path DIR = FabricLoader.getInstance().getGameDir().resolve("slashclient").resolve("skins");
	// HTTP/1.1, as for the lookups (Badges)
	private static final HttpClient HTTP = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(5)).build();

	/** uuid → the skin the server named for that player. */
	private static final Map<UUID, Skin> skins = new ConcurrentHashMap<>();
	/** hash → the picture, once loaded and registered as a texture. */
	//#if MC >= 1.21.9
	private static final Map<String, ClientAsset.Texture> loaded = new ConcurrentHashMap<>();
	//#else
	//$ private static final Map<String, Identifier> loaded = new ConcurrentHashMap<>();
	//#endif
	/** hash → when it was last asked for (loading or failed). */
	private static final Map<String, Long> askedAt = new ConcurrentHashMap<>();

	/** The setting "Skiny graczy offline" (on unless switched off). */
	public static boolean enabled() {
		return SlashHud.config == null || SlashHud.config.offlineSkins;
	}

	/** The lookup's answer: each player asked about gets the skin named for them, or none. */
	static void fromLookup(Collection<UUID> asked, JsonObject skinsOf) {
		for (UUID id : asked) {
			var el = skinsOf.get(id.toString());
			Skin skin = null;
			if (el != null && el.isJsonObject()) {
				var o = el.getAsJsonObject();
				String hash = o.has("hash") && o.get("hash").isJsonPrimitive() ? o.get("hash").getAsString() : "";
				boolean slim = o.has("slim") && o.get("slim").isJsonPrimitive() && o.get("slim").getAsBoolean();
				if (HASH.matcher(hash).matches()) skin = new Skin(hash, slim);
			}
			if (skin != null) skins.put(id, skin);
			else skins.remove(id);
		}
	}

	/** Another server or world: the skins named there do not count any more (the pictures stay loaded). */
	static void reset() {
		skins.clear();
	}

	/** The skin's picture to draw this player in, or null: none named, the setting off, or not loaded yet (the game's own skin meanwhile). */
	//#if MC >= 1.21.9
	public static ClientAsset.Texture body(UUID id) {
	//#else
	//$ public static Identifier body(UUID id) {
	//#endif
		if (id == null || !enabled()) return null;
		Skin skin = skins.get(id);
		if (skin == null) return null;
		var texture = loaded.get(skin.hash());
		if (texture == null) load(skin.hash());
		return texture;
	}

	/** Whether that player's skin has slim arms (only with a picture from body()). */
	public static boolean slim(UUID id) {
		Skin skin = skins.get(id);
		return skin != null && skin.slim();
	}

	/** Fetches the picture in the background: from the disk if it was fetched before, otherwise from SlashClient's server. */
	private static void load(String hash) {
		long now = System.currentTimeMillis();
		Long at = askedAt.get(hash);
		if (at != null && now - at < RETRY_MS) return;
		askedAt.put(hash, now);
		Path file = DIR.resolve(hash + ".png");
		java.util.concurrent.CompletableFuture.runAsync(() -> {
			try {
				if (Files.exists(file)) {
					byte[] data = Files.readAllBytes(file);
					if (matches(hash, data) && accept(hash, data)) return;
					Files.deleteIfExists(file);
				}
				String server = Badges.server;
				if (server == null) return;
				var res = HTTP.send(HttpRequest.newBuilder(URI.create(server + "/v1/skin/" + hash + ".png")).timeout(Duration.ofSeconds(10)).GET().build(),
					HttpResponse.BodyHandlers.ofByteArray());
				byte[] data = res.body();
				// the server's skins are at most 64 KB; a picture that is not the one named is not drawn
				if (res.statusCode() != 200 || data.length > 65_536 || !matches(hash, data)) return;
				if (!accept(hash, data)) return;
				Files.createDirectories(DIR);
				Files.write(file, data);
			} catch (Exception e) {
				SlashHud.LOG.debug("SlashClient: offline skin {}: {}", hash, e.toString());
			}
		});
	}

	/** Whether the picture is the one with this hash (the start of its SHA-256). */
	static boolean matches(String hash, byte[] data) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)).startsWith(hash);
		} catch (java.security.NoSuchAlgorithmException e) {
			return false;
		}
	}

	/** Reads a skin (64×64, or the old 64×32) and registers it as a texture on the game's thread; false when it is not a skin. */
	private static boolean accept(String hash, byte[] data) throws java.io.IOException {
		NativeImage image = NativeImage.read(data);
		if (image.getWidth() != 64 || image.getHeight() != 64 && image.getHeight() != 32) {
			image.close();
			return false;
		}
		NativeImage skin = image.getHeight() == 32 ? legacy(image) : image;
		Minecraft.getInstance().execute(() -> register(hash, skin));
		return true;
	}

	private static void register(String hash, NativeImage image) {
		Identifier id = Identifier.fromNamespaceAndPath(SlashHud.ID, "offline_skin/" + hash);
		Minecraft.getInstance().getTextureManager().register(id, new DynamicTexture(() -> "SlashClient offline skin", image));
		//#if MC >= 1.21.9
		loaded.put(hash, new ClientAsset.ResourceTexture(id, id));
		//#else
		//$ loaded.put(hash, id);
		//#endif
	}

	/** An old 64×32 skin made 64×64, as the game does with such skins: the left arm and leg mirror the right ones. */
	private static NativeImage legacy(NativeImage old) {
		NativeImage image = new NativeImage(64, 64, true);
		image.copyFrom(old);
		old.close();
		image.fillRect(0, 32, 64, 32, 0);
		image.copyRect(4, 16, 16, 32, 4, 4, true, false);
		image.copyRect(8, 16, 16, 32, 4, 4, true, false);
		image.copyRect(0, 20, 24, 32, 4, 12, true, false);
		image.copyRect(4, 20, 16, 32, 4, 12, true, false);
		image.copyRect(8, 20, 8, 32, 4, 12, true, false);
		image.copyRect(12, 20, 16, 32, 4, 12, true, false);
		image.copyRect(44, 16, -8, 32, 4, 4, true, false);
		image.copyRect(48, 16, -8, 32, 4, 4, true, false);
		image.copyRect(40, 20, 0, 32, 4, 12, true, false);
		image.copyRect(44, 20, -8, 32, 4, 12, true, false);
		image.copyRect(48, 20, -16, 32, 4, 12, true, false);
		image.copyRect(52, 20, -8, 32, 4, 12, true, false);
		return image;
	}

	// ---------- for the test ----------

	/** As if the server had named this skin for a player (null hash: none). */
	public static void setForTest(UUID id, String hash, boolean slim) {
		if (hash == null) skins.remove(id);
		else skins.put(id, new Skin(hash, slim));
	}

	/** Puts a picture where a fetched one is kept, so the next drawing loads it from there; its hash. */
	public static String cacheForTest(byte[] data) throws Exception {
		String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)).substring(0, 32);
		Files.createDirectories(DIR);
		Files.write(DIR.resolve(hash + ".png"), data);
		askedAt.remove(hash);
		return hash;
	}

	/** Forgets a picture (loaded and on disk), so it is fetched again. */
	public static void forgetForTest(String hash) throws Exception {
		loaded.remove(hash);
		askedAt.remove(hash);
		Files.deleteIfExists(DIR.resolve(hash + ".png"));
	}
}
