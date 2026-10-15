package dev.slash3rss.slashclient.hud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Options;

/** Small doors for the in-game tests (src/gametest); not used by the mod itself. */
public final class TestHooks {
	private TestHooks() {}

	public static void extras() {
		SlashHud.config.crosshair = "plusdot";
		SlashHud.config.crosshairColor = 0xFF55FF55;
		SlashHud.config.chatTimestamps = true;
	}

	public static KeyMapping zoomKey(Options options) {
		return Extras.zoomKey;
	}

	public static void vanillaMenu() {
		SlashHud.config.customMenu = false;
		net.minecraft.client.Minecraft.getInstance().setScreenAndShow(new net.minecraft.client.gui.screens.TitleScreen());
	}

	/** Every module on, so the editor draws all their previews. */
	public static void allModules() {
		SlashHud.config.modules.values().forEach(p -> p.enabled = true);
	}

	public static void slashMenu() {
		SlashHud.config.customMenu = true;
	}

	/** GUI scale for the size test (the window size is set by the test itself). */
	public static void guiScale(int scale) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.options.guiScale().set(scale);
		mc.resizeGui();
	}

	public static void audit(boolean on) {
		dev.slash3rss.slashclient.hud.ui.Ui.audit = on;
	}

	/** Everything the layout audit found, one line each; empty when all fits. */
	public static void reportAudit() {
		var problems = dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS;
		SlashHud.LOG.info("Layout audit: {} problem(s)", problems.size());
		for (String p : problems) SlashHud.LOG.info("LAYOUT {}", p);
	}

	/** The SlashClient server for the logo test (the launcher normally writes it to a file). */
	public static void badgeServer(String url) {
		Badges.server = url;
	}

	public static void defaults() {
		SlashHud.config.copyFrom(HudConfig.defaults());
	}

	public static void logBadge() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SlashHud.LOG.info("Badge test: own uuid {} shows logo: {}, server says SlashClient: {}", mc.player.getUUID(), Badges.usesSlash(mc.player.getUUID()), Badges.knownFromServer(mc.player.getUUID()));
	}

	/** SkyUp.pl: first after loading, and removing or moving it does nothing. */
	public static void checkPinnedServer() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var list = new net.minecraft.client.multiplayer.ServerList(mc);
		list.load();
		list.add(new net.minecraft.client.multiplayer.ServerData("Inny serwer", "example.org", net.minecraft.client.multiplayer.ServerData.Type.OTHER), false);
		list.save();
		list.load();
		check(PinnedServer.is(list.get(0)), "SkyUp.pl is first after loading");
		list.remove(list.get(0));
		check(PinnedServer.is(list.get(0)), "SkyUp.pl cannot be removed");
		list.swap(0, 1);
		list.swap(1, 0);
		check(PinnedServer.is(list.get(0)) && "example.org".equals(list.get(1).ip), "SkyUp.pl cannot be moved");
		list.replace(0, new net.minecraft.client.multiplayer.ServerData("Zmieniony", "other.example", net.minecraft.client.multiplayer.ServerData.Type.OTHER));
		check(PinnedServer.is(list.get(0)) && PinnedServer.NAME.equals(list.get(0).name), "SkyUp.pl cannot be edited");
		list.save();
		SlashHud.LOG.info("Pinned server test: OK ({} servers, first {})", list.size(), list.get(0).ip);
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	/** Whether the multiplayer screen's button with this translation key can be pressed. */
	public static boolean buttonActive(String key) {
		var screen = net.minecraft.client.Minecraft.getInstance().gui.screen();
		if (screen == null) return false;
		for (var w : net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen)) {
			if (w.getMessage().getString().equals(net.minecraft.network.chat.Component.translatable(key).getString())) return w.active;
		}
		throw new AssertionError("no button " + key);
	}

	public static void endOnVanillaMenu() {
		SlashHud.config.customMenu = false;
	}

	public static void selectTab(int index) {
		ChatTabs.select(index);
	}

	public static void shareRoundTrip() {
		String code = ShareCode.encode(SlashHud.config);
		HudConfig back = ShareCode.decode(code);
		if (back == null || !ShareCode.encode(back).equals(code)) throw new AssertionError("share code does not round-trip: " + code);
		if (ShareCode.decode("SCHUD1:not-a-code") != null || ShareCode.decode("hello") != null) throw new AssertionError("bad codes must be refused");
		SlashHud.LOG.info("Share code ({} chars): {}", code.length(), code);
	}
}
