package dev.slash3rss.slashclient.hud.ui;

import com.mojang.blaze3d.platform.NativeImage;
import dev.slash3rss.slashclient.hud.LoadingTips;
import dev.slash3rss.slashclient.hud.servers.PartnerIcons;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.mixin.LevelLoadingScreenAccessor;
import dev.slash3rss.slashclient.hud.mixin.LoadingScreensAccessor;
import dev.slash3rss.slashclient.hud.mixin.ProgressScreenAccessor;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.FaviconTexture;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.ProgressScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.storage.LevelResource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * SlashClient's loading screen, drawn over the game's own while a server is joined (connecting,
 * logging in, the server's resource packs, loading terrain) and a world is entered or left
 * (preparing, the spawn area, saving): our background, the logo with a soft glow, a card with the
 * server's or world's icon, name and address, the step the game is at with a progress bar (a
 * moving one while the game gives no percentage), the Cancel button where the game has one, and a
 * tip at the bottom. Only the look: the game's screen stays the screen, does everything it does
 * and keeps its keys and buttons (our Cancel is the game's own button, moved under ours).
 */
public final class SlashLoading {
	private SlashLoading() {}

	private static final Identifier LOGO = Identifier.fromNamespaceAndPath("slashclient-hud", "icon.png");
	private static final long TIP_MS = 6000;

	/** Test hooks: one fixed frame of the motion (the first tip, the bar's piece in one place) and a made-up progress or world. */
	public static boolean frozenForTest;
	public static Float progressForTest;
	public static String worldForTest;
	/** Which of the loading screens were drawn in our look (kind and step), while a test listens. */
	public static final Set<String> drawnForTest = ConcurrentHashMap.newKeySet();
	public static volatile boolean recordForTest;
	/** Where our Cancel button was drawn last (x, y, w, h in GUI pixels), or null. */
	public static volatile int[] cancelForTest;

	/** The server being joined, noted as the join starts. */
	private static volatile ServerData joining;
	private static volatile String joiningAddress;

	// the server's resource packs, as the game downloads them
	private static volatile int packIndex, packCount;
	private static volatile long packBytes, packTotal = -1, packAt;
	private static volatile boolean packActive;

	// what was drawn last: the screen (a new one starts the bar afresh), the bar, the tips' clock
	private static Screen lastScreen;
	private static float shown;
	private static long lastFrame, tipsFrom;
	private static int tipsOffset;
	private static boolean warned, panoramaFailed;

	// the icon of the server or world in the card
	private static String iconKey;
	private static FaviconTexture icon;
	private static boolean iconReady;

	public static boolean on() {
		return SlashHud.config != null && SlashHud.config.customLoading;
	}

	/** A join starts: the server's name, address and icon for the screen. */
	public static void joining(ServerData data, ServerAddress address) {
		joining = data;
		joiningAddress = address == null ? null : address.getHost() + (address.getPort() == 25565 ? "" : ":" + address.getPort());
		packActive = false;
	}

	//#if MC >= 1.20.3
	/** The game's listener for a batch of resource pack downloads, with ours beside it (each call goes on to the game's first). */
	public static net.minecraft.util.HttpUtil.DownloadProgressListener watchPacks(net.minecraft.util.HttpUtil.DownloadProgressListener game, int count) {
		if (game == null) return null;
		packCount = count;
		packIndex = 0;
		return new net.minecraft.util.HttpUtil.DownloadProgressListener() {
			@Override
			public void requestStart() {
				game.requestStart();
				packIndex = Math.min(packIndex + 1, Math.max(1, packCount));
				packBytes = 0;
				packTotal = -1;
				packAt = System.currentTimeMillis();
				packActive = true;
			}

			@Override
			public void downloadStart(java.util.OptionalLong size) {
				game.downloadStart(size);
				packTotal = size.isPresent() ? size.getAsLong() : -1;
				packAt = System.currentTimeMillis();
			}

			@Override
			public void downloadedBytes(long bytes) {
				game.downloadedBytes(bytes);
				packBytes = bytes;
				packAt = System.currentTimeMillis();
			}

			@Override
			public void requestFinished(boolean ok) {
				game.requestFinished(ok);
				if (packIndex >= packCount) packActive = false;
				packAt = System.currentTimeMillis();
			}
		};
	}
	//#endif

	/** What one of the game's loading screens shows now: which it is, its step, its progress (-1 unknown) and its Cancel button. */
	private record State(String kind, Component stage, float progress, Button cancel) {}

	/** The server or world the screen is about. */
	private record Subject(Component name, Component detail, ServerData server, String iconKey, byte[] iconBytes, Path iconFile, String fallback) {}

	/** Our look over the game's loading screens; any other screen is left alone. */
	public static void afterRender(Screen screen, GuiGraphicsExtractor g, int mx, int my) {
		if (!on() || screen == null) return;
		State st;
		try {
			st = read(screen);
		} catch (RuntimeException e) {
			warn(e);
			return;
		}
		if (st == null) return;
		try {
			draw(screen, g, st, mx, my);
		} catch (RuntimeException e) {
			warn(e);
		}
	}

	/**
	 * The game reloading its resources (a server's packs being applied) under its red Mojang screen:
	 * while one of the loading screens is under it, ours is drawn over it with the reload's progress.
	 * Its Cancel is left out: the game takes no clicks until the reload is done.
	 */
	public static void overPackReload(GuiGraphicsExtractor g, int mx, int my, float progress) {
		// with either our loading screen or our server list on, the join keeps our look
		if (!on() && !(SlashHud.config != null && SlashHud.config.customServerList)) return;
		Screen screen = dev.slash3rss.slashclient.hud.Compat.screen(Minecraft.getInstance());
		if (screen == null) return;
		try {
			if (read(screen) == null) return;
			draw(screen, g, new State("apply", Ui.tr("slashclient-hud.loading.applyPack"), Math.max(0, Math.min(1, progress)), null), mx, my);
		} catch (RuntimeException e) {
			warn(e);
		}
	}

	private static void warn(RuntimeException e) {
		if (warned) return;
		warned = true;
		SlashHud.LOG.warn("Loading screen look failed, the game's own shows", e);
	}

	private static Component plain(Component c) {
		return Ui.text(c == null ? "" : c.getString());
	}

	private static State read(Screen s) {
		Class<?> c = s.getClass();
		if (c == ConnectScreen.class) {
			Component status = ((LoadingScreensAccessor) s).slashclient$status();
			Button cancel = null;
			for (var child : s.children()) if (child instanceof Button b) {
				cancel = b;
				break;
			}
			// a server's resource packs downloading (their toast says the same)
			if (packActive && System.currentTimeMillis() - packAt < 30_000) {
				float p = packTotal > 0 ? Math.min(1f, packBytes / (float) packTotal) : -1;
				Component stage = packCount > 1 ? Ui.tr("slashclient-hud.loading.packOf", packIndex, packCount) : Ui.tr("slashclient-hud.loading.pack");
				return new State("pack", stage, p, cancel);
			}
			return new State("connect", status == null ? Ui.tr("connect.connecting") : plain(status), -1, cancel);
		}
		if (c == ProgressScreen.class) {
			ProgressScreenAccessor p = (ProgressScreenAccessor) s;
			Component header = p.slashclient$header(), stage = p.slashclient$stage();
			String text = header == null ? "" : header.getString();
			if (stage != null && !stage.getString().isEmpty()) text = text.isEmpty() ? stage.getString() : text + " · " + stage.getString();
			int percent = p.slashclient$progress();
			return new State("progress", text.isEmpty() ? Ui.tr("slashclient-hud.loading.wait") : Ui.text(text), percent > 0 ? Math.min(100, percent) / 100f : -1, null);
		}
		//#if MC >= 1.20.3
		if (c == net.minecraft.client.gui.screens.GenericMessageScreen.class) return new State("message", plain(s.getTitle()), -1, null);
		//#else
		//$ if (c == net.minecraft.client.gui.screens.GenericDirtMessageScreen.class) return new State("message", plain(s.getTitle()), -1, null);
		//#endif
		if (c == LevelLoadingScreen.class) {
			//#if MC >= 1.21.9
			LevelLoadingScreenAccessor a = (LevelLoadingScreenAccessor) s;
			// through a portal: the game's own picture of it
			if (a.slashclient$reason() != LevelLoadingScreen.Reason.OTHER) return null;
			var tracker = a.slashclient$tracker();
			if (tracker != null && tracker.hasProgress())
				return new State("spawn", Ui.tr("slashclient-hud.loading.spawn"), Math.max(0, Math.min(1, tracker.serverProgress())), null);
			return new State("terrain", Ui.tr("slashclient-hud.loading.terrain"), -1, null);
			//#else
			//$ var listener = ((LevelLoadingScreenAccessor) s).slashclient$listener();
			//$ return new State("spawn", Ui.tr("slashclient-hud.loading.spawn"), listener == null ? -1 : Math.max(0, Math.min(100, listener.getProgress())) / 100f, null);
			//#endif
		}
		//#if MC < 1.21.9
		//$ if (c == net.minecraft.client.gui.screens.ReceivingLevelScreen.class) {
		//#if MC >= 1.21
		//$ 	if (((dev.slash3rss.slashclient.hud.mixin.ReceivingLevelScreenAccessor) s).slashclient$reason() != net.minecraft.client.gui.screens.ReceivingLevelScreen.Reason.OTHER) return null;
		//#endif
		//$ 	return new State("terrain", Ui.tr("slashclient-hud.loading.terrain"), -1, null);
		//$ }
		//#endif
		return null;
	}

	private static Subject subject(Minecraft mc, State st) {
		if (worldForTest != null) return new Subject(Ui.bold(worldForTest), Ui.tr("slashclient-hud.loading.singleplayer"), null, null, null, null, "world");
		var local = mc.getSingleplayerServer();
		if (local != null) {
			String name = local.getWorldData().getLevelName();
			Path root = local.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
			String id = root.getFileName() == null ? name : root.getFileName().toString();
			return new Subject(Ui.bold(name), Ui.tr("slashclient-hud.loading.singleplayer"), null, "w:" + id, null, local.getWorldPath(LevelResource.ICON_FILE), "world");
		}
		ServerData server = st.kind().equals("connect") || st.kind().equals("pack") || st.kind().equals("apply") || mc.getCurrentServer() == null ? joining : mc.getCurrentServer();
		if (server == null) server = mc.getCurrentServer();
		if (server != null) {
			String address = server.ip != null && !server.ip.isEmpty() ? server.ip : joiningAddress;
			if (mc.options.hideServerAddress) address = null;
			String name = server.name != null && !server.name.isEmpty() ? server.name : address != null ? address : "";
			byte[] bytes = server.getIconBytes();
			String key = bytes == null ? null : "s:" + server.ip + ":" + Arrays.hashCode(bytes);
			return new Subject(Ui.bold(name), address == null || address.equals(name) ? null : Ui.text(address), server, key, bytes, null, "server");
		}
		if (st.kind().equals("spawn")) return new Subject(Ui.bold(Ui.tr("slashclient-hud.loading.newWorld").getString()), Ui.tr("slashclient-hud.loading.singleplayer"), null, null, null, null, "world");
		return null;
	}

	/** The server's or world's icon as a texture, made once for each icon; null when it has none. */
	private static Identifier iconTexture(Minecraft mc, Subject s) {
		if (s.iconKey() == null) return null;
		if (s.iconKey().equals(iconKey)) return iconReady ? icon.textureLocation() : null;
		if (icon != null) icon.close();
		icon = null;
		iconReady = false;
		iconKey = s.iconKey();
		try {
			byte[] bytes = s.iconBytes();
			if (bytes == null && s.iconFile() != null && Files.isRegularFile(s.iconFile()) && Files.size(s.iconFile()) < 1_000_000) bytes = Files.readAllBytes(s.iconFile());
			if (bytes == null) return null;
			// names of our own, so the game's server list and world list keep their textures
			String name = "slashclient-loading-" + Integer.toHexString(s.iconKey().hashCode());
			icon = s.server() != null ? FaviconTexture.forServer(mc.getTextureManager(), name) : FaviconTexture.forWorld(mc.getTextureManager(), name);
			NativeImage image = NativeImage.read(bytes);
			try {
				icon.upload(image);
			} catch (RuntimeException e) {
				image.close();
				throw e;
			}
			iconReady = true;
			return icon.textureLocation();
		} catch (Exception e) {
			return null;
		}
	}

	/** The game's "distortion effects" at 0 (its accessibility setting for less motion): nothing moves. */
	/** The sides of the title screen's panorama, in the order they go round. */
	private static final Identifier[] PANORAMA = {
		Identifier.fromNamespaceAndPath("minecraft", "textures/gui/title/background/panorama_0.png"),
		Identifier.fromNamespaceAndPath("minecraft", "textures/gui/title/background/panorama_1.png"),
		Identifier.fromNamespaceAndPath("minecraft", "textures/gui/title/background/panorama_2.png"),
		Identifier.fromNamespaceAndPath("minecraft", "textures/gui/title/background/panorama_3.png"),
	};

	/**
	 * The title screen's panorama as a slow sideways pan of its four sides, each the screen's height.
	 * Drawn as plain pictures in our own layer: the game's own spinning panorama is drawn under the whole
	 * interface in newer versions, where nothing over the game's loading screen could show it.
	 */
	private static void panorama(GuiGraphicsExtractor g, int w, int h, long ms) {
		int side = Math.max(h, 1);
		int round = side * PANORAMA.length;
		int off = (int) (ms / 60 % round);
		for (int x = -off; x < w; x += side) {
			Identifier face = PANORAMA[Math.floorMod((x + off) / side, PANORAMA.length)];
			g.blit(RenderPipelines.GUI_TEXTURED, face, x, 0, 0, 0, side, side, side, side);
		}
	}

	private static boolean still(Minecraft mc) {
		try {
			return mc.options.screenEffectScale().get() <= 0.0;
		} catch (RuntimeException e) {
			return false;
		}
	}

	private static void draw(Screen screen, GuiGraphicsExtractor g, State st, int mx, int my) {
		Minecraft mc = Minecraft.getInstance();
		boolean still = still(mc);
		long now = System.currentTimeMillis();
		// the clock of the motion: stopped at one moment for a test's screenshots
		long anim = frozenForTest ? 600 : now;
		// a fresh loading (not drawn for a while): the tips start again, from a new one
		if (now - lastFrame > 2000) {
			tipsFrom = now;
			tipsOffset = (int) (now / 1000 % 97);
		}
		long dt = Math.min(200, Math.max(0, now - lastFrame));
		lastFrame = now;
		if (recordForTest) drawnForTest.add(st.kind() + ": " + st.stage().getString());

		float target = progressForTest != null ? progressForTest : st.progress();
		if (screen != lastScreen || target < 0 || still || frozenForTest || target < shown) shown = Math.max(0, target);
		else shown += (target - shown) * Math.min(1f, dt / 180f);
		lastScreen = screen;

		int w = screen.width, h = screen.height;
		// over everything the game drew: in a layer of its own where the game sorts layers
		//#if MC >= 1.21.6
		g.nextStratum();
		//#endif
		Ui.layer(g);
		// every loading screen: the title screen's panorama behind, dimmed as in our menu
		if (!panoramaFailed) {
			g.fill(0, 0, w, h, 0xFF0A0D14);
			try {
				panorama(g, w, h, still ? 0 : anim);
			} catch (RuntimeException e) {
				panoramaFailed = true;
				SlashHud.LOG.warn("Loading screen panorama failed, a plain background shows", e);
			}
			g.fill(0, 0, w, h, 0x990A0D14);
		} else {
			g.fill(0, 0, w, h, 0xFF0A0D14);
		}
		int glowRgb = Season.accent() & 0xFFFFFF;
		g.fillGradient(0, 0, w, h * 2 / 3, 0x20000000 | glowRgb, glowRgb);
		g.fillGradient(0, h / 2, w, h, 0x00000000, 0x70000000);
		Season.sky(g, w, h, anim, still);

		Subject subject = subject(mc, st);
		Button cancel = st.cancel();
		var cfg = SlashHud.config;
		List<Component> tips = cfg.loadingTips && h >= 200 ? LoadingTips.current() : List.of();
		int tipsH = tips.isEmpty() ? 0 : 20;

		int pad = 12;
		int cw = Math.min(300, w - 24);
		int ch = pad + (subject != null ? 32 + 12 : 0) + 9 + 6 + 5 + (cancel != null ? 12 + 20 : 0) + pad;
		boolean logo = h >= 270;
		int head = (logo ? 32 + 8 : 0) + 11 + 14;
		int top = Math.max(6, (h - tipsH - head - ch) / 2);

		// the logo with a soft glow (breathing slowly, still when motion is off), the name under it
		int y = top;
		if (logo) {
			float pulse = still ? 0.5f : (float) (0.5 + 0.5 * Math.sin(anim / 1600.0 * Math.PI));
			int gx = w / 2, gy = y + 16;
			// rings from wide and faint to close and stronger: together a soft halo
			for (int k = 7; k >= 0; k--) {
				int s = 38 + k * 8 + Math.round(pulse * 4);
				if (gy - s / 2 < 0 || gx - s / 2 < 0) continue;
				int alpha = Math.round((10 - k) * (0.75f + 0.25f * pulse));
				Ui.round(g, gx - s / 2, gy - s / 2, s, s, s / 2, alpha << 24 | glowRgb);
			}
			g.blit(RenderPipelines.GUI_TEXTURED, LOGO, (w - 32) / 2, y, 0, 0, 32, 32, 32, 32);
			y += 40;
		}
		Ui.brand(g, (w - Ui.brandWidth(1.3f)) / 2, y, 1.3f);
		Season.lanterns(g, (w - Ui.brandWidth(1.3f)) / 2, y - 3, Ui.brandWidth(1.3f));
		y += 11 + 14;

		// the card
		int cx = (w - cw) / 2, cy = y;
		Ui.panel(g, cx, cy, cw, ch);
		Ui.begin("loading card", cx, cy, cw, ch);
		int iy = cy + pad, inner = cw - pad * 2;
		if (subject != null) {
			int ix = cx + pad;
			if (subject.server() == null || !PartnerIcons.draw(g, subject.server(), ix, iy, 32)) {
				Identifier tex = iconTexture(mc, subject);
				if (tex != null) g.blit(RenderPipelines.GUI_TEXTURED, tex, ix, iy, 0, 0, 32, 32, 32, 32);
				else {
					Ui.round(g, ix, iy, 32, 32, 6, Ui.CARD);
					Ui.roundOutline(g, ix, iy, 32, 32, 6, Ui.BORDER);
					Ui.icon(g, subject.fallback(), ix + 8, iy + 8, 16, Season.accentLight());
				}
			}
			int tx = ix + 32 + 10, tw = cx + cw - pad - tx;
			if (subject.detail() == null) Ui.draw(g, Ui.fit(subject.name(), tw), tx, iy + 12, Ui.TEXT);
			else {
				Ui.draw(g, Ui.fit(subject.name(), tw), tx, iy + 6, Ui.TEXT);
				Ui.draw(g, Ui.fit(subject.detail(), tw), tx, iy + 18, Ui.MUTED);
			}
			iy += 32 + 12;
		}

		// the step and the bar
		boolean known = target >= 0;
		Component percent = known ? Ui.tr("slashclient-hud.loading.percent", Math.round(shown * 100)) : null;
		int pw = percent == null ? 0 : Ui.width(percent) + 8;
		Ui.draw(g, Ui.fit(st.stage(), inner - pw), cx + pad, iy, Ui.TEXT_2);
		if (percent != null) Ui.draw(g, percent, cx + cw - pad - Ui.width(percent), iy, Ui.TEXT);
		int by = iy + 9 + 6;
		bar(g, cx + pad, by, inner, 5, known ? shown : -1, still, anim);

		// the game's Cancel button, moved under ours so clicks and keys reach it as always
		if (cancel != null) {
			Component label = Ui.text(cancel.getMessage().getString());
			int bw = Math.min(inner, Math.max(100, Ui.buttonWidth(label, "close", 20, 8)));
			int bx = cx + (cw - bw) / 2, bty = by + 5 + 12;
			cancel.setX(bx);
			cancel.setY(bty);
			cancel.setWidth(bw);
			Ui.button(g, "loading:cancel", bx, bty, bw, 20, "close", label, false, mx, my);
			if (cancel.isFocused()) Ui.roundOutline(g, bx, bty, bw, 20, 4, Season.accent());
			cancelForTest = new int[] { bx, bty, bw, 20 };
		} else cancelForTest = null;
		Ui.end();

		// a tip at the bottom, a new one every few seconds (fading over, unless motion is off)
		if (!tips.isEmpty()) {
			long t = frozenForTest ? 0 : now - tipsFrom;
			int index = (int) ((frozenForTest ? 0 : tipsOffset + t / TIP_MS) % tips.size());
			long into = t % TIP_MS;
			float fade = still || frozenForTest ? 1f : Math.min(1f, Math.min(into, TIP_MS - into) / 350f);
			int alpha = Math.max(0x14, Math.round(fade * 255));
			Component tip = Ui.fit(tips.get(index), w - 40);
			int total = 8 + 5 + Ui.width(tip);
			int tx = (w - total) / 2, ty = h - 14;
			Ui.icon(g, "info", tx, ty, 8, alpha << 24 | (Season.accentLight() & 0xFFFFFF));
			Ui.draw(g, tip, tx + 13, ty, alpha << 24 | (Ui.TEXT_2 & 0xFFFFFF));
		}
	}

	/** Our progress bar: filled to `p`, or (p < 0) a piece gliding to and fro, a calm full bar when motion is off. */
	private static void bar(GuiGraphicsExtractor g, int x, int y, int w, int h, float p, boolean still, long now) {
		Ui.round(g, x, y, w, h, 2, 0xFF2A3142);
		if (p >= 0) {
			int filled = Math.round(w * Math.min(1, p));
			if (filled > 0) Ui.roundGradient(g, x, y, Math.max(h, filled), h, 2, Season.accentLight(), Season.accent());
			return;
		}
		if (still) {
			Ui.round(g, x, y, w, h, 2, 0x66000000 | (Season.accent() & 0xFFFFFF));
			return;
		}
		int seg = Math.max(h * 2, w / 3);
		double t = 0.5 - 0.5 * Math.cos((now % 1800) / 1800.0 * 2 * Math.PI);
		int sx = x + (int) Math.round((w - seg) * t);
		Ui.roundGradient(g, sx, y, seg, h, 2, Season.accentLight(), Season.accent());
	}
}
