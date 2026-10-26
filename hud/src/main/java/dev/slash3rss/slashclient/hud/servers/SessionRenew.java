package dev.slash3rss.slashclient.hud.servers;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.slash3rss.slashclient.hud.social.Social;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.components.StringWidget;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import dev.slash3rss.slashclient.hud.AccountSwitch;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;

/**
 * Keeps the game's Microsoft session alive without a restart. The token the game gets at launch lasts
 * about a day; after that joining a server fails with "Invalid session" until the game is restarted.
 * So every ten minutes, while the token has under two hours left, the launcher gives a fresh one for
 * the same account and the game takes it in (in the menus; in a world it waits for the next menu).
 * Right before joining a server it is checked once more, and a server that still refuses the session
 * gets it renewed at once, with a line on the "disconnected" screen saying to connect again.
 */
public final class SessionRenew {
	private SessionRenew() {}

	static final long MARGIN_MS = 2 * 60 * 60_000L;
	static final long EVERY_MS = 10 * 60_000L;
	/** The first look shortly after the game starts (the launcher may have a fresher token already). */
	static final long FIRST_MS = 20_000L;
	/** A server refusing the session renews it at most this often (no loop with a server that refuses for another reason). */
	static final long REFUSED_GAP_MS = 60_000L;

	/** Reasons a server (or the game itself) gives for a session it does not accept. */
	private static final Set<String> REFUSED_KEYS = Set.of("disconnect.loginFailedInfo.invalidSession", "disconnect.loginFailed",
		"multiplayer.disconnect.unverified_username", "multiplayer.disconnect.expired_public_key", "multiplayer.disconnect.invalid_public_key_signature");
	/** The same from proxies that write their own text. */
	private static final String[] REFUSED_TEXT = {"invalid session", "failed to log in", "failed to verify username", "unable to authenticate"};

	/** Stands in for the launcher in the game tests (true: forced); null asks the real one. */
	public static volatile Function<Boolean, JsonObject> fakeLauncher;
	/** The tests' tokens are made up: the account services are not asked about them. */
	public static volatile boolean offlineServicesForTest;
	/** For the test: what was asked ("timer", "connect", "refused"), in order. */
	public static final java.util.List<String> asked = new java.util.concurrent.CopyOnWriteArrayList<>();

	private static long nextCheck;
	/** A token and when it ends, as the launcher told (for tokens that are not readable JWTs). */
	private static volatile String knownToken;
	private static volatile long knownExpiry;
	/** The launcher said this token's account is offline, or has nothing for it: no more asking for it. */
	private static volatile String settledToken;
	/** A fresh session fetched while it could not be taken in (in a world): taken in at the next menu. */
	private static volatile JsonObject pending;
	private static volatile boolean busy;
	/** Joining a server again after renewing first: that one call goes through. */
	private static boolean retrying;
	private static long lastRefused;
	/** The "disconnected" screen that gets the line about the renewed session, and the line. */
	private static Screen noticeScreen;
	private static Component notice;

	private static boolean enabled() {
		return SlashHud.config != null && SlashHud.config.sessionRenew && (fakeLauncher != null || Social.bridged());
	}

