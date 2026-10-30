package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.ui.SlashLoading;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.GenericMessageScreen;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.ProgressScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;

import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * SlashClient's loading screens (ui.SlashLoading): a real world made and entered is drawn in our
 * look while it loads; still frames of the world's loading (a fixed percentage), saving and a
 * progress screen; a join to a made-up server that takes the connection and never answers (with
 * its name, address and icon), at several window sizes with the layout audit, with motion off,
 * cancelled with our Cancel button; and with the setting off the game's own screens as before.
 */
public class GameLoadingScreens implements FabricClientGameTest {
	private static void size(ClientGameTestContext context, int w, int h, int scale) {
		context.getInput().resizeWindow(w, h);
		context.runOnClient(mc -> TestHooks.guiScale(scale));
		context.waitTicks(4);
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		if (Boolean.getBoolean("slashclient.test.friendsOnly")) return;
		size(context, 854, 480, 2);
		context.runOnClient(mc -> {
			SlashHud.config.customLoading = true;
			SlashHud.config.loadingTips = true;
			SlashLoading.drawnForTest.clear();
			SlashLoading.recordForTest = true;
		});
		try {
			run(context);
		} finally {
			context.runOnClient(mc -> {
				SlashLoading.recordForTest = false;
				SlashLoading.frozenForTest = false;
				SlashLoading.progressForTest = null;
				SlashLoading.worldForTest = null;
				SlashHud.config.customLoading = true;
				mc.options.screenEffectScale().set(1.0);
				TestHooks.audit(false);
			});
			size(context, 854, 480, 2);
		}
		context.runOnClient(mc -> TestHooks.vanillaMenu());
	}

	private void run(ClientGameTestContext context) {
		// a real world, made and entered: its loading is drawn in our look
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(10);
		}
		context.waitTicks(5);
		List<String> drawn = context.computeOnClient(mc -> new ArrayList<>(SlashLoading.drawnForTest));
		System.out.println("SlashClient loading screens drawn while making a world: " + drawn);
		if (drawn.stream().noneMatch(d -> d.startsWith("spawn:") || d.startsWith("terrain:") || d.startsWith("message:")))
			throw new AssertionError("Making a world showed none of our loading screens: " + drawn);

