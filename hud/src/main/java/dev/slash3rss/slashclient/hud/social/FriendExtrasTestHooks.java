package dev.slash3rss.slashclient.hud.social;

import net.minecraft.client.Minecraft;

import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.List;

/**
 * For the in-game test of friends starting to play, muted friends and pictures in the chat: a
 * made-up friend and conversation (no launcher), pictures drawn here, screenshots in the folder.
 */
public final class FriendExtrasTestHooks {
	private FriendExtrasTestHooks() {}

	public static final String FRIEND = "kumpel";

	/** A friend online in the launcher, a chat with a picture each way and one for another launcher. */
	public static void sample() throws Exception {
		long now = System.currentTimeMillis();
		var f = new Social.Friend(FRIEND, "Kumpel", "kumpel", "online", "launcher", "", 0, now);
		List<Social.Message> chat = List.of(
			new Social.Message(1, FRIEND, "me", "Patrz, co znalazłem!", now - 300_000, true, "", "", "", null, null),
			new Social.Message(2, FRIEND, "me", "[Zrzut ekranu]", now - 290_000, true, "", "", "", null, new Social.Image("pic-theirs-0000000000", 1920, 1080, false)),
			new Social.Message(3, "me", FRIEND, "[Zrzut ekranu]", now - 60_000, true, "", "", "", null, new Social.Image("pic-mine-00000000000a", 1280, 1024, false)),
			new Social.Message(4, FRIEND, "me", "[Zrzut ekranu]", now - 30_000, true, "", "", "", null, new Social.Image("pic-other-device-0000", 800, 600, true)));
		Social.sampleForTest(f, chat, "me");
		pictures();
	}

	/** The made-up pictures those messages (and the group chat's sample) show. */
	public static void pictures() throws Exception {
		ChatImages.sampleForTest("pic-theirs-0000000000", png(480, 270, new Color(0x2563EB), new Color(0x22C55E), "Baza"));
		ChatImages.sampleForTest("pic-mine-00000000000a", png(320, 256, new Color(0xF97316), new Color(0x7C3AED), "Nether"));
	}

	/** Screenshots in this game's folder, as F2 makes them; the newest is the one "just taken". */
	public static List<File> screenshots() throws Exception {
		File dir = new File(Minecraft.getInstance().gameDirectory, "screenshots");
		dir.mkdirs();
		String[] names = { "Dom", "Farma", "Portal", "Zamek", "Las" };
		Color[][] colors = { { new Color(0x0EA5E9), new Color(0x84CC16) }, { new Color(0xEAB308), new Color(0x65A30D) },
			{ new Color(0x7C3AED), new Color(0x111827) }, { new Color(0x64748B), new Color(0x0F172A) }, { new Color(0x15803D), new Color(0x052E16) } };
		long t = System.currentTimeMillis() - names.length * 60_000L;
		File last = null;
		for (int i = 0; i < names.length; i++) {
			File f = new File(dir, "test-shot-" + i + ".png");
			java.nio.file.Files.write(f.toPath(), png(640, 360, colors[i][0], colors[i][1], names[i]));
			f.setLastModified(t + i * 60_000L);
			last = f;
		}
		return List.of(last);
	}

	/** Takes the made-up screenshots out of the folder again. */
	public static void removeScreenshots() {
		File[] files = new File(Minecraft.getInstance().gameDirectory, "screenshots").listFiles((d, n) -> n.startsWith("test-shot-"));
		if (files != null) for (File f : files) f.delete();
	}

	/** A picture: a gradient with a word on it, so it is clear in a screenshot which one is where. */
	static byte[] png(int w, int h, Color from, Color to, String word) throws Exception {
		BufferedImage img = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setPaint(new GradientPaint(0, 0, from, w, h, to));
		g.fillRect(0, 0, w, h);
		g.setColor(new Color(255, 255, 255, 60));
		for (int x = 0; x < w; x += 40) g.fillRect(x, h * 2 / 3, 20, h / 3);
		try {
			g.setColor(Color.WHITE);
			g.setFont(g.getFont().deriveFont(java.awt.Font.BOLD, h / 5f));
			g.drawString(word, w / 12, h / 3);
		} catch (RuntimeException | Error noFonts) {
			// a system without fonts for Java: the gradient alone will do
		}
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		javax.imageio.ImageIO.write(img, "png", out);
		return out.toByteArray();
	}
}
