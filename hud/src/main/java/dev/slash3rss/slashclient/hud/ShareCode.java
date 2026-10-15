package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.DataFormatException;
import java.util.zip.Deflater;
import java.util.zip.Inflater;

/**
 * HUD settings as a short code to paste into chat or Discord: "SCHUD1:" + base64url of the
 * raw-deflated JSON. The launcher reads and writes the same format (src/main/hudShare.ts).
 */
public final class ShareCode {
	private ShareCode() {}

	static final String PREFIX = "SCHUD1:";
	private static final Gson GSON = new Gson();

	public static String encode(HudConfig config) {
		byte[] json = GSON.toJson(config).getBytes(StandardCharsets.UTF_8);
		Deflater deflater = new Deflater(Deflater.BEST_COMPRESSION, true);
		deflater.setInput(json);
		deflater.finish();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buf = new byte[4096];
		while (!deflater.finished()) out.write(buf, 0, deflater.deflate(buf));
		deflater.end();
		return PREFIX + Base64.getUrlEncoder().withoutPadding().encodeToString(out.toByteArray());
	}

	/** The settings in a code, or null when it is not a valid code. */
	public static HudConfig decode(String code) {
		String s = code == null ? "" : code.trim();
		if (!s.startsWith(PREFIX)) return null;
		try {
			byte[] packed = Base64.getUrlDecoder().decode(s.substring(PREFIX.length()));
			Inflater inflater = new Inflater(true);
			inflater.setInput(packed);
			ByteArrayOutputStream out = new ByteArrayOutputStream();
			byte[] buf = new byte[4096];
			while (!inflater.finished()) {
				int n = inflater.inflate(buf);
				// a code is a few kB at most: anything bigger is not ours
				if (n == 0 && (inflater.needsInput() || inflater.needsDictionary()) || out.size() > 256 * 1024) break;
				out.write(buf, 0, n);
			}
			inflater.end();
			HudConfig read = GSON.fromJson(out.toString(StandardCharsets.UTF_8), HudConfig.class);
			return read == null ? null : HudConfig.fillMissing(read);
		} catch (IllegalArgumentException | DataFormatException | com.google.gson.JsonParseException e) {
			return null;
		}
	}
}
