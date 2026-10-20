package dev.slash3rss.slashclient.hud.social;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Clans' logos (64×64 PNGs) as textures for the friends window: fetched once per clan and version
 * through the launcher (a version never changes), off the game's thread, registered on it. Only a
 * few stay; a clan's older version goes when a newer one comes. Until one is here the screens draw
 * the clan's usual icon.
 */
public final class ClanLogos {
	private ClanLogos() {}

	private static final ChatImages.Texture LOADING = new ChatImages.Texture(null, 0, 0, false);
	private static final ChatImages.Texture FAILED = new ChatImages.Texture(null, 0, 0, true);
	private static final int KEEP = 8;
	/** By "clan:version", newest last. */
	private static final Map<String, ChatImages.Texture> textures = new LinkedHashMap<>(8, 0.75f, true);
	private static int next;

	/** The clan's logo of that version, or null when it has none or it is not here (yet). */
	public static synchronized ChatImages.Texture of(String clanId, long version) {
		if (clanId == null || clanId.isEmpty() || version <= 0) return null;
		String key = clanId + ":" + version;
		ChatImages.Texture t = textures.get(key);
		if (t == null) {
			// without the launcher (yet) there is nothing to ask; it is tried once it is there
			if (!Social.bridged()) return null;
			textures.put(key, LOADING);
			Thread.ofVirtual().start(() -> load(key, clanId, version));
			return null;
		}
		return t.ready() ? t : null;
	}

	private static void load(String key, String clanId, long version) {
		try {
			byte[] png = Social.clanLogoBytes(clanId, version);
			NativeImage img;
			try (InputStream in = new ByteArrayInputStream(png)) {
				img = NativeImage.read(in);
			}
			// a logo is small; anything else is not one
			if (img.getWidth() > 256 || img.getHeight() > 256) {
				img.close();
				throw new IllegalStateException("too big");
			}
			Minecraft.getInstance().execute(() -> {
				synchronized (ClanLogos.class) {
					register(key, img);
				}
			});
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: clan logo {}: {}", key, e.toString());
			synchronized (ClanLogos.class) {
				textures.put(key, FAILED);
			}
		}
	}

	/** For the screenshot test: a made-up logo (PNG bytes) for this clan and version; on the game's thread. */
	public static synchronized void sampleForTest(String clanId, long version, byte[] png) throws java.io.IOException {
		try (InputStream in = new ByteArrayInputStream(png)) {
			register(clanId + ":" + version, NativeImage.read(in));
		}
	}

	private static void register(String key, NativeImage img) {
		Minecraft mc = Minecraft.getInstance();
		Identifier id = Identifier.fromNamespaceAndPath("slashclient-hud", "clan_logo/" + next++);
		mc.getTextureManager().register(id, new DynamicTexture(() -> "SlashClient clan logo", img));
		ChatImages.Texture before = textures.put(key, new ChatImages.Texture(id, img.getWidth(), img.getHeight(), false));
		if (before != null && before.ready()) mc.getTextureManager().release(before.id());
		// the same clan's older versions are not needed any more
		String clan = key.substring(0, key.lastIndexOf(':') + 1);
		var it = textures.entrySet().iterator();
		while (it.hasNext()) {
			var e = it.next();
			if (e.getKey().equals(key)) continue;
			if (e.getKey().startsWith(clan) || textures.size() > KEEP) {
				it.remove();
				if (e.getValue().ready()) mc.getTextureManager().release(e.getValue().id());
			}
		}
	}
}
