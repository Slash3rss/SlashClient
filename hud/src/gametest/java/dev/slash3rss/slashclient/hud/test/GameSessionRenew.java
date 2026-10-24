package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.SessionRenew;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import dev.slash3rss.slashclient.hud.TestHooks;
import net.minecraft.client.gui.screens.DisconnectedScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;

/**
 * The game's session renewed without a restart, with a made-up launcher and made-up tokens (no
 * Microsoft, no real account): in the menu the token is swapped at once, in a world it waits for
 * the menu, a join renews a token about to end first, and a server refusing the session gets it
 * renewed at once with a line on the "disconnected" screen.
 */
public class GameSessionRenew implements FabricClientGameTest {
	private static final long HOUR = 3_600_000L;

	/** What the made-up launcher hands out next, and whether the last ask was forced. */
	private static volatile String next;
	private static volatile boolean forced;

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		String name = context.computeOnClient(mc -> mc.getUser().getName());
		String uuid = context.computeOnClient(mc -> mc.getUser().getProfileId().toString());
		context.runOnClient(mc -> {
			SlashHud.config.sessionRenew = true;
			SessionRenew.offlineServicesForTest = true;
			SessionRenew.asked.clear();
			SessionRenew.fakeLauncher = force -> {
				forced = force;
				JsonObject o = new JsonObject();
				o.addProperty("type", "msa");
				o.addProperty("name", name);
				o.addProperty("uuid", uuid);
				o.addProperty("accessToken", next);
				o.addProperty("xuid", "");
				o.addProperty("expiresAt", System.currentTimeMillis() + 24 * HOUR);
				return o;
			};
		});
		try {
			// in the menu, an hour left: the timer's look swaps the token at once
			context.setScreen(TitleScreen::new);
			String t1 = token(24, "one");
			next = t1;
			context.runOnClient(mc -> {
				SessionRenew.expiresForTest(System.currentTimeMillis() + HOUR);
				SessionRenew.checkSoon();
			});
			context.waitTicks(20);
			expect(context, t1, "in the menu");
			if (!SessionRenew.asked.equals(List.of("timer"))) throw new AssertionError("Asked: " + SessionRenew.asked);
			// a day left now: no more asking
			context.runOnClient(mc -> SessionRenew.checkSoon());
			context.waitTicks(10);
			if (SessionRenew.asked.size() != 1) throw new AssertionError("Asked again with a day left: " + SessionRenew.asked);

			// in a world: fetched, but taken in only back in the menu
			String t2 = token(24, "two");
			next = t2;
			try (TestSingleplayerContext world = context.worldBuilder().create()) {
				context.waitTicks(20);
				context.runOnClient(mc -> {
					SessionRenew.expiresForTest(System.currentTimeMillis() + HOUR);
					SessionRenew.checkSoon();
				});
				context.waitTicks(20);
				expect(context, t1, "while in a world (deferred)");
				if (!context.computeOnClient(mc -> SessionRenew.pendingForTest())) throw new AssertionError("No renewed session waiting for the menu");
			}
			context.waitTicks(10);
			expect(context, t2, "back in the menu");

			// joining a server with a token about to end: renewed first, then the join goes on
			String t3 = token(24, "three");
			next = t3;
			SessionRenew.asked.clear();
			context.runOnClient(mc -> SessionRenew.expiresForTest(System.currentTimeMillis() + 30 * 60_000L));
			context.runOnClient(mc -> dev.slash3rss.slashclient.hud.social.Social.join("127.0.0.1:1"));
			context.waitFor(mc -> dev.slash3rss.slashclient.hud.Compat.screen(mc) instanceof DisconnectedScreen, 400);
			expect(context, t3, "before connecting");
			if (!SessionRenew.asked.equals(List.of("connect"))) throw new AssertionError("Asked before the join: " + SessionRenew.asked);

			// a server refusing the session: renewed at once (forced), and the screen says to connect again
			String t4 = token(24, "four");
			next = t4;
			SessionRenew.asked.clear();
			context.setScreen(() -> new DisconnectedScreen(new TitleScreen(), Component.translatable("connect.failed"),
				Component.translatable("disconnect.loginFailedInfo", Component.translatable("disconnect.loginFailedInfo.invalidSession"))));
			context.waitTicks(20);
			expect(context, t4, "after the server refused the session");
			if (!SessionRenew.asked.equals(List.of("refused")) || !forced) throw new AssertionError("Not renewed at once: " + SessionRenew.asked + " forced " + forced);
			boolean shown = context.computeOnClient(mc -> Screens.getWidgets(dev.slash3rss.slashclient.hud.Compat.screen(mc)).stream().anyMatch(w ->
				w.getMessage().getContents() instanceof TranslatableContents t && t.getKey().equals("slashclient-hud.sessionRenew.renewed")));
			if (!shown) throw new AssertionError("No line about the renewed session");
			context.takeScreenshot("session-renewed");

			// "Reconnect" once: not again when the screen is laid out anew, and not beside another mod's
			context.runOnClient(mc -> TestHooks.reconnectTo(new net.minecraft.client.multiplayer.ServerData("Testowy", "127.0.0.1:1",
				//#if MC >= 1.20.2
				net.minecraft.client.multiplayer.ServerData.Type.OTHER)));
				//#else
				//$ false)));
				//#endif
			context.setScreen(() -> new DisconnectedScreen(new TitleScreen(), Component.translatable("connect.failed"), Component.literal("Timed out")));
			context.waitTicks(3);
			context.runOnClient(mc -> {
				var s = dev.slash3rss.slashclient.hud.Compat.screen(mc);
				//#if MC >= 26.1
				s.resize(s.width, s.height);
				//#else
				//$ s.resize(mc, s.width, s.height);
				//#endif
			});
			context.waitTicks(3);
			if (reconnects(context) != 1) throw new AssertionError("Reconnect buttons: " + reconnects(context));
			// a smaller window: the button follows the game's buttons, centred
			context.getInput().resizeWindow(700, 420);
			context.waitTicks(4);
			String placed = context.computeOnClient(mc -> {
				var s = dev.slash3rss.slashclient.hud.Compat.screen(mc);
				var w = Screens.getWidgets(s).stream().filter(x -> x.getMessage().getString().equalsIgnoreCase("Reconnect") || x.getMessage().getString().equals("Połącz ponownie")).findFirst().orElseThrow();
				int othersBottom = Screens.getWidgets(s).stream().filter(x -> x != w).mapToInt(x -> x.getY() + x.getHeight()).max().orElse(0);
				return (w.getX() + w.getWidth() / 2 == s.width / 2) + " " + (w.getY() >= othersBottom && w.getY() + w.getHeight() <= s.height);
			});
			context.takeScreenshot("reconnect-resized");
			context.getInput().resizeWindow(854, 480);
			context.waitTicks(4);
			if (!placed.equals("true true")) throw new AssertionError("Reconnect after a resize: " + placed);
			context.setScreen(() -> new DisconnectedScreen(new TitleScreen(), Component.translatable("connect.failed"), Component.literal("Timed out")) {
				@Override
				protected void init() {
					super.init();
					addRenderableWidget(net.minecraft.client.gui.components.Button.builder(Component.literal("Reconnect"), b -> {}).bounds(10, 10, 80, 20).build());
				}
			});
			context.waitTicks(3);
			if (reconnects(context) != 1) throw new AssertionError("Beside another mod's Reconnect: " + reconnects(context));
			context.runOnClient(mc -> TestHooks.reconnectTo(null));
		} finally {
			context.runOnClient(mc -> {
				SessionRenew.fakeLauncher = null;
				SessionRenew.offlineServicesForTest = false;
			});
			context.setScreen(TitleScreen::new);
		}
	}

	/** Buttons on the screen that reconnect (ours or another mod's). */
	private static long reconnects(ClientGameTestContext context) {
		return context.computeOnClient(mc -> Screens.getWidgets(dev.slash3rss.slashclient.hud.Compat.screen(mc)).stream()
			.filter(w -> w.getMessage().getString().equalsIgnoreCase("Reconnect") || w.getMessage().getString().equals("Połącz ponownie")).count());
	}

	private static void expect(ClientGameTestContext context, String token, String when) {
		String now = context.computeOnClient(mc -> mc.getUser().getAccessToken());
		if (!token.equals(now)) throw new AssertionError("Wrong token " + when + ": " + now);
	}

	/** A made-up token shaped like Minecraft's (a JWT with its end in it), signed by nobody. */
	private static String token(int hours, String id) {
		Base64.Encoder b = Base64.getUrlEncoder().withoutPadding();
		long exp = System.currentTimeMillis() / 1000 + hours * 3600L;
		return b.encodeToString("{\"alg\":\"none\"}".getBytes(StandardCharsets.UTF_8)) + "."
			+ b.encodeToString(("{\"exp\":" + exp + ",\"test\":\"" + id + "\"}").getBytes(StandardCharsets.UTF_8)) + ".fake";
	}
}
