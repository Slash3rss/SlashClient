package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.HudEditScreen;
import dev.slash3rss.slashclient.hud.NowPlayingTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

/**
 * "Now playing" (id "spotify"): answers as the launcher's bridge gives them fed in (no launcher, no
 * player), the parser on odd ones, then the module in several configurations: the card with a
 * cover, the album and the times; a long title sliding in a narrow card; paused (with the mark,
 * then hidden); one line in the module's colour; a big cover alone; a browser's video (a note as
 * its mark) and "Only Spotify" leaving it out; nothing playing; an older launcher without a linked
 * account; the editor's made-up track and the settings with the note on what it reads.
 */
public class GameNowPlaying implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String parser = context.computeOnClient(mc -> NowPlayingTestHooks.parser());
		if (!parser.equals("ok")) throw new AssertionError("Now playing answers:\n" + parser);
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(40);
			world.getServer().runCommand("time set 6000");
			context.runOnClient(mc -> {
				try {
					NowPlayingTestHooks.cover(cover());
				} catch (Exception e) {
					throw new RuntimeException(e);
				}
			});

			// the card: cover, title, artists, album, the bar and the times, Spotify's green
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("card", true, 36, true, true, true, "spotify", 220, true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "Kopalnia o świcie", true, 61_000, 200_000, "Slash3rss", "DJ Kubełek"));
			});
			context.waitTicks(5);
			String card = context.computeOnClient(mc -> NowPlayingTestHooks.shown());
			System.out.println("SlashClient test: Now playing card: " + card);
			if (!card.startsWith("Kopalnia o świcie | Slash3rss, DJ Kubełek | Lato na serwerze [1:0")) throw new AssertionError("The card shows: " + card);
			context.takeScreenshot("spotify-card");

			// a long title in a narrow card slides through (two moments of the slide)
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("card", true, 28, false, true, true, "spotify", 140, true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "Bardzo długi tytuł utworu, który się nie mieści w module (wersja rozszerzona)", true, 125_000, 312_000, "Zespół z bardzo długą nazwą"));
			});
			context.waitTicks(5);
			context.takeScreenshot("spotify-marquee-start");
			context.waitTicks(50);
			context.takeScreenshot("spotify-marquee-later");
			// without sliding: cut with "…"
			context.runOnClient(mc -> NowPlayingTestHooks.set(s -> s.marquee = false));
			context.waitTicks(3);
			context.takeScreenshot("spotify-cut");

			// paused: the pause mark; then hidden while paused
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("card", true, 36, false, true, true, "spotify", 220, true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "Kopalnia o świcie", false, 61_000, 200_000, "Slash3rss"));
			});
			context.waitTicks(5);
			String paused = context.computeOnClient(mc -> NowPlayingTestHooks.shown());
			if (!paused.endsWith("[1:01 / 3:20] (paused) {spotify}")) throw new AssertionError("Paused, the card shows: " + paused);
			context.takeScreenshot("spotify-paused");
			context.runOnClient(mc -> NowPlayingTestHooks.set(s -> s.showPaused = false));
			if (!context.computeOnClient(mc -> NowPlayingTestHooks.shown()).isEmpty()) throw new AssertionError("A paused track shows with showPaused off");

			// one line, the module's own colour for the bar
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("line", true, 36, false, true, true, "theme", 260, true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "Kopalnia o świcie", true, 61_000, 200_000, "Slash3rss", "DJ Kubełek"));
			});
			context.waitTicks(5);
			String line = context.computeOnClient(mc -> NowPlayingTestHooks.shown());
			if (!line.startsWith("Kopalnia o świcie – Slash3rss, DJ Kubełek [1:0")) throw new AssertionError("The line shows: " + line);
			context.takeScreenshot("spotify-line");

			// a big cover with only the title and the bar
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("card", true, 64, false, true, false, "spotify", 200, true);
				NowPlayingTestHooks.set(s -> s.artists = false);
			});
			context.waitTicks(3);
			context.takeScreenshot("spotify-big-cover");

			// a browser's video: its cover with a note in the corner; "Only Spotify" leaves it out
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("card", true, 36, false, true, true, "spotify", 220, true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "browser", "Lofi do kopania – YouTube", true, 30_000, 0, "Kanał Slasha"));
			});
			context.waitTicks(5);
			String browser = context.computeOnClient(mc -> NowPlayingTestHooks.shown());
			if (!browser.startsWith("Lofi do kopania – YouTube | Kanał Slasha [0:3") || browser.contains(" / ") || !browser.endsWith("{browser}")) throw new AssertionError("A browser's video shows: " + browser);
			context.takeScreenshot("spotify-browser");
			context.runOnClient(mc -> {
				NowPlayingTestHooks.set(s -> s.onlySpotify = true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, "browser", "Lofi do kopania – YouTube", true, 30_000, 0, "Kanał Slasha"));
			});
			if (!context.computeOnClient(mc -> NowPlayingTestHooks.shown()).isEmpty()) throw new AssertionError("Only Spotify, but a browser's video shows");
			context.runOnClient(mc -> NowPlayingTestHooks.set(s -> s.onlySpotify = false));

			// nothing plays: hidden, or said
			context.runOnClient(mc -> {
				NowPlayingTestHooks.configure("card", true, 36, false, true, true, "spotify", 220, true);
				NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(true, null, false, 0, 0));
			});
			context.waitTicks(3);
			if (!context.computeOnClient(mc -> NowPlayingTestHooks.shown()).isEmpty()) throw new AssertionError("Nothing plays, but the module shows");
			context.runOnClient(mc -> NowPlayingTestHooks.set(s -> s.hideIdle = false));
			if (!context.computeOnClient(mc -> NowPlayingTestHooks.shown()).startsWith("status: ")) throw new AssertionError("Nothing plays with hideIdle off: no status");

			context.waitTicks(3);
			context.takeScreenshot("spotify-idle");
			// an older launcher without a linked Spotify account: nothing plays too, no talk of linking
			context.runOnClient(mc -> NowPlayingTestHooks.feed(NowPlayingTestHooks.answer(false, null, false, 0, 0)));
			context.waitTicks(3);
			String notLinked = context.computeOnClient(mc -> NowPlayingTestHooks.shown());
			if (!notLinked.startsWith("status: ") || notLinked.toLowerCase().contains("link") || notLinked.toLowerCase().contains("połącz")) throw new AssertionError("An older launcher, the module shows: " + notLinked);
			String info = context.computeOnClient(mc -> NowPlayingTestHooks.infoKey());
			if (!info.equals("slashclient-hud.spotify.info.local")) throw new AssertionError("The settings say: " + info);

			// the editor: a made-up track, and the module's settings with the note
			context.setScreen(HudEditScreen::new);
			context.waitTicks(5);
			String preview = context.computeOnClient(mc -> NowPlayingTestHooks.shown());
			if (!preview.startsWith("Nocna jazda")) throw new AssertionError("The editor shows: " + preview);
			context.takeScreenshot("spotify-editor");
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.TestHooks.audit(true));
			context.setScreen(() -> new HudEditScreen("spotify"));
			context.waitTicks(5);
			context.takeScreenshot("spotify-settings");
			// the module's own options, at the end of the page
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.TestHooks.scrollDown());
			context.waitTicks(5);
			context.takeScreenshot("spotify-settings-end");
			String problems = context.computeOnClient(mc -> String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS));
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.TestHooks.audit(false));
			if (problems.contains("spotify")) throw new AssertionError("The Now playing settings do not fit:\n" + problems);
			context.setScreen(() -> null);
			context.runOnClient(mc -> NowPlayingTestHooks.reset());
		}
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.TestHooks.vanillaMenu());
	}

	/** A made-up album cover: a sunset gradient, a sun and hills. */
	private static byte[] cover() throws java.io.IOException {
		BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_ARGB);
		Graphics2D g = img.createGraphics();
		g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
		g.setPaint(new GradientPaint(0, 0, new Color(0x7C3AED), 0, 64, new Color(0xF97316)));
		g.fillRect(0, 0, 64, 64);
		g.setColor(new Color(0xFDE047));
		g.fillOval(20, 18, 24, 24);
		g.setColor(new Color(0x14532D));
		g.fillPolygon(new int[] { 0, 18, 34, 50, 64, 64, 0 }, new int[] { 48, 36, 46, 34, 44, 64, 64 }, 7);
		g.dispose();
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(img, "png", out);
		return out.toByteArray();
	}
}
