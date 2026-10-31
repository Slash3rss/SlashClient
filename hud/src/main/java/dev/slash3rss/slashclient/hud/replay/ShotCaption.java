package dev.slash3rss.slashclient.hud.replay;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.world.level.Level;

import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * A caption in a corner of F2's screenshots: where you stood (coordinates and dimension), when,
 * and on which server or world. What it says is taken the moment F2 is pressed; it is drawn into
 * the saved PNG right after the game writes it (on the game's file thread, before the clipboard
 * and the preview see the file). Java's own 2D drawing does it, which works without a window.
 */
public final class ShotCaption {
	private ShotCaption() {}

	public static final String[] CORNERS = { "bottomLeft", "bottomRight", "topLeft", "topRight" };
	private static final DateTimeFormatter WHEN = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss", Locale.ROOT);
	/** The last caption drawn (the in-game test reads it back). */
	public static volatile String lastDrawn = "";

	/** What the caption will say, from the moment of F2; null when it is off. */
	public static List<String> capture(Minecraft mc) {
		HudConfig cfg = SlashHud.config;
		if (cfg == null || !cfg.screenshotCaption) return null;
		List<String> lines = new ArrayList<>();
		if (cfg.screenshotCaptionCoords && mc.player != null && mc.level != null) {
			var p = mc.player;
			lines.add("X " + p.getBlockX() + "  Y " + p.getBlockY() + "  Z " + p.getBlockZ() + "  ·  " + dimension(mc.level));
		}
		String when = LocalDateTime.now().format(WHEN);
		String where = cfg.screenshotCaptionServer ? place(mc) : "";
		lines.add(where.isEmpty() ? when : when + "  ·  " + where);
		return lines;
	}

	private static String dimension(Level level) {
		var key = level.dimension();
		if (key == Level.OVERWORLD) return Component.translatable("slashclient-hud.caption.overworld").getString();
		if (key == Level.NETHER) return Component.translatable("slashclient-hud.caption.nether").getString();
		if (key == Level.END) return Component.translatable("slashclient-hud.caption.end").getString();
		// "ResourceKey[minecraft:dimension / skyup:lobby]": the id after the slash
		String s = String.valueOf(key);
		int slash = s.lastIndexOf(" / ");
		return slash < 0 ? s : s.substring(slash + 3, s.length() - 1);
	}

	/** The server's address, or the world's name in singleplayer. */
	private static String place(Minecraft mc) {
		if (mc.getCurrentServer() != null) return mc.getCurrentServer().ip;
		if (mc.getSingleplayerServer() != null) return mc.getSingleplayerServer().getWorldData().getLevelName();
		return "";
	}

	/** Draws `lines` into the newest screenshot of <game dir>/screenshots, once the game says it saved one. */
	public static void apply(File gameDir, List<String> lines, Component message) {
		if (lines == null || lines.isEmpty()) return;
		// "Couldn't save screenshot" leaves no new file: the last one keeps its caption as it is
		if (!(message.getContents() instanceof net.minecraft.network.chat.contents.TranslatableContents t) || !"screenshot.success".equals(t.getKey())) return;
		File[] files = new File(gameDir, "screenshots").listFiles((d, n) -> n.endsWith(".png"));
		if (files == null || files.length == 0) return;
		File newest = Arrays.stream(files).max(Comparator.comparingLong(File::lastModified)).get();
		if (System.currentTimeMillis() - newest.lastModified() > 15_000) return;
		try {
			BufferedImage img = ImageIO.read(newest);
			if (img == null) return;
			draw(img, lines, SlashHud.config == null ? CORNERS[0] : SlashHud.config.screenshotCaptionCorner);
			ImageIO.write(img, "png", newest);
			lastDrawn = String.join("\n", lines);
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: screenshot caption: {}", e.toString());
		}
	}

	static void draw(BufferedImage img, List<String> lines, String corner) {
		int w = img.getWidth(), h = img.getHeight();
		Graphics2D g = img.createGraphics();
		try {
			g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
			g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
			// about a thirty-sixth of the picture's height, readable in a 4K shot and in a small window
			int size = Math.max(13, Math.round(Math.min(w, h * 16 / 9f) / 64f));
			Font main = new Font(Font.SANS_SERIF, Font.BOLD, size), second = new Font(Font.SANS_SERIF, Font.PLAIN, Math.round(size * 0.85f));
			FontMetrics fm = g.getFontMetrics(main), sm = g.getFontMetrics(second);
			int pad = size / 2, gap = size / 4, margin = size;
			int boxW = 0, boxH = pad * 2 - gap;
			for (int i = 0; i < lines.size(); i++) {
				FontMetrics m = i == 0 ? fm : sm;
				boxW = Math.max(boxW, m.stringWidth(lines.get(i)));
				boxH += m.getHeight() + gap;
			}
			boxW += pad * 2;
			boolean right = corner.endsWith("Right"), top = corner.startsWith("top");
			int x = right ? w - margin - boxW : margin, y = top ? margin : h - margin - boxH;
			g.setComposite(AlphaComposite.SrcOver);
			g.setColor(new Color(10, 13, 20, 170));
			g.fillRoundRect(x, y, boxW, boxH, size / 2, size / 2);
			g.setColor(new Color(59, 130, 246, 230));
			g.fillRoundRect(x, y, Math.max(3, size / 6), boxH, size / 4, size / 4);
			int ty = y + pad;
			for (int i = 0; i < lines.size(); i++) {
				FontMetrics m = i == 0 ? fm : sm;
				g.setFont(i == 0 ? main : second);
				int base = ty + m.getAscent();
				int tx = x + pad + (right ? boxW - pad * 2 - m.stringWidth(lines.get(i)) : 0);
				g.setColor(new Color(0, 0, 0, 160));
				g.drawString(lines.get(i), tx + 1, base + 1);
				g.setColor(i == 0 ? new Color(243, 244, 246) : new Color(180, 188, 200));
				g.drawString(lines.get(i), tx, base);
				ty += m.getHeight() + gap;
			}
		} finally {
			g.dispose();
		}
	}
}
