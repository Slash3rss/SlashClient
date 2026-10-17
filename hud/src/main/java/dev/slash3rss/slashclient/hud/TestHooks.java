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
		StringBuilder near = new StringBuilder();
		for (var e : mc.level.entitiesForRendering()) {
			if (e instanceof net.minecraft.world.entity.LivingEntity le && e != mc.player) near.append(" [").append(e.getType().toShortString()).append(" hp=").append(le.getHealth()).append(" dead=").append(le.isDeadOrDying()).append(" removed=").append(e.isRemoved()).append(']');
		}
		return ExtraModules.Stats.kills + " " + ExtraModules.Stats.deaths + " " + ExtraModules.Tps.tps(mc) + " " + ExtraModules.Stats.hitAt + near;
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

	/** The local player's logo in a rank's colour, as the server would answer. */
	public static void ownRank(String rank) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Badges.setRank(mc.player.getUUID(), rank);
		// the name as the tab list and the nametag show it, written to the chat so the screenshot has it
		if (rank != null) Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal(rank + ": ")
			.append(Badges.decorate(mc.player.getUUID(), mc.player.getName())));
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
		// a fresh list: what an earlier test reported is not counted again
		if (on) dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS.clear();
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

	public static void startBenchmark() {
		Benchmark.start(net.minecraft.client.Minecraft.getInstance());
	}

	public static boolean benchmarkRunning() {
		return Benchmark.running();
	}

	/** The newest saved run as "frames avg low1 screen", for the benchmark test. */
	public static String benchmarkResult() {
		Benchmark.Result r = Benchmark.latest();
		if (r == null) return "none";
		return r.frames + " " + r.fps.avg + " " + r.fps.low1 + " " + (screen() instanceof BenchmarkScreen) + " " + r.settings.renderDistance;
	}

	public static float yaw() {
		return net.minecraft.client.Minecraft.getInstance().player.getYRot();
	}

	/** A friend on a server with a chat holding an invite each way, for the friends screen test. */
	public static String sampleInvites() {
		long now = System.currentTimeMillis();
		var f = new dev.slash3rss.slashclient.hud.social.Social.Friend("kumpel", "Kumpel", "kumpel", "online", "server", "skyup.pl", 0, now);
		var chat = java.util.List.of(
			new dev.slash3rss.slashclient.hud.social.Social.Message(1, "kumpel", "me", "Siema! Wbijasz?", now - 120_000, true, "", ""),
			new dev.slash3rss.slashclient.hud.social.Social.Message(2, "kumpel", "me", "skyup.pl", now - 60_000, true, "skyup.pl", "26.1.2"),
			new dev.slash3rss.slashclient.hud.social.Social.Message(3, "me", "kumpel", "mc.hypixel.net", now, false, "mc.hypixel.net", "26.3"));
		dev.slash3rss.slashclient.hud.social.Social.sampleForTest(f, chat, "me");
		return f.id();
	}

	/** Our own player in a SlashClient cape, seen from behind, with the name shown (for emotes). */
	public static void cosmeticsSelf(String cape, boolean front) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Cosmetics.setCape(mc.player.getUUID(), cape);
		SlashHud.config.ownNametag = cape != null;
		mc.options.setCameraType(front ? net.minecraft.client.CameraType.THIRD_PERSON_FRONT : net.minecraft.client.CameraType.THIRD_PERSON_BACK);
	}

	/** As if the server said our own player wears this in a slot (null takes it off). */
	public static void wear(String slot, String item) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Cosmetics.set(mc.player.getUUID(), slot, item);
	}

	/** As if our account wore this, in the main menu too (there it is the session's player). */
	public static void wearOwn(String slot, String item) {
		Cosmetics.set(net.minecraft.client.Minecraft.getInstance().getGameProfile().id(), slot, item);
	}

	/** The cosmetics menu with a made-up catalog, open on a slot. */
	public static void cosmeticsMenu(String slot) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.options.setCameraType(net.minecraft.client.CameraType.THIRD_PERSON_BACK);
		mc.setScreenAndShow(CosmeticsScreen.sample(slot));
	}

	public static void firstPerson() {
		net.minecraft.client.Minecraft.getInstance().options.setCameraType(net.minecraft.client.CameraType.FIRST_PERSON);
	}

	/** Where the player's cape texture comes from now. */
	public static String capeTexture() {
		var cape = net.minecraft.client.Minecraft.getInstance().player.getSkin().cape();
		return cape == null ? "none" : cape.texturePath().toString();
	}

	public static void emoteSelf(String emote) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Cosmetics.show(mc.player.getUUID(), emote);
	}

	public static void emoteWheel() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.setScreenAndShow(new EmoteScreen(Cosmetics.emoteKey()));
	}

	public static void clips(boolean on) {
		SlashHud.config.clips = on;
		SlashHud.config.clipSeconds = 10;
	}

	public static int clipFrames() {
		return Clips.bufferedFrames();
	}

	public static void saveClip() {
		Clips.save(net.minecraft.client.Minecraft.getInstance());
	}

	/** The newest clip as "<name> <bytes> <frames in its header>", or "none". */
	public static String newestClip() {
		try (var files = java.nio.file.Files.list(net.fabricmc.loader.api.FabricLoader.getInstance().getGameDir().resolve("clips"))) {
			var newest = files.filter(f -> f.toString().endsWith(".avi")).max(java.util.Comparator.comparing(f -> f.toFile().lastModified()));
			if (newest.isEmpty()) return "none";
			byte[] head = java.nio.file.Files.readAllBytes(newest.get());
			var b = java.nio.ByteBuffer.wrap(head).order(java.nio.ByteOrder.LITTLE_ENDIAN);
			String riff = new String(head, 0, 4) + new String(head, 8, 4);
			// avih: total frames at 24 + 16
			return newest.get().getFileName() + " " + head.length + " " + b.getInt(48) + " " + riff;
		} catch (Exception e) {
			return "none";
		}
	}

	/** Our own player wears this skin (a texture of the test mod), for the website's screenshots. */
	public static void testSkin(String texture) {
		var id = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "skin/" + texture);
		Cosmetics.testSkin = new net.minecraft.core.ClientAsset.ResourceTexture(id,
			net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "textures/skin/" + texture + ".png"));
		Cosmetics.testSkinFor = net.minecraft.client.Minecraft.getInstance().getGameProfile().id();
	}


	/** No toasts or chat lines over a screenshot. */
	public static void cleanScreen() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Compat.toasts(mc).clear();
		Compat.chat(mc).clearMessages(false);
	}

	public static void renderDistance(int chunks) {
		net.minecraft.client.Minecraft.getInstance().options.renderDistance().set(chunks);
	}

	/** SkyUp.pl (or any address) as a partner server with a made-up picture, for the server list test. */
	public static void samplePartner(String address) {
		// with -PsocialUrl=<url> the real way: the list and the picture from that SlashClient server
		String server = System.getProperty("slashclient.test.socialUrl", "");
		if (!server.isEmpty()) {
			Badges.server = server;
			PartnerServers.refresh();
		} else PartnerServers.sampleForTest(address);
	}

	/** "name the player": what the chat would do with this line, for the test. */
	public static boolean mentionCheck(String line, String nick) {
		return ChatTabs.mentions(line, nick);
	}

	/** Where a chat tab's button is in the open chat (its centre), or null. */
	public static double[] chatTabCenter(String name) {
		var screen = screen();
		if (screen == null) return null;
		for (var w : net.fabricmc.fabric.api.client.screen.v1.Screens.getWidgets(screen)) {
			if (w instanceof net.minecraft.client.gui.components.Button b && b.getMessage().getString().equals(name) && b.getY() > screen.height - 40)
				return new double[] { b.getX() + b.getWidth() / 2.0, b.getY() + b.getHeight() / 2.0 };
		}
		return null;
	}

	/** "pulled-out", "docked" or "missing" for the test. */
	public static String chatTabState(String name) {
		for (var tab : SlashHud.config.chatTabs) if (tab.name.equals(name)) return tab.window != null ? "pulled-out" : "docked";
		return "missing";
	}

	public static int chatWindowLines(String name) {
		return ChatWindows.linesOf(name);
	}

	public static void dockAllChatTabs() {
		for (var tab : SlashHud.config.chatTabs) tab.window = null;
		ChatTabs.changed();
	}

	/** Whether a tab with these words (comma separated) and exclusions would catch the line. */
	public static boolean tabCatches(String patterns, String excludes, String line) {
		var tab = new HudConfig.ChatTab("test", false);
		ChatTabsScreen.setPatterns(tab, patterns);
		ChatTabsScreen.setExcludes(tab, excludes);
		return ChatTabs.matches(tab, line);
	}

	/** The hand refill on or off, without the warning (the test has read it). */
	public static void assist(boolean on) {
		SlashHud.config.assistWarned = true;
		SlashHud.config.autoRefill = on;
	}

	/** "minecraft:cobblestone x40": what the player holds. */
	public static String handItem() {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		if (p == null) return "none";
		var stack = p.getMainHandItem();
		return net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()) + " x" + stack.getCount();
	}

	/** The measured ping (-1 before the server answered). */
	public static int ping() {
		return Latency.ms();
	}

	/** As if this had been sent from the chat (for the up arrow). */
	public static void rememberSent(String text) {
		Compat.chat(net.minecraft.client.Minecraft.getInstance()).addRecentChat(text);
	}

	/** What is typed in the open chat, or null. */
	public static String chatInput() {
		if (!(screen() instanceof net.minecraft.client.gui.screens.ChatScreen chat)) return null;
		try {
			var f = net.minecraft.client.gui.screens.ChatScreen.class.getDeclaredField("input");
			f.setAccessible(true);
			return ((net.minecraft.client.gui.components.EditBox) f.get(chat)).getValue();
		} catch (ReflectiveOperationException e) {
			return null;
		}
	}
}