	/** When the token ends (ms), 0 when not known. */
	static long expiry(String token) {
		if (token == null) return 0;
		if (token.equals(knownToken)) return knownExpiry;
		String[] parts = token.split("\\.");
		if (parts.length != 3) return 0;
		try {
			JsonObject payload = JsonParser.parseString(new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8)).getAsJsonObject();
			return payload.has("exp") ? payload.get("exp").getAsLong() * 1000L : 0;
		} catch (Exception e) {
			return 0;
		}
	}

	/** Whether the game's token should be renewed now: under two hours left, or not known and not asked about yet. */
	static boolean due(Minecraft mc, long now) {
		String token = mc.getUser().getAccessToken();
		if (token.equals(settledToken)) return false;
		long end = expiry(token);
		return end == 0 || end - now < MARGIN_MS;
	}

	public static void tick(Minecraft mc) {
		if (!enabled()) return;
		JsonObject fresh = pending;
		if (fresh != null && AccountSwitch.available(mc)) {
			pending = null;
			take(mc, fresh);
		}
		long now = System.currentTimeMillis();
		if (nextCheck == 0) nextCheck = now + FIRST_MS;
		if (now < nextCheck) return;
		nextCheck = now + EVERY_MS;
		if (pending == null && due(mc, now)) fetch(mc, false, "timer", null);
	}

	/** For the test: the next tick looks at the session (instead of up to ten minutes later). */
	public static void checkSoon() {
		nextCheck = 1;
	}

	/** For the test: the game's current token ends at this time. */
	public static void expiresForTest(long at) {
		knownToken = Minecraft.getInstance().getUser().getAccessToken();
		knownExpiry = at;
		settledToken = null;
	}

	public static boolean pendingForTest() {
		return pending != null;
	}

	/**
	 * Asks the launcher on a background thread; the answer is taken in on the game's thread when it can be
	 * (else kept for the next menu); `then` runs after it on the game's thread, taken in or not.
	 */
	private static void fetch(Minecraft mc, boolean force, String why, java.util.function.Consumer<String> then) {
		if (busy) {
			if (then != null) mc.execute(() -> then.accept("busy"));
			return;
		}
		busy = true;
		asked.add(why);
		String token = mc.getUser().getAccessToken();
		Thread.ofVirtual().start(() -> {
			String error = null;
			JsonObject answer = null;
			try {
				Function<Boolean, JsonObject> fake = fakeLauncher;
				answer = fake != null ? fake.apply(force) : Social.session(force);
			} catch (Exception e) {
				error = String.valueOf(e.getMessage());
				SlashHud.LOG.warn("SlashClient: session renewal: {}", error);
			}
			JsonObject got = answer;
			String failed = error;
			mc.execute(() -> {
				busy = false;
				String result = failed != null ? failed : handle(mc, token, got);
				if (then != null) then.accept(result);
			});
		});
	}

	/**
	 * What the launcher said, on the game's thread: null when a fresh token was taken in, "unchanged" when the
	 * game's token is still the launcher's, "later" when it waits for the menu, else why not.
	 */
	private static String handle(Minecraft mc, String before, JsonObject answer) {
		// an older launcher, an offline account, or no game account there: nothing to renew for this token
		if (answer == null || !"msa".equals(str(answer, "type"))) {
			settledToken = before;
			return "offline";
		}
		String token = str(answer, "accessToken");
		long end = answer.has("expiresAt") ? answer.get("expiresAt").getAsLong() : 0;
		UUID uuid;
		try {
			uuid = UUID.fromString(str(answer, "uuid"));
		} catch (IllegalArgumentException e) {
			return "bad answer";
		}
		// never another account than the one the game plays as (the player switched in the meantime)
		if (!uuid.equals(mc.getUser().getProfileId())) return "other account";
		if (token.equals(mc.getUser().getAccessToken())) {
			knownToken = token;
			knownExpiry = end;
			return "unchanged";
		}
		knownToken = token;
		knownExpiry = end;
		if (AccountSwitch.available(mc)) return take(mc, answer);
		pending = answer;
		return "later";
	}

	private static String take(Minecraft mc, JsonObject s) {
		try {
			UUID uuid = UUID.fromString(str(s, "uuid"));
			if (!uuid.equals(mc.getUser().getProfileId())) return "other account";
			AccountSwitch.renew(mc, str(s, "name"), uuid, str(s, "accessToken"), str(s, "xuid"), offlineServicesForTest);
			return null;
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: taking in the renewed session failed", e);
			return String.valueOf(e.getMessage());
		}
	}

	/**
	 * Right before joining a server (ConnectScreenMixin): with a token about to end, the join waits for a
	 * fresh one (a second or two), then goes on with `join`. True when it waits (the call is cancelled).
	 */
	public static boolean beforeConnect(Minecraft mc, Runnable join) {
		if (retrying || !enabled()) return false;
		JsonObject fresh = pending;
		if (fresh != null && AccountSwitch.available(mc)) {
			pending = null;
			take(mc, fresh);
		}
		if (!due(mc, System.currentTimeMillis())) return false;
		fetch(mc, false, "connect", result -> {
			retrying = true;
			try {
				join.run();
			} finally {
				retrying = false;
			}
		});
		return true;
	}

	/** The "disconnected" screen: a refused session gets renewed at once, and the screen says so. */
	public static void disconnected(Minecraft mc, Screen screen) {
		if (screen == noticeScreen && notice != null) {
			show(screen, notice);
			return;
		}
		if (!enabled() || !refused(screen)) return;
		long now = System.currentTimeMillis();
		if (now - lastRefused < REFUSED_GAP_MS) return;
		lastRefused = now;
		fetch(mc, true, "refused", result -> {
			// the same token as before (renewed a moment ago) or no Microsoft account: the server refused for
			// another reason, nothing to say
			if (result != null && Set.of("unchanged", "offline", "other account", "busy").contains(result)) return;
			Component line = result == null
				? Component.translatable("slashclient-hud.sessionRenew.renewed")
				: Component.translatable("slashclient-hud.sessionRenew.failed");
			noticeScreen = screen;
			notice = line;
			if (Compat.screen(mc) == screen) show(screen, line);
		});
	}

	private static void show(Screen screen, Component line) {
		var widgets = Screens.getWidgets(screen);
		int top = widgets.stream().mapToInt(AbstractWidget::getY).min().orElse(screen.height / 2);
		var font = Minecraft.getInstance().font;
		Component text = line.copy().withStyle(net.minecraft.ChatFormatting.YELLOW);
		int w = font.width(text);
		widgets.add(new StringWidget((screen.width - w) / 2, Math.max(4, top - 16), w, 10, text, font));
	}

	/** Whether the screen's text says the server did not accept the session. */
	static boolean refused(Screen screen) {
		for (AbstractWidget w : Screens.getWidgets(screen)) if (refused(w.getMessage(), 0)) return true;
		return false;
	}

	static boolean refused(Component c, int depth) {
		if (c == null || depth > 6) return false;
		if (c.getContents() instanceof TranslatableContents t) {
			if (REFUSED_KEYS.contains(t.getKey())) return true;
			for (Object arg : t.getArgs()) if (arg instanceof Component a && refused(a, depth + 1)) return true;
		}
		for (Component sibling : c.getSiblings()) if (refused(sibling, depth + 1)) return true;
		// a proxy's own words; the game's translated reasons are matched by key above (its "Failed to log in"
		// also covers the login servers being down, which a new token does not fix)
		if (depth == 0 && !(c.getContents() instanceof TranslatableContents)) {
			String text = c.getString().toLowerCase(Locale.ROOT);
			for (String s : REFUSED_TEXT) if (text.contains(s)) return true;
		}
		return false;
	}

	private static String str(JsonObject o, String key) {
		return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
	}
}
