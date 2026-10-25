package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.zip.DataFormatException;
import java.util.zip.Deflater;
import java.util.zip.Inflater;

/**
 * HUD settings (or only the chat tabs) as a short code to paste into chat or Discord: "SCHUD1:" + base64url of the
 * raw-deflated JSON. The launcher reads and writes the same format (src/main/hudShare.ts).
 */
public final class ShareCode {
	private ShareCode() {}

	static final String PREFIX = "SCHUD1:";
	private static final Gson GSON = new Gson();

	/** Only the chat tabs, to share them without the rest of the HUD: "SCTABS1:" and the same packing. */
	static final String TABS_PREFIX = "SCTABS1:";

	public static String encode(HudConfig config) {
		return PREFIX + pack(GSON.toJson(config));
	}

	public static String encodeTabs(java.util.List<HudConfig.ChatTab> tabs) {
		return TABS_PREFIX + pack(GSON.toJson(tabs));
	}

	/** The chat tabs in a tabs code, or null when it is not one. */
	public static java.util.List<HudConfig.ChatTab> decodeTabs(String code) {
		String s = code == null ? "" : code.trim();
		if (!s.startsWith(TABS_PREFIX)) return null;
		try {
			String json = unpack(s.substring(TABS_PREFIX.length()));
			HudConfig.ChatTab[] read = GSON.fromJson(json, HudConfig.ChatTab[].class);
			if (read == null) return null;
			java.util.List<HudConfig.ChatTab> out = new java.util.ArrayList<>();
			for (HudConfig.ChatTab t : read) {
				if (t == null || t.name == null || t.name.isBlank()) continue;
				if (t.patterns == null) t.patterns = new java.util.ArrayList<>();
				t.excludes();
				out.add(t);
			}
			return out;
		} catch (IllegalArgumentException | DataFormatException | com.google.gson.JsonParseException e) {
			return null;
		}
	}

	private static String pack(String text) {
		byte[] json = text.getBytes(StandardCharsets.UTF_8);
		Deflater deflater = new Deflater(Deflater.BEST_COMPRESSION, true);
		deflater.setInput(json);
		deflater.finish();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		byte[] buf = new byte[4096];
		while (!deflater.finished()) out.write(buf, 0, deflater.deflate(buf));
		deflater.end();
		return Base64.getUrlEncoder().withoutPadding().encodeToString(out.toByteArray());
	}

	private static String unpack(String code) throws DataFormatException {
		byte[] packed = Base64.getUrlDecoder().decode(code);
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
		return out.toString(StandardCharsets.UTF_8);
	}

	/** The settings in a code, or null when it is not a valid code. */
	public static HudConfig decode(String code) {
		String s = code == null ? "" : code.trim();
		if (!s.startsWith(PREFIX)) return null;
		try {
			HudConfig read = GSON.fromJson(unpack(s.substring(PREFIX.length())), HudConfig.class);
			return read == null ? null : HudConfig.fillMissing(read);
		} catch (IllegalArgumentException | DataFormatException | com.google.gson.JsonParseException e) {
			return null;
		}
	}
}
