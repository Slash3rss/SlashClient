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

	public static void crosshairStyle(String style) {
		SlashHud.config.crosshair = style;
		SlashHud.config.crosshairOutline = true;
	}

	private static net.minecraft.client.gui.screens.Screen screen() {
		return Compat.screen(net.minecraft.client.Minecraft.getInstance());
	}

	/**
	 * The left mouse button straight on the open screen, in GUI coordinates: "press", "drag" or
	 * "release" (the test's own mouse does not reach an unfocused game window).
	 */
	public static void mouse(String action, double[] at) {
		var e = new net.minecraft.client.input.MouseButtonEvent(at[0], at[1], new net.minecraft.client.input.MouseButtonInfo(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT, 0));
		switch (action) {
			case "press" -> screen().mouseClicked(e, false);
			case "drag" -> screen().mouseDragged(e, 0, 0);
			default -> screen().mouseReleased(e);
		}
	}

	public static double[] gridPoint(int cx, int cy) {
		return ((HudEditScreen) screen()).gridCellCenter(cx, cy);
	}

	/** The × of a module in the layout editor, with the mouse put on the module first so it shows. */
	public static double[] closePoint(String id) {
		SlashHud.config.placement(id).enabled = true;
		return ((HudEditScreen) screen()).closeCenter(id);
	}

	/** The modules from ExtraModules on (the editor shows them all, the HUD those with something to show). */
	public static void extraModules(boolean on) {
		for (HudModule m : ExtraModules.all()) SlashHud.config.placement(m.id()).enabled = on;
	}

	/** Hits the nearest other living entity, as a left click on it would. */
	public static boolean attackNearest() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		net.minecraft.world.entity.Entity best = null;
		for (var e : mc.level.entitiesForRendering()) {
			if (e == mc.player || !(e instanceof net.minecraft.world.entity.LivingEntity)) continue;
			if (best == null || e.distanceTo(mc.player) < best.distanceTo(mc.player)) best = e;
		}
		if (best == null) return false;
		mc.gameMode.attack(mc.player, best);
		return true;
	}

	/** Kills, deaths and TPS as the modules see them. */
	public static String moduleStats() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		return ExtraModules.Stats.kills + " " + ExtraModules.Stats.deaths + " " + ExtraModules.Tps.tps(mc) + " " + ExtraModules.Stats.hitAt;
	}

	/** CPU and GPU modules on. */
	public static void cpuGpu() {
		SlashHud.config.placement("cpu").enabled = true;
		SlashHud.config.placement("gpu").enabled = true;
	}

	/** What the CPU and GPU modules read: 0..1 and 0..100. */
	public static String cpuGpuValues() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		return MoreModules.Cpu.load() + " " + mc.getGpuUtilization();
	}

	public static boolean moduleOn(String id) {
		return SlashHud.config.placement(id).enabled;
	}

	public static String crosshairState() {
		return SlashHud.config.crosshair + " " + SlashHud.config.crosshairPattern;
	}

	public static KeyMapping zoomKey(Options options) {
		return Extras.zoomKey;
	}

	public static void vanillaMenu() {
		SlashHud.config.customMenu = false;
		net.minecraft.client.Minecraft.getInstance().setScreenAndShow(new net.minecraft.client.gui.screens.TitleScreen());
	}

	/** The game HUD parts changed so the screenshot shows every setting at work. */
	public static void gameParts() {
		HudConfig c = SlashHud.config;
		c.scoreboardScale = 0.8f;
		c.scoreboardOffset = -40;
		c.scoreboardNumbers = false;
		c.bossBarScale = 0.8f;
		c.bossBarOffset = 6;
		c.tabNumericPing = true;
		c.titleScale = 0.6f;
		c.ownNametag = true;
	}

	public static void thirdPerson(boolean on) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.options.setCameraType(on ? net.minecraft.client.CameraType.THIRD_PERSON_BACK : net.minecraft.client.CameraType.FIRST_PERSON);
	}

	/** A waypoint ahead of the player, night only for us, the sprint indicator on. */
	public static void worldExtras() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		HudConfig c = SlashHud.config;
		c.timeChanger = true;
		c.fixedTime = 18000;
		c.freelook = true;
		c.placement("sprint").enabled = true;
		var p = Waypoints.add(mc, "Baza");
		p.z += 12;
		p.y += 1;
		Waypoints.save();
	}

	/** The chat's messages, newest first, as plain text. */
	public static String chatLines() {
		var chat = Compat.chat(net.minecraft.client.Minecraft.getInstance());
		StringBuilder sb = new StringBuilder();
		for (Object m : ((dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) chat).slashclient$allMessages()) {
			sb.append(((net.minecraft.client.multiplayer.chat.GuiMessage) m).content().getString()).append(" | ");
		}
		return sb.toString();
	}

	/** What a right click on the n-th line from the bottom of the open chat copies. */
	public static String copyLine(int fromBottom) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		double scale = mc.options.chatScale().get();
		int lineHeight = (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
		double y = ((mc.getWindow().getGuiScaledHeight() - 40) / scale - lineHeight * (fromBottom + 0.5)) * scale;
		return ChatExtras.messageAt(10, y);
	}

	public static void chatSearch(String text) {
		ChatTabs.searchFor(text);
	}

	public static void screenshot() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		//#if MC >= 26.2
		net.minecraft.client.Screenshot.grab(mc, false);
		//#else
		//$ net.minecraft.client.Screenshot.grab(mc.gameDirectory, mc.getMainRenderTarget(), m -> {});
		//#endif
	}

	/** Turns the mouse a lot while freelook is held: true when the player kept facing the same way. */
	public static boolean freelookTurn() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (!Freelook.active()) return false;
		float yaw = mc.player.getYRot();
		mc.player.turn(600, -100);
		return mc.player.getYRot() == yaw;
	}

	/** Plays as an offline account of this name from now on; returns the game's user name after. */
	public static String switchAccount(String name) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		try {
			AccountSwitch.apply(mc, name, java.util.UUID.nameUUIDFromBytes(("OfflinePlayer:" + name).getBytes()), "0", "", true);
		} catch (Exception e) {
			return "error: " + e;
		}
		return mc.getUser().getName();
	}

	/** One chat tab, so the chat tabs page has a row to show. */
	public static void sampleChatTab() {
		if (!SlashHud.config.chatTabs.isEmpty()) return;
		HudConfig.ChatTab tab = new HudConfig.ChatTab("Party", false);
		tab.patterns.add("[Party]");
		SlashHud.config.chatTabs.add(tab);
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
		var screen = Compat.screen(net.minecraft.client.Minecraft.getInstance());
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