		// still frames: the world's loading at 42 %, saving, a progress screen at 66 %
		context.runOnClient(mc -> {
			TestHooks.audit(true);
			SlashLoading.frozenForTest = true;
			SlashLoading.progressForTest = 0.42f;
			SlashLoading.worldForTest = "Testowy świat";
		});
		context.setScreen(GameLoadingScreens::levelLoading);
		context.waitTicks(4);
		context.takeScreenshot("loading-world");
		// the Halloween season: orange, bats and jack o'lanterns on the loading screen and in the main menu
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.ui.Season.forTest = true);
		context.waitTicks(2);
		context.takeScreenshot("loading-halloween");
		context.setScreen(dev.slash3rss.slashclient.hud.ui.SlashTitleScreen::new);
		context.waitTicks(4);
		context.takeScreenshot("menu-halloween");
		context.setScreen(() -> new net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen(new dev.slash3rss.slashclient.hud.ui.SlashTitleScreen()));
		context.waitTicks(10);
		context.takeScreenshot("servers-halloween");
		context.runOnClient(mc -> dev.slash3rss.slashclient.hud.ui.Season.forTest = false);
		context.setScreen(GameLoadingScreens::levelLoading);
		context.waitTicks(2);
		context.runOnClient(mc -> {
			SlashLoading.progressForTest = null;
			SlashLoading.worldForTest = null;
		});
		context.setScreen(() -> new GenericMessageScreen(Component.translatable("menu.savingLevel")));
		context.waitTicks(4);
		context.takeScreenshot("loading-saving");
		// a server's pack being applied: the game's reload screen over a loading screen shows ours, with its progress
		context.runOnClient(mc -> {
			SlashLoading.drawnForTest.clear();
			overlay(mc, new net.minecraft.client.gui.screens.LoadingOverlay(mc, new net.minecraft.server.packs.resources.ReloadInstance() {
				@Override
				public java.util.concurrent.CompletableFuture<?> done() {
					return new java.util.concurrent.CompletableFuture<>();
				}

				@Override
				public float getActualProgress() {
					return 0.6f;
				}
			}, e -> {}, true));
		});
		context.waitTicks(20);
		context.takeScreenshot("loading-pack-apply");
		boolean applied = context.computeOnClient(mc -> SlashLoading.drawnForTest.stream().anyMatch(d -> d.startsWith("apply:")));
		context.runOnClient(mc -> overlay(mc, null));
		if (!applied) throw new AssertionError("The pack reload was not drawn in our look: " + context.computeOnClient(mc -> new ArrayList<>(SlashLoading.drawnForTest)));
		context.setScreen(() -> {
			ProgressScreen p = new ProgressScreen(false);
			// the game's own texts (a Realms download), so they are in the game's language like the hint under them
			p.progressStartNoAbort(Component.translatable("mco.download.title"));
			p.progressStage(Component.translatable("mco.download.extracting"));
			p.progressStagePercentage(66);
			return p;
		});
		context.waitTicks(4);
		context.takeScreenshot("loading-progress");

		// a join to a server that takes the connection and never answers
		List<Socket> held = new CopyOnWriteArrayList<>();
		try (ServerSocket server = new ServerSocket(0, 50, InetAddress.getLoopbackAddress())) {
			Thread accept = new Thread(() -> {
				while (!server.isClosed()) {
					try {
						held.add(server.accept());
					} catch (IOException e) {
						return;
					}
				}
			}, "SlashClient test: silent server");
			accept.setDaemon(true);
			accept.start();
			String address = "127.0.0.1:" + server.getLocalPort();
			join(context, address);
			context.waitTicks(20);
			if (!context.computeOnClient(mc -> SlashLoading.drawnForTest.stream().anyMatch(d -> d.startsWith("connect:"))))
				throw new AssertionError("The join was not drawn in our look: " + SlashLoading.drawnForTest);
			context.takeScreenshot("loading-connect");

			// window sizes, with the layout audit
			int[][] sizes = { { 640, 480, 2 }, { 1920, 1080, 3 }, { 1920, 1080, 1 }, { 1280, 720, 2 }, { 854, 480, 3 } };
			for (int[] s : sizes) {
				size(context, s[0], s[1], s[2]);
				context.takeScreenshot("loading-connect-" + s[0] + "x" + s[1] + "-gui" + s[2]);
			}
			size(context, 854, 480, 2);

			// motion off (the game's distortion effects at 0): a calm bar
			context.runOnClient(mc -> {
				SlashLoading.frozenForTest = false;
				mc.options.screenEffectScale().set(0.0);
			});
			context.waitTicks(4);
			context.takeScreenshot("loading-connect-still");
			context.runOnClient(mc -> mc.options.screenEffectScale().set(1.0));

			String problems = context.computeOnClient(mc -> String.join("\n", Ui.PROBLEMS));
			context.runOnClient(mc -> TestHooks.audit(false));
			if (!problems.isEmpty()) throw new AssertionError("Loading screen layout:\n" + problems);

			// our Cancel button is the game's: a click on it stops the join
			clickCancel(context);
			context.waitFor(mc -> !(Compat.screen(mc) instanceof ConnectScreen), 100);

			// switched off: the game's own screen, its button where the game puts it, nothing of ours
			context.runOnClient(mc -> {
				SlashHud.config.customLoading = false;
				SlashLoading.drawnForTest.clear();
			});
			join(context, address);
			context.waitTicks(20);
			context.takeScreenshot("loading-connect-vanilla");
			if (!context.computeOnClient(mc -> SlashLoading.drawnForTest.isEmpty()))
				throw new AssertionError("With the setting off our look still showed: " + SlashLoading.drawnForTest);
			int[] box = context.computeOnClient(mc -> {
				Button b = cancelButton(mc);
				return new int[] { b.getX(), b.getWidth(), Compat.screen(mc).width };
			});
			if (box[0] != box[2] / 2 - 100 || box[1] != 200) throw new AssertionError("The game's Cancel button is not where the game puts it: x " + box[0] + " w " + box[1]);
			// the game's own Cancel stops this join
			context.clickScreenButton("gui.cancel");
			context.waitFor(mc -> !(Compat.screen(mc) instanceof ConnectScreen), 100);
			context.setScreen(() -> new GenericMessageScreen(Component.translatable("menu.savingLevel")));
			context.waitTicks(4);
			context.takeScreenshot("loading-saving-vanilla");
			if (!context.computeOnClient(mc -> SlashLoading.drawnForTest.isEmpty()))
				throw new AssertionError("With the setting off our look still showed: " + SlashLoading.drawnForTest);
		} catch (IOException e) {
			throw new AssertionError("No test server", e);
		} finally {
			for (Socket s : held) {
				try {
					s.close();
				} catch (IOException ignored) {
				}
			}
		}
		context.setScreen(TitleScreen::new);
		context.waitTicks(2);
	}

	private static LevelLoadingScreen levelLoading() {
		//#if MC >= 1.21.9
		return new LevelLoadingScreen(new net.minecraft.client.multiplayer.LevelLoadTracker(), LevelLoadingScreen.Reason.OTHER);
		//#else
		//$ return new LevelLoadingScreen(net.minecraft.server.level.progress.StoringChunkProgressListener.createCompleted());
		//#endif
	}

	private static void join(ClientGameTestContext context, String address) {
		context.runOnClient(mc -> {
			ServerData data = new ServerData("Testowy serwer", address, ServerData.Type.OTHER);
			data.setIconBytes(icon());
			ConnectScreen.startConnecting(new TitleScreen(), mc, ServerAddress.parseString(address), data, false, null);
		});
		context.waitFor(mc -> Compat.screen(mc) instanceof ConnectScreen, 200);
	}

	private static Button cancelButton(Minecraft mc) {
		for (var child : Compat.screen(mc).children()) if (child instanceof Button b) return b;
		throw new AssertionError("No Cancel button on " + Compat.screen(mc));
	}

	/** Our Cancel button is drawn exactly over the game's (moved there), so the game's click on it is a click on ours. */
	private static void clickCancel(ClientGameTestContext context) {
		int[] box = context.computeOnClient(mc -> SlashLoading.cancelForTest);
		if (box == null) throw new AssertionError("Our Cancel button was not drawn");
		int[] game = context.computeOnClient(mc -> {
			Button b = cancelButton(mc);
			return new int[] { b.getX(), b.getY(), b.getWidth(), b.getHeight() };
		});
		if (!java.util.Arrays.equals(box, game)) throw new AssertionError("Our Cancel " + java.util.Arrays.toString(box) + " is not over the game's " + java.util.Arrays.toString(game));
		context.clickScreenButton("gui.cancel");
		context.waitTicks(3);
	}

	/** A made-up 64×64 server icon. */
	private static byte[] icon() {
		try {
			java.awt.image.BufferedImage img = new java.awt.image.BufferedImage(64, 64, java.awt.image.BufferedImage.TYPE_INT_ARGB);
			for (int x = 0; x < 64; x++) for (int y = 0; y < 64; y++) {
				float f = (x + y) / 128f;
				img.setRGB(x, y, java.awt.Color.HSBtoRGB((150 + f * 60) / 360f, 0.6f, 0.45f + f * 0.45f));
			}
			var out = new java.io.ByteArrayOutputStream();
			javax.imageio.ImageIO.write(img, "png", out);
			return out.toByteArray();
		} catch (IOException e) {
			return null;
		}
	}

	private static void overlay(net.minecraft.client.Minecraft mc, net.minecraft.client.gui.screens.Overlay o) {
		//#if MC >= 26.2
		mc.gui.setOverlay(o);
		//#else
		//$ mc.setOverlay(o);
		//#endif
	}
}
