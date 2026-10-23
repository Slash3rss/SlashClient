package dev.slash3rss.slashclient.hud.social;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.Identifier;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Pictures as textures for the friends window: ones from the chat (the launcher decrypts them and
 * hands over a PNG) and the player's own screenshots to pick from. Loaded off the game's thread,
 * registered on it; only the last few stay, the rest are released.
 */
public final class ChatImages {
	private ChatImages() {}

	/** A loaded picture, or one still loading / that failed (`id` null). */
	public record Texture(Identifier id, int w, int h, boolean failed) {
		public boolean ready() {
			return id != null;
		}
	}

	private static final Texture LOADING = new Texture(null, 0, 0, false);
	private static final Texture FAILED = new Texture(null, 0, 0, true);
	private static final int KEEP = 16;
	/** Newest last; past KEEP the oldest is released. */
	private static final Map<String, Texture> textures = new LinkedHashMap<>(16, 0.75f, true);
	private static int next;

	/** A picture from the chat by its id; null while it loads. */
	public static synchronized Texture chat(String imageId) {
		return get("chat:" + imageId, () -> Social.imageBytes(imageId));
	}

	/** A picture from a community's chat (not encrypted; the launcher hands over a PNG); null while it loads. */
	public static synchronized Texture community(String communityId, String imageId) {
		return get("community:" + imageId, () -> Social.communityImageBytes(communityId, imageId));
	}

	/** A GIF's or sticker's still frame from the chat (ChatGifs), by its CDN address; null while it loads. */
	public static synchronized Texture gif(String url) {
		return get("gif:" + url, () -> png(Social.gifStillBytes(url)));
	}

	/** For the in-game test: a made-up GIF still (PNG bytes) under this address; on the game's thread. */
	public static synchronized void sampleGifForTest(String url, byte[] png) throws java.io.IOException {
		try (InputStream in = new ByteArrayInputStream(png)) {
			register("gif:" + url, NativeImage.read(in));
		}
	}

	/** A GIF's still frame as PNG (the game reads only that): GIPHY's are GIFs, Tenor's PNGs. */
	static byte[] png(byte[] data) {
		if (data.length > 8 && (data[0] & 0xFF) == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G') return data;
		try {
			java.awt.image.BufferedImage img = javax.imageio.ImageIO.read(new ByteArrayInputStream(data));
			if (img == null) throw new IllegalStateException("not a picture");
			java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
			javax.imageio.ImageIO.write(img, "png", out);
			return out.toByteArray();
		} catch (java.io.IOException e) {
			throw new IllegalStateException(e);
		}
	}

	/** For the in-game test: a made-up picture (PNG bytes) under this community picture's id; on the game's thread. */
	public static synchronized void sampleCommunityForTest(String imageId, byte[] png) throws java.io.IOException {
		try (InputStream in = new ByteArrayInputStream(png)) {
			register("community:" + imageId, NativeImage.read(in));
		}
	}

	/** One of the player's screenshots (a PNG file). */
	public static synchronized Texture file(File png) {
		return get("file:" + png.getAbsolutePath() + ":" + png.lastModified(), () -> {
			try {
				return Files.readAllBytes(png.toPath());
			} catch (Exception e) {
				throw new RuntimeException(e);
			}
		});
	}

	/** For the screenshot test: a made-up picture (PNG bytes) under this chat id; on the game's thread. */
	public static synchronized void sampleForTest(String imageId, byte[] png) throws java.io.IOException {
		try (InputStream in = new ByteArrayInputStream(png)) {
			register("chat:" + imageId, NativeImage.read(in));
		}
	}

	private static Texture get(String key, Supplier<byte[]> load) {
		Texture t = textures.get(key);
		if (t != null) return t;
		textures.put(key, LOADING);
		Thread.ofVirtual().start(() -> {
			try {
				byte[] png = load.get();
				NativeImage img;
				try (InputStream in = new ByteArrayInputStream(png)) {
					img = NativeImage.read(in);
				}
				Minecraft.getInstance().execute(() -> {
					synchronized (ChatImages.class) {
						register(key, img);
					}
				});
			} catch (Exception e) {
				SlashHud.LOG.info("SlashClient: picture {}: {}", key.startsWith("chat:") ? key : "screenshot", e.toString());
				synchronized (ChatImages.class) {
					textures.put(key, FAILED);
				}
			}
		});
		return LOADING;
	}

	private static void register(String key, NativeImage img) {
		Minecraft mc = Minecraft.getInstance();
		Identifier id = Identifier.fromNamespaceAndPath("slashclient-hud", "chat_image/" + next++);
		mc.getTextureManager().register(id, new DynamicTexture(() -> "SlashClient chat picture", img));
		Texture before = textures.put(key, new Texture(id, img.getWidth(), img.getHeight(), false));
		if (before != null && before.ready()) mc.getTextureManager().release(before.id());
		var it = textures.entrySet().iterator();
		while (textures.size() > KEEP && it.hasNext()) {
			Texture old = it.next().getValue();
			it.remove();
			if (old.ready()) mc.getTextureManager().release(old.id());
		}
	}

	/** The size a picture is shown at in a box of maxW × maxH, keeping its shape. */
	public static int[] fit(int w, int h, int maxW, int maxH) {
		if (w <= 0 || h <= 0) return new int[] { maxW, Math.min(maxH, maxW * 9 / 16) };
		float scale = Math.min((float) maxW / w, (float) maxH / h);
		return new int[] { Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)) };
	}
}
