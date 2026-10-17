package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.social.Social;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;

import java.io.File;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.Comparator;

/**
 * After F2: the new picture goes on the clipboard (the launcher copies it, the game itself
 * cannot put images there on every system) and a small preview shows in the corner.
 */
public final class Shots {
	private Shots() {}

	private static final Identifier THUMB = Identifier.fromNamespaceAndPath("slashclient-hud", "screenshot_preview");
	private static final long SHOW_MS = 4000;
	private static long shownAt;
	private static int imgW, imgH;
	private static boolean copied;

	/** Called when the game has saved a screenshot into <game dir>/screenshots. */
	public static void taken(File gameDir) {
		if (SlashHud.config == null || !SlashHud.config.screenshotClipboard) return;
		File[] files = new File(gameDir, "screenshots").listFiles((d, n) -> n.endsWith(".png"));
		if (files == null || files.length == 0) return;
		File newest = Arrays.stream(files).max(Comparator.comparingLong(File::lastModified)).get();
		if (System.currentTimeMillis() - newest.lastModified() > 15_000) return;
		copied = Social.copyImage(newest.getAbsolutePath());
		Minecraft mc = Minecraft.getInstance();
		mc.execute(() -> {
			try (InputStream in = Files.newInputStream(newest.toPath())) {
				NativeImage img = NativeImage.read(in);
				imgW = img.getWidth();
				imgH = img.getHeight();
				mc.getTextureManager().release(THUMB);
				mc.getTextureManager().register(THUMB, new DynamicTexture(() -> "SlashClient screenshot preview", img));
				shownAt = System.currentTimeMillis();
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: screenshot preview: {}", e.toString());
			}
		});
	}

	/** The preview in the top right corner, sliding away at the end. */
	static void draw(GuiGraphicsExtractor g) {
		long age = System.currentTimeMillis() - shownAt;
		if (shownAt == 0 || age > SHOW_MS || imgW == 0) return;
		int w = 112, h = Math.max(1, w * imgH / imgW);
		float out = age > SHOW_MS - 300 ? (age - (SHOW_MS - 300)) / 300f : 0f;
		int x = g.guiWidth() - w - 8 + Math.round(out * (w + 12)), y = 8;
		Ui.round(g, x - 3, y - 3, w + 6, h + 18, 5, Ui.PANEL);
		Ui.roundOutline(g, x - 3, y - 3, w + 6, h + 18, 5, 0x803B82F6);
		g.blit(RenderPipelines.GUI_TEXTURED, THUMB, x, y, 0, 0, w, h, imgW, imgH, imgW, imgH, 0xFFFFFFFF);
		Component label = Component.translatable(copied ? "slashclient-hud.screenshot.copied" : "slashclient-hud.screenshot.saved");
		Ui.draw(g, Ui.fit(Ui.text(label.getString()), w), x, y + h + 4, copied ? Ui.GREEN : Ui.TEXT_2);
	}
}
