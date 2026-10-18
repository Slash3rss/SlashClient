// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
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
			//#if MC >= 1.21.9
			case "press" -> screen().mouseClicked(e, false);
			case "drag" -> screen().mouseDragged(e, 0, 0);
			default -> screen().mouseReleased(e);
			//#else
			//$ case "press" -> screen().mouseClicked(e.x(), e.y(), e.button());
			//$ case "drag" -> screen().mouseDragged(e.x(), e.y(), e.button(), 0, 0);
			//$ default -> screen().mouseReleased(e.x(), e.y(), e.button());
			//#endif
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

	/** The game's parts dragged elsewhere: the scoreboard to the left edge, the action bar up to the middle. */
	public static void moveGameParts() {
		HudConfig c = SlashHud.config;
		HudConfig.Placement board = c.placement("scoreboard");
		board.ax = 0;
		board.dx = 4;
		HudConfig.Placement action = c.placement("actionbar");
		action.ay = 0.5f;
		action.dy = 30;
	}

	/** Where a game part's box is (x, y, w, h), in GUI pixels. */
	public static int[] gamePartBox(String id) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		HudModule part = GameParts.ALL.stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
		HudConfig.Placement p = SlashHud.config.placement(id);
		int[] size = SlashHud.size(part, mc, p);
		int[] at = SlashHud.position(p, size[0], size[1], mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
		return new int[] { at[0], at[1], size[0], size[1] };
	}

	/** The game HUD parts changed so the screenshot shows every setting at work. */
	public static void gameParts() {
		HudConfig c = SlashHud.config;
		c.scoreboardScale = 0.8f;
		c.placement("scoreboard").dy = -40;
		c.scoreboardNumbers = false;
		c.bossBarScale = 0.8f;
		c.placement("bossbar").dy = 6;
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

	/** A line in the chat with a click event, as servers send their [Kliknij] buttons. */
	public static void clickableLine(String text, String command) {
		//#if MC >= 1.21.5
		var click = new net.minecraft.network.chat.ClickEvent.SuggestCommand(command);
		//#else
		//$ var click = new net.minecraft.network.chat.ClickEvent(net.minecraft.network.chat.ClickEvent.Action.SUGGEST_COMMAND, command);
		//#endif
		var line = net.minecraft.network.chat.Component.literal(text).withStyle(st -> st.withClickEvent(click));
		//#if MC >= 26.1
		net.minecraft.client.Minecraft.getInstance().player.sendSystemMessage(line);
		//#else
		//$ net.minecraft.client.Minecraft.getInstance().player.displayClientMessage(line, false);
		//#endif
	}

	/** A player's line with a red word: "<Gracz> czerwony". */
	public static void coloredLine() {
		var line = net.minecraft.network.chat.Component.literal("<Gracz> ").append(net.minecraft.network.chat.Component.literal("czerwony").withStyle(net.minecraft.ChatFormatting.RED));
		//#if MC >= 26.1
		net.minecraft.client.Minecraft.getInstance().player.sendSystemMessage(line);
		//#else
		//$ net.minecraft.client.Minecraft.getInstance().player.displayClientMessage(line, false);
		//#endif
	}

	/** The copy settings: format, time in front, without the sender. */
	public static void copySettings(String format, String time, boolean noSender) {
		SlashHud.config.chatCopyFormat = format;
		SlashHud.config.chatCopyTime = time;
		SlashHud.config.chatCopyNoSender = noSender;
	}

	/**
	 * A click near the end of the n-th line from the bottom of the open chat, through the chat screen
	 * itself: what it copied ("-" for nothing) and what is typed in the chat.
	 */
	public static String clickChat(int fromBottom, boolean right) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		double scale = mc.options.chatScale().get();
		int lineHeight = (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
		double y = ((mc.getWindow().getGuiScaledHeight() - 40) / scale - lineHeight * (fromBottom + 0.5)) * scale;
		// near the end of the line, past a time stamp in front
		var chat = (dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) Compat.chat(mc);
		var line = (net.minecraft.client.multiplayer.chat.GuiMessage.Line) chat.slashclient$lines().get(chat.slashclient$scroll() + fromBottom);
		double x = mc.font.width(line.content()) * scale;
		ChatExtras.lastCopied = null;
		String before = mc.keyboardHandler.getClipboard();
		var e = new net.minecraft.client.input.MouseButtonEvent(x, y, new net.minecraft.client.input.MouseButtonInfo(right ? com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT : com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT, 0));
		//#if MC >= 1.21.9
		screen().mouseClicked(e, false);
		//#else
		//$ screen().mouseClicked(e.x(), e.y(), e.button());
		//#endif
		String copied = ChatExtras.lastCopied;
		// the player's own clipboard comes back after a copy
		if (copied != null) mc.keyboardHandler.setClipboard(before);
		return (copied == null ? "-" : copied) + "|" + chatInput();
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

	/**
	 * Pinned partners: on top after loading (the rotating ones taking turns first, the fixed one
	 * after them), not removed, moved or re-addressed; the resource pack setting can change.
	 */
	public static void checkPinnedServer() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		PinnedServer.sampleForTest(java.util.List.of(new PinnedServer.Pin("skyup.pl", "SkyUp.pl", false),
			new PinnedServer.Pin("a.example", "Rotujący A", true), new PinnedServer.Pin("b.example", "Rotujący B", true)));
		var list = new net.minecraft.client.multiplayer.ServerList(mc);
		list.load();
		list.add(new net.minecraft.client.multiplayer.ServerData("Inny serwer", "example.org", net.minecraft.client.multiplayer.ServerData.Type.OTHER), false);
		list.save();
		list.load();
		String first = list.get(0).ip;
		check(PinnedServer.is(list.get(0)) && PinnedServer.is(list.get(1)) && "skyup.pl".equals(list.get(2).ip), "pinned servers on top, the fixed one after the rotating ones");
		list.load();
		check(!first.equals(list.get(0).ip) && "skyup.pl".equals(list.get(2).ip), "rotating ones take turns at the very top");
		list.remove(list.get(0));
		check(PinnedServer.is(list.get(0)) && list.size() >= 4, "a pinned server cannot be removed");
		list.swap(2, 3);
		check("skyup.pl".equals(list.get(2).ip), "a pinned server cannot be moved");
		var edited = new net.minecraft.client.multiplayer.ServerData("Zmieniony", "other.example", net.minecraft.client.multiplayer.ServerData.Type.OTHER);
		edited.setResourcePackStatus(net.minecraft.client.multiplayer.ServerData.ServerPackStatus.DISABLED);
		list.replace(2, edited);
		check("skyup.pl".equals(list.get(2).ip) && "SkyUp.pl".equals(list.get(2).name)
			&& list.get(2).getResourcePackStatus() == net.minecraft.client.multiplayer.ServerData.ServerPackStatus.DISABLED, "only the resource pack setting of a pinned server changes");
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

	/** Holds (or lets go of) the sneak key, as the player would. */
	public static void sneak(boolean on) {
		net.minecraft.client.Minecraft.getInstance().options.keyShift.setDown(on);
	}

	/** The clothing this mod can draw: "hats|tops". */
	public static String clothing() {
		return String.join(",", Clothing.HATS) + "|" + String.join(",", Clothing.TOPS);
	}

	/** Turns our own player by this many degrees (a view from the side). */
	public static void turn(float degrees) {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		p.setYRot(p.getYRot() + degrees);
		p.setYHeadRot(p.getYRot());
		p.setYBodyRot(p.getYRot());
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

	/** Scrolls the open cosmetics menu's grid to its end. */
	public static void scrollCosmetics() {
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.scrollBy(10_000);
	}

	/** The name shown above the TNT nearest to us ("none" without one). */
	public static String tntLabel() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		for (var e : mc.level.entitiesForRendering()) {
			if (e instanceof net.minecraft.world.entity.item.PrimedTnt tnt) return tnt.getCustomName() == null ? "none" : tnt.getCustomName().getString();
		}
		return "none";
	}

	/** How many damage numbers are rising now. */
	public static int damagePops() {
		return DamageNumbers.count();
	}

	/** A chat line with our nick, as the nick hider shows it. */
	public static String hiddenNick(boolean on) {
		SlashHud.config.nickHider = on;
		String name = net.minecraft.client.Minecraft.getInstance().getUser().getName();
		return NickHider.apply(net.minecraft.network.chat.Component.literal("<" + name + "> hej")).getString();
	}

	/** How many columns of the dungeon the map knows, and whether it is showing. */
	public static String dungeonMap() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		return DungeonMap.known() + "," + DungeonMap.active() + "," + new DungeonMap().visible(mc);
	}

	/** The dungeon map's rooms: how many, containers taken, rooms cleared and without a spawner. */
	public static String dungeonRooms() {
		return DungeonRooms.summary();
	}

	/** The window's title and the brand the server is told. */
	public static String branding() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		return ((dev.slash3rss.slashclient.hud.mixin.MinecraftAccessor) mc).slashclient$createTitle() + "|" + net.minecraft.client.ClientBrandRetriever.getClientModName();
	}

	/** The dungeon classes of the named mobs about (1 normal, 2 elite, 3 mini boss), and how many spawner holograms there are. */
	public static String dungeonKinds() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		java.util.List<Integer> kinds = new java.util.ArrayList<>();
		int spawners = 0;
		for (var e : mc.level.entitiesForRendering()) {
			if (e instanceof net.minecraft.world.entity.Mob && e.hasCustomName()) kinds.add(DungeonMap.kind(e));
			if (DungeonRooms.spawnerLabel(e)) spawners++;
		}
		java.util.Collections.sort(kinds);
		return kinds + " spawners " + spawners;
	}

	/** A SkyUp mob's name as the Target module shows it (without the health in front). */
	public static String targetName() {
		var name = net.minecraft.network.chat.Component.literal("84.36 ❤ ").withStyle(net.minecraft.ChatFormatting.RED)
			.append(net.minecraft.network.chat.Component.literal("| ").withStyle(net.minecraft.ChatFormatting.DARK_GRAY))
			.append(net.minecraft.network.chat.Component.literal("☺ Żniwiarz ").withStyle(net.minecraft.ChatFormatting.GOLD))
			.append(net.minecraft.network.chat.Component.literal("poz. 100").withStyle(net.minecraft.ChatFormatting.GRAY));
		return MoreModules.Target.withoutHealth(name).getString() + "|" + MoreModules.Target.withoutHealth(net.minecraft.network.chat.Component.literal("Steve")).getString();
	}

	/** What the dungeon map knows of a column: 0 nothing, 1 wall, 2 floor. */
	public static int dungeonCell(int x, int z) {
		return DungeonMap.cellAt(x, z);
	}

	/** The dungeon map over the whole screen, or closed. */
	public static void dungeonFull(boolean open) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.setScreenAndShow(open ? new DungeonMapScreen(DungeonMap.fullKey) : null);
	}

	/** The dungeon map round, zoomed in and following the player, or back as it was. */
	public static void dungeonRound(boolean round) {
		SlashHud.config.dungeonShape = round ? "circle" : "square";
		// and bigger, so the map's picture is made anew at another size
		SlashHud.config.dungeonSize = round ? 180 : 120;
		SlashHud.config.dungeonZoom = round ? 1.5f : 1f;
		SlashHud.config.dungeonFollow = round;
		SlashHud.config.dungeonSelfHead = round;
	}

	/** The keys window, and how many SlashClient keys it lists. */
	public static int openKeybinds() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.setScreenAndShow(new KeybindsScreen(null));
		return (int) java.util.Arrays.stream(mc.options.keyMappings).filter(k -> SlashHud.keyCategory.equals(k.getCategory())).count();
	}

	/** A scrollbar taken by its thumb and dragged, then clicked at the bottom of its track: the scrolls it gave. */
	public static String scrollbarDrag() {
		var bar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
		bar.layout(100, 50, 200, 0, 400);
		boolean took = bar.press(101, 55);
		float dragged = bar.drag(55 + 70);
		bar.release();
		bar.layout(100, 50, 200, dragged, 400);
		bar.press(101, 249);
		float jumped = bar.drag(249);
		bar.release();
		return took + "," + Math.round(dragged) + "," + Math.round(jumped);
	}

	/** Whether Q would need a second press for a sword, and for dirt. */
	public static String dropGuarded() {
		return DropGuard.valuable(new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.DIAMOND_SWORD)) + ","
			+ DropGuard.valuable(new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.DIRT));
	}

	public static void firstPerson() {
		net.minecraft.client.Minecraft.getInstance().options.setCameraType(net.minecraft.client.CameraType.FIRST_PERSON);
	}

	/** Where the player's cape texture comes from now. */
	public static String capeTexture() {
		var cape = net.minecraft.client.Minecraft.getInstance().player.getSkin().cape();
		//#if MC >= 1.21.9
		return cape == null ? "none" : cape.texturePath().toString();
		//#else
		//$ return cape == null ? "none" : cape.toString();
		//#endif
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
		//#if MC >= 1.21.9
		Cosmetics.testSkin = new net.minecraft.core.ClientAsset.ResourceTexture(id,
			net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "textures/skin/" + texture + ".png"));
		//#else
		//$ Cosmetics.testSkin = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "textures/skin/" + texture + ".png");
		//#endif
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

	/** Where a slot of the open inventory screen is, in window pixels (for the cursor). */
	public static double[] slotOnWindow(int index) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (!(screen() instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> s)) return new double[] { 0, 0 };
		var slot = s.getMenu().slots.get(index);
		try {
			var left = net.minecraft.client.gui.screens.inventory.AbstractContainerScreen.class.getDeclaredField("leftPos");
			var top = net.minecraft.client.gui.screens.inventory.AbstractContainerScreen.class.getDeclaredField("topPos");
			left.setAccessible(true);
			top.setAccessible(true);
			double scale = mc.getWindow().getGuiScale();
			return new double[] { (left.getInt(s) + slot.x + 8) * scale, (top.getInt(s) + slot.y + 8) * scale };
		} catch (ReflectiveOperationException e) {
			return new double[] { 0, 0 };
		}
	}

	/** "hotbar/backpack": cobblestone in the first hotbar slot and in the backpack. */
	public static String cobblestone() {
		var inv = net.minecraft.client.Minecraft.getInstance().player.getInventory();
		int pack = 0;
		for (int i = 9; i < 36; i++) if (inv.getItem(i).is(net.minecraft.world.item.Items.COBBLESTONE)) pack += inv.getItem(i).getCount();
		int bar = inv.getItem(0).is(net.minecraft.world.item.Items.COBBLESTONE) ? inv.getItem(0).getCount() : 0;
		return bar + "/" + pack;
	}

	/**
	 * The layout editor's snapping: "fps" is put in the open middle, then "ping" is dragged to just
	 * beside it, a little off; `start` stops while still dragging (for the screenshot), the second
	 * call lets go and says whether "ping" ended exactly beside "fps" with the tops level.
	 */
	/** The modules that were on before the snapping test (only "fps" and "ping" are on during it). */
	private static java.util.Map<String, Boolean> snapSaved;

	public static String snapDrag(boolean start) {
		var editor = (HudEditScreen) screen();
		if (start) {
			// alone on the screen, so no other module's edge pulls "ping" first
			snapSaved = new java.util.HashMap<>();
			for (var m : SlashHud.MODULES) {
				var p = SlashHud.config.placement(m.id());
				snapSaved.put(m.id(), p.enabled);
				p.enabled = m.id().equals("fps") || m.id().equals("ping");
			}
			int[] a = editor.boxOf("fps");
			mouse("press", new double[] { a[0] + 2, a[1] + 2 });
			mouse("drag", new double[] { editor.width / 2.0 - 40, editor.height / 2.0 - 60 });
			mouse("release", new double[] { editor.width / 2.0 - 40, editor.height / 2.0 - 60 });
			a = editor.boxOf("fps");
			int[] b = editor.boxOf("ping");
			mouse("press", new double[] { b[0] + 2, b[1] + 2 });
			// 3 px past the gap and 3 px lower than "fps": close enough to be pulled in
			mouse("drag", new double[] { a[0] + a[2] + 2 + 3 + 2, a[1] + 3 + 2 });
			return "dragging";
		}
		int[] a = editor.boxOf("fps");
		int[] before = editor.boxOf("ping");
		mouse("release", new double[] { before[0] + 2, before[1] + 2 });
		int[] b = editor.boxOf("ping");
		snapSaved.forEach((id, on) -> SlashHud.config.placement(id).enabled = on);
		return b[0] == a[0] + a[2] + 2 && b[1] == a[1] ? "ok" : "fps " + java.util.Arrays.toString(a) + " ping " + java.util.Arrays.toString(b);
	}

	//#if MC >= 26.3
	// ---------- SkyUp's tasks ----------

	/** A lore line as SkyUp writes it: a grey bullet, then the text in `color`. */
	private static net.minecraft.network.chat.Component line(String text, net.minecraft.ChatFormatting color) {
		return net.minecraft.network.chat.Component.literal(text.isEmpty() ? "" : "▪ ").withStyle(net.minecraft.ChatFormatting.DARK_GRAY)
			.append(net.minecraft.network.chat.Component.literal(text).withStyle(color));
	}

	private static net.minecraft.world.item.ItemStack task(net.minecraft.world.item.Item item, String name, String... lore) {
		var stack = new net.minecraft.world.item.ItemStack(item);
		stack.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME, net.minecraft.network.chat.Component.literal("» ").withStyle(net.minecraft.ChatFormatting.LIGHT_PURPLE)
			.append(net.minecraft.network.chat.Component.literal(name).withStyle(net.minecraft.ChatFormatting.GOLD, net.minecraft.ChatFormatting.BOLD))
			.append(net.minecraft.network.chat.Component.literal(" «").withStyle(net.minecraft.ChatFormatting.LIGHT_PURPLE)));
		java.util.List<net.minecraft.network.chat.Component> lines = new java.util.ArrayList<>();
		for (String l : lore) {
			// "»" lines indented under their header, the rest bulleted
			if (l.startsWith("»")) lines.add(net.minecraft.network.chat.Component.literal("  " + l).withStyle(net.minecraft.ChatFormatting.YELLOW));
			else if (l.startsWith("  ")) lines.add(net.minecraft.network.chat.Component.literal(l).withStyle(net.minecraft.ChatFormatting.YELLOW));
			else lines.add(line(l, net.minecraft.ChatFormatting.AQUA));
		}
		stack.set(net.minecraft.core.component.DataComponents.LORE, new net.minecraft.world.item.component.ItemLore(lines));
		return stack;
	}

	/**
	 * SkyUp's tasks GUI ("NOWICJUSZ"), made on the client with tasks as in the owner's screenshots
	 * (one of them, Huta, left out when `withoutHuta`, as after completing it).
	 */
	public static void skyTasksScreen(boolean withoutHuta) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (!withoutHuta) SkyTasks.resetForTest();
		SlashHud.config.placement("skytasks").enabled = true;
		// the iron ingot as the game names it in the language the test plays in
		String iron = new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.IRON_INGOT).getHoverName().getString();
		var chest = new net.minecraft.world.SimpleContainer(27);
		chest.setItem(0, task(net.minecraft.world.item.Items.LAVA_BUCKET, "Od czego zacząć?", "Opis » Żeby wygenerować kamień musimy", "  znaleźć lawę. Powinna być w tej", "  jaskini koło domku!", "",
			"Posiadaj w ekwipunku:", "» Wiadro lawy: 1", "", "Za ukończenie otrzymasz:", "» 1 x Generator kamienia", "» 100.0 SC", "» 30 xp", "", "LPM » Ukończ"));
		chest.setItem(1, task(net.minecraft.world.item.Items.STONE, "Podstawowy kamieniołom", "Zalecane ukończenie wyzwania Od czego", "  zacząć?", "", "Opis » Postaw generator i zobacz jak", "  działa!", "",
			"Zbierz:", "» Kamień: 28/128", "", "Za ukończenie otrzymasz:", "» Przedmioty na kolejny generator", "  kamienia /recipe Generator:", "» 4 x Sproszkowany redstone", "» 100.0 SC", "", "LPM » Ukończ"));
		chest.setItem(2, task(net.minecraft.world.item.Items.TORCH, "A co tutaj tak ciemno?", "Opis » Rozświetl wyspę pochodniami, bo", "  zjedzą Cię potwory!", "",
			"Stwórz:", "» Pochodnia: 0/64", "Postaw", "» Pochodnia: 0/64", "", "Za ukończenie otrzymasz:", "» 2 x Latarnia", "» 100.0 SC", "» 30 xp", "", "LPM » Ukończ"));
		if (!withoutHuta) chest.setItem(3, task(net.minecraft.world.item.Items.IRON_INGOT, "Huta", "Opis » Przepal surowe żelazo. Od", "  czegoś trzeba zacząć, co nie?", "",
			"Posiadaj w ekwipunku:", "» " + iron + ": 16", "", "Za ukończenie otrzymasz:", "» 10 x Węgiel", "» 150.0 SC", "» 50 xp", "", "LPM » Ukończ"));
		chest.setItem(4, task(net.minecraft.world.item.Items.BELL, "Dobra praca się opłaca", "Opis » Zacznij piąć się w swojej", "  karierze. Awansuj w wybranej pracy!", "",
			"Posiadaj poziom dowolnej pracy: 5 poz.", "", "Za ukończenie otrzymasz:", "» 16 x Zaklęta butelka", "» 150.0 SC", "» 50 xp", "", "LPM » Ukończ"));
		chest.setItem(5, task(net.minecraft.world.item.Items.BARRIER, "Stacja inkubacja", "Opis » Kaktusiarki to pieśń", "  przeszłości!", "",
			"Posiadaj w ekwipunku:", "» Kaktus: 16", "Posiadaj na wyspie co najmniej:", "» kaktus: 1 poz.", "", "Za ukończenie otrzymasz:", "» Redstone na rozwój inkubatora:",
			"» 24 x Sproszkowany redstone", "", "Uwaga » Przedmioty zostaną zabrane!", "LPM » Ukończ"));
		// the "i" item and a plain one: no tasks
		chest.setItem(13, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.OAK_SIGN));
		var menu = net.minecraft.world.inventory.ChestMenu.threeRows(1000, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), net.minecraft.network.chat.Component.literal("NOWICJUSZ")));
	}

	/** The middle of a slot of the open GUI, in window pixels (where the test's cursor goes). */
	public static double[] slotPoint(int index) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var screen = (net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?>) screen();
		var at = (dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor) screen;
		var slot = screen.getMenu().slots.get(index);
		double scale = mc.getWindow().getGuiScale();
		return new double[] { (at.slashclient$leftPos() + slot.x + 8) * scale, (at.slashclient$topPos() + slot.y + 8) * scale };
	}

	public static KeyMapping skyTrackKey() {
		return SkyTasks.trackKey;
	}

	public static String skyTasks() {
		return SkyTasks.debugTasks();
	}

	public static String skyTracked() {
		return SkyTasks.debugTracked();
	}

	public static String skyRows() {
		return SkyTasks.debugRows(net.minecraft.client.Minecraft.getInstance());
	}

	public static void skyTasksOptions(boolean rewards, boolean compact) {
		SlashHud.config.skyTasksRewards = rewards;
		SlashHud.config.skyTasksCompact = compact;
	}
	//#endif
}
//#endif
