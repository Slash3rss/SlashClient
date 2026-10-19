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
		HudModule part = SlashHud.MODULES.stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
		HudConfig.Placement p = SlashHud.config.placement(id);
		int[] size = SlashHud.size(part, mc, p);
		int[] at = SlashHud.position(p, size[0], size[1], mc.getWindow().getGuiScaledWidth(), mc.getWindow().getGuiScaledHeight());
		return new int[] { at[0], at[1], size[0], size[1] };
	}

	// ---------- layouts per server, the chat's size and opacity ----------

	/** No layouts saved, the chat at the game's defaults (scale 1, background 50%). */
	public static void serverLayoutsReset() {
		ServerLayouts.testAddress = null;
		ServerLayouts.clearForTest();
		chatLook(1f, 50f);
	}

	/** As joining a server (or, with null, leaving it): its layout comes on, or the player's own comes back. */
	public static void joinServer(String address) {
		ServerLayouts.testAddress = address;
		ServerLayouts.switchTo(address);
	}

	public static String activeLayout() {
		return String.valueOf(ServerLayouts.active());
	}

	/** The middle of the editor's "layout for this server" switch, and of the first saved server's ×. */
	public static double[] serverSwitchPoint() {
		return ServerLayoutsPanel.switchCenter;
	}

	public static double[] serverDeletePoint() {
		return ServerLayoutsPanel.firstDelete;
	}

	/** The editor's page scrolled to its end, as with the mouse wheel. */
	public static void scrollDown() {
		//#if MC >= 1.20.2
		screen().mouseScrolled(0, 0, 0, -100);
		//#else
		//$ screen().mouseScrolled(0, 0, -100);
		//#endif
	}

	/** The chat's size and background as the editor's sliders set them. */
	public static void chatLook(float scale, float opacity) {
		ChatLook.setScale(scale);
		ChatLook.setOpacity(opacity);
	}

	/** A module's place, the chat's scale and opacity: "ax,ay,dx,dy scale opacity". */
	public static String layoutState(String id) {
		HudConfig.Placement p = SlashHud.config.placement(id);
		return String.format(java.util.Locale.ROOT, "%.2f,%.2f,%d,%d %.2f %.0f", p.ax, p.ay, p.dx, p.dy, ChatLook.shownScale(), ChatLook.opacity());
	}

	public static void place(String id, float ax, float ay, int dx, int dy) {
		HudConfig.Placement p = SlashHud.config.placement(id);
		p.enabled = true;
		p.ax = ax;
		p.ay = ay;
		p.dx = dx;
		p.dy = dy;
	}

	/** The open screen closed as Esc closes it (the editor keeps its changes then). */
	public static void closeScreen() {
		screen().onClose();
	}

	/** A share code made now and read back: the same module place and chat size, or what differs. */
	public static String shareRoundTrip(String id) {
		HudConfig read = ShareCode.decode(ShareCode.encode(SlashHud.config));
		if (read == null) return "unreadable";
		HudConfig.Placement a = SlashHud.config.placement(id), b = read.placement(id);
		if (a.ax != b.ax || a.ay != b.ay || a.dx != b.dx || a.dy != b.dy) return "place differs";
		if (read.chatScaleExtra != SlashHud.config.chatScaleExtra) return "chat size differs";
		return "ok";
	}

	/** The chat's box in the editor against where the game draws it: "" when they agree. */
	public static String chatBoxCheck() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		int sw = mc.getWindow().getGuiScaledWidth(), sh = mc.getWindow().getGuiScaledHeight();
		int[] box = gamePartBox("chat");
		// the game's layout, worked out on its own here: lines upwards from 40 above the bottom, scaled
		double s = ChatLook.scale(mc);
		int lh = (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
		int lines = net.minecraft.client.gui.components.ChatComponent.getHeight(mc.options.chatHeightUnfocused().get()) / lh;
		int width = (int) Math.round((Math.ceil(net.minecraft.client.gui.components.ChatComponent.getWidth(mc.options.chatWidth().get()) / s) + 12) * s);
		double bottom = Math.floor((sh - 40) / s) * s;
		double top = bottom - lines * lh * s;
		String problem = "";
		if (box[0] != 0) problem += " x=" + box[0];
		if (Math.abs(box[2] - width) > 1) problem += " w=" + box[2] + " (game " + width + ")";
		if (Math.abs(box[1] - top) > 1) problem += " top=" + box[1] + " (game " + top + ")";
		if (Math.abs(box[1] + box[3] - bottom) > 1.5) problem += " bottom=" + (box[1] + box[3]) + " (game " + bottom + ")";
		return problem.trim();
	}

	/** A server's text over and under the tab list, the header in two lines (its box grows with them). */
	public static void tabHeader() {
		var tab = Compat.tabList(net.minecraft.client.Minecraft.getInstance());
		tab.setHeader(net.minecraft.network.chat.Component.literal("SlashClient\nNagłówek listy graczy, dość długi"));
		tab.setFooter(net.minecraft.network.chat.Component.literal("Stopka"));
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

	/** What the chat shows now (its wrapped lines, after the open tab's filter), newest first. */
	public static String visibleChat() {
		var chat = Compat.chat(net.minecraft.client.Minecraft.getInstance());
		StringBuilder sb = new StringBuilder();
		for (Object o : ((dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) chat).slashclient$lines()) {
			((net.minecraft.client.multiplayer.chat.GuiMessage.Line) o).content().accept((i, style, cp) -> {
				sb.appendCodePoint(cp);
				return true;
			});
			sb.append(" | ");
		}
		return sb.toString();
	}

	/** A pulled-out chat window's width x lines ("none" when the tab is not out). */
	public static String chatWindowSize(String tab) {
		return ChatWindows.sizeOf(tab);
	}

	/** The middle of a pulled-out chat window's corner grip, in GUI coordinates. */
	public static double[] chatWindowGrip(String tab) {
		var w = net.minecraft.client.Minecraft.getInstance().getWindow();
		return ChatWindows.gripOf(tab, w.getGuiScaledWidth(), w.getGuiScaledHeight());
	}

	/** The chat tab being dragged out of the row (-1: none). */
	public static int chatTabDragging() {
		return ChatTabs.dragging;
	}

	/** The setting that keeps pulled-out tabs' lines out of "All". */
	public static void chatWindowsOnly(boolean on) {
		SlashHud.config.chatWindowsOnly = on;
		ChatTabs.reapply();
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
		double scale = ChatLook.scale(mc);
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
		double scale = ChatLook.scale(mc);
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
		// names: the panel's, else the address; the game's default name is replaced, the player's own stays
		list.get(2).name = "Minecraft Server";
		list.add(new net.minecraft.client.multiplayer.ServerData("Moje ulubione", "own.example", net.minecraft.client.multiplayer.ServerData.Type.OTHER), false);
		list.save();
		PinnedServer.sampleForTest(java.util.List.of(new PinnedServer.Pin("skyup.pl", "SkyUp.pl", false),
			new PinnedServer.Pin("a.example", "Rotujący A", true), new PinnedServer.Pin("b.example", "Rotujący B", true),
			new PinnedServer.Pin("own.example", "Z panelu", false), new PinnedServer.Pin("bare.example", "", false)));
		list.load();
		check("SkyUp.pl".equals(byIp(list, "skyup.pl").name), "a pinned server under the default name gets the panel's name");
		check("bare.example".equals(byIp(list, "bare.example").name), "a pinned server without a name in the panel is called by its address");
		check("Moje ulubione".equals(byIp(list, "own.example").name), "a name the player chose stays");
		// back to the three pinned ones for the screenshots
		var own = byIp(list, "own.example");
		var bare = byIp(list, "bare.example");
		PinnedServer.sampleForTest(java.util.List.of(new PinnedServer.Pin("skyup.pl", "SkyUp.pl", false),
			new PinnedServer.Pin("a.example", "Rotujący A", true), new PinnedServer.Pin("b.example", "Rotujący B", true)));
		list.remove(own);
		list.remove(bare);
		list.save();
		SlashHud.LOG.info("Pinned server test: OK ({} servers, first {})", list.size(), list.get(0).ip);
	}

	private static net.minecraft.client.multiplayer.ServerData byIp(net.minecraft.client.multiplayer.ServerList list, String ip) {
		for (int i = 0; i < list.size(); i++) if (ip.equals(list.get(i).ip)) return list.get(i);
		throw new AssertionError("no server " + ip);
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

	/** Kill effects on or off, ours and other players'. */
	public static void killEffects(boolean on, boolean others) {
		SlashHud.config.killEffects = on;
		SlashHud.config.killEffectsOthers = others;
	}

	/** The last kill effect that started ("kind:self", "kind:<player>", "" for none) and how many play now. */
	public static String killEffectState() {
		return KillEffects.lastStarted + "|" + KillEffects.playingCount();
	}

	/** Forgets the last kill effect (the next check sees only a new one). */
	public static void killEffectForget() {
		KillEffects.lastStarted = "";
	}

	/** The cosmetics menu's preview of a kill effect, beside our own player. */
	public static void killPreview(String kind) {
		KillEffects.preview(net.minecraft.client.Minecraft.getInstance(), kind);
	}

	/** Rings and movement effects on or off, ours and other players'. */
	public static void ringMoveEffects(boolean rings, boolean moves, boolean others) {
		SlashHud.config.ringEffects = rings;
		SlashHud.config.ringEffectsOthers = others;
		SlashHud.config.moveEffects = moves;
		SlashHud.config.moveEffectsOthers = others;
	}

	/** The last movement effect that played ("kind:player", "" for none) and how many have played. */
	public static String moveEffectState() {
		return MoveEffects.lastPlayed + "|" + MoveEffects.played;
	}

	/** Forgets the last movement effect (the next check sees only a new one). */
	public static void moveEffectForget() {
		MoveEffects.lastPlayed = "";
	}

	/** Holds (or lets go of) the forward and sprint keys, as the player would. */
	public static void walk(boolean forward, boolean sprint) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.options.keyUp.setDown(forward);
		mc.options.keySprint.setDown(sprint);
		if (!forward) mc.player.setSprinting(false);
	}

	/** Our own player jumps (when on the ground). */
	public static void jump() {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		if (p.onGround()) p.setDeltaMovement(p.getDeltaMovement().x, 0.42, p.getDeltaMovement().z);
	}

	/** Uses the item in the main hand, as a right click would (a snowball is thrown). */
	public static void useItem() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.gameMode.useItem(mc.player, net.minecraft.world.InteractionHand.MAIN_HAND);
	}

	/** The rings and movement effects this mod can draw: "rings|moves". */
	public static String ringsAndMoves() {
		return String.join(",", RingEffects.IDS) + "|" + String.join(",", MoveEffects.IDS);
	}

	/** Sprays as the key does (`wait`: keeping the wait between sprays), and what is sprayed then (Sprays.summary). */
	public static String spray(boolean wait) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (wait) Sprays.spray(mc);
		else Sprays.sprayNow(mc);
		return Sprays.summary();
	}

	/** The sprays now: "id@x,y,z/face;…", oldest first. */
	public static String sprays() {
		return Sprays.summary();
	}

	/** Takes every spray away. */
	public static void spraysClear() {
		Sprays.reset();
	}

	/**
	 * A spray of someone's (`owner` 0 ourselves, else a made-up player of that number) on the face of
	 * the block at our feet plus (dx, dy, dz), `ageMs` old already.
	 */
	public static void sprayAt(int owner, String id, int dx, int dy, int dz, String face, int rot, long ageMs) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		java.util.UUID who = owner == 0 ? mc.player.getUUID() : new java.util.UUID(0x5ba7, owner);
		Sprays.place(who, id, mc.player.blockPosition().offset(dx, dy, dz), Sprays.face(face), rot, ageMs);
	}

	/** The server's 'spray' event from our own player (`self`) or a player not in this game, as the launcher passes it on. */
	public static void sprayReceived(boolean self, int dz) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var p = mc.player.blockPosition();
		var e = new com.google.gson.JsonObject();
		e.addProperty("type", "spray");
		e.addProperty("uuid", (self ? mc.player.getUUID() : new java.util.UUID(0x5ba7, 99)).toString());
		e.addProperty("spray", "spray_gg");
		e.addProperty("dimension", "minecraft:overworld");
		e.addProperty("x", p.getX());
		e.addProperty("y", p.getY() + 1);
		e.addProperty("z", p.getZ() + dz);
		e.addProperty("face", "north");
		Sprays.received(e);
	}

	/** The player looks this way (yaw: 0 south, 90 west; pitch: positive is down). */
	public static void look(float yaw, float pitch) {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		p.setYRot(yaw);
		p.setXRot(pitch);
		p.setYHeadRot(yaw);
		p.setYBodyRot(yaw);
	}

	/** Other players' sprays shown or not. */
	public static void spraysOthers(boolean on) {
		SlashHud.config.spraysOthers = on;
	}

	/** Holds (or lets go of) the sneak key, as the player would. */
	public static void sneak(boolean on) {
		net.minecraft.client.Minecraft.getInstance().options.keyShift.setDown(on);
	}

	/** The shoes and the hands' items this mod can draw: "shoes|hands". */
	public static String limbWear() {
		return String.join(",", Clothing.SHOES) + "|" + String.join(",", Clothing.HANDS);
	}

	/** Freelook allowed (on) or not, as in the HUD settings. */
	public static void freelookAllowed(boolean on) {
		SlashHud.config.freelook = on;
	}

	/** While freelook is held: the camera turned round the player by this many degrees (a view from the side). */
	public static void freelookYaw(float degrees) {
		net.minecraft.client.Minecraft.getInstance().player.turn(degrees / 0.15, 0);
	}

	/** Our own player looks this many degrees down (positive) or up. */
	public static void pitch(float degrees) {
		net.minecraft.client.Minecraft.getInstance().player.setXRot(degrees);
	}

	/** The clothing this mod can draw: "hats|tops". */
	public static String clothing() {
		return String.join(",", Clothing.HATS) + "|" + String.join(",", Clothing.TOPS);
	}

	/** Freelook held (on) or let go: the camera can then be turned round the player, who keeps facing the same way (freelookTurn). */
	public static void freelookHeld(boolean on) {
		SlashHud.config.freelook = on;
		Freelook.key.setDown(on);
	}

	/** The suits this mod can draw. */
	public static String suits() {
		return String.join(",", Suits.IDS);
	}

	/** Our own player in the game's Steve (wide arms) or Alex (slim arms) skin, for screenshots of both arm widths. */
	public static void defaultSkin(boolean slim) {
		String path = "entity/player/" + (slim ? "slim/alex" : "wide/steve");
		//#if MC >= 1.21.9
		Cosmetics.testSkin = new net.minecraft.core.ClientAsset.ResourceTexture(net.minecraft.resources.Identifier.withDefaultNamespace(path),
			net.minecraft.resources.Identifier.withDefaultNamespace("textures/" + path + ".png"));
		//#else
		//$ Cosmetics.testSkin = net.minecraft.resources.Identifier.withDefaultNamespace("textures/" + path + ".png");
		//#endif
		Cosmetics.testSkinFor = net.minecraft.client.Minecraft.getInstance().getGameProfile().id();
		Cosmetics.testSkinSlim = slim;
	}

	/** The face and ears things this mod can draw: "face|ears". */
	public static String headwear() {
		return String.join(",", Clothing.FACE) + "|" + String.join(",", Clothing.EARS);
	}

	/** An item's first box posed at this moment with this hat on (null: none): "its turn about z|whether it shows". */
	public static String headwearPose(String id, String hat, float seconds) {
		net.minecraft.client.model.geom.ModelPart root = Clothing.bake(id, false);
		Clothing.animate(root, id, hat, seconds);
		net.minecraft.client.model.geom.ModelPart box = root.getChild("head").getChild("box0");
		return box.zRot + "|" + box.visible;
	}

	/** The back items and tails this mod can draw: "backs|tails". */
	public static String gear() {
		return String.join(",", Gear.BACKS) + "|" + String.join(",", Gear.TAILS);
	}

	/** The third-person camera turned round our own player by this many degrees (90: from its side), 0 back to normal. */
	public static void cameraTurn(float degrees) {
		Freelook.testTurn = degrees;
	}

	/** Our own player walking forward (true) or standing (false), as the forward key would. */
	public static void walk(boolean on) {
		net.minecraft.client.Minecraft.getInstance().options.keyUp.setDown(on);
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
		mc.setScreenAndShow(CosmeticsScreen.sample(slot));
	}

	/** The open cosmetics menu on another slot, as a click on its tab would. */
	public static void cosmeticsSlot(String slot) {
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.select(slot);
	}

	/** The open cosmetics menu's figure, as if dragged round by this many degrees. */
	public static void cosmeticsDrag(float degrees) {
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.dragFigure(degrees);
	}

	/** The open cosmetics menu's figure: its box (GUI pixels: x, y, width, height), its turn by hand, and the GUI scale. */
	public static float[] cosmeticsFigure() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof CosmeticsScreen c)) return null;
		float[] f = c.figureForTest();
		return new float[] {f[0], f[1], f[2], f[3], f[4], (float) mc.getWindow().getGuiScale()};
	}

	/** Our own player in their own skin again (after testSkin). */
	public static void noTestSkin() {
		Cosmetics.testSkinSlim = false;
		Cosmetics.testSkin = null;
		Cosmetics.testSkinFor = null;
		Cosmetics.testSkinSlim = false;
	}

	/** Our own player in the game's own Alex skin, with slim or wide arms (textures/entity/player/<slim|wide>/alex). */
	public static void alexSkin(boolean slim) {
		String path = "entity/player/" + (slim ? "slim" : "wide") + "/alex";
		//#if MC >= 1.21.9
		Cosmetics.testSkin = new net.minecraft.core.ClientAsset.ResourceTexture(net.minecraft.resources.Identifier.withDefaultNamespace(path),
			net.minecraft.resources.Identifier.withDefaultNamespace("textures/" + path + ".png"));
		//#else
		//$ Cosmetics.testSkin = net.minecraft.resources.Identifier.withDefaultNamespace("textures/" + path + ".png");
		//#endif
		Cosmetics.testSkinSlim = slim;
		Cosmetics.testSkinFor = net.minecraft.client.Minecraft.getInstance().getGameProfile().id();
	}

	/** The open cosmetics menu's figure wearing this in a slot (as if the server said so), and what it shows from now. */
	public static void cosmeticsWorn(String slot, String id) {
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.wornForTest(slot, id);
	}

	/** The toast of an unlocked achievement with a cape for a reward, as the server's event brings it. */
	public static void achievementToast() {
		com.google.gson.JsonObject a = new com.google.gson.JsonObject();
		a.addProperty("name", "Weteran");
		a.addProperty("nameEn", "Veteran");
		com.google.gson.JsonObject reward = new com.google.gson.JsonObject();
		reward.addProperty("id", "veteran");
		reward.addProperty("slot", "cape");
		reward.addProperty("name", "Weteran");
		a.add("reward", reward);
		dev.slash3rss.slashclient.hud.social.Social.achievement(a);
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

	/** The minimap on or off, and how it looks. */
	public static void minimap(boolean on, String shape, boolean rotate, float zoom, int size) {
		SlashHud.config.placement("minimap").enabled = on;
		SlashHud.config.minimapShape = shape;
		SlashHud.config.minimapRotate = rotate;
		SlashHud.config.minimapZoom = zoom;
		SlashHud.config.minimapSize = size;
	}

	/** What the minimap knows: chunks, paints and their average time. */
	public static String minimapSummary() {
		return Minimap.summary();
	}

	/** The minimap's colour (0xFFRRGGBB, 0 unknown) and height of a column. */
	public static int[] minimapColumn(int x, int z) {
		return new int[] { MinimapTerrain.sample(x, z), MinimapTerrain.heightAt(x, z) };
	}

	/** A waypoint for the minimap at a place, or all of the test's ones ("Mini…") removed. */
	public static void minimapWaypoint(String name, int x, int y, int z) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (name == null) {
			Waypoints.here(mc).removeIf(p -> p.name.startsWith("Mini"));
		} else {
			var p = Waypoints.add(mc, name);
			p.x = x;
			p.y = y;
			p.z = z;
		}
		Waypoints.save();
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

	/** The block outline (red, opaque, thick) and the held items (low shield, smaller items) on or off. */
	public static void handView(boolean outline, boolean items) {
		HudConfig c = SlashHud.config;
		c.blockOutline = outline;
		c.blockOutlineColor = 0xFFF87171;
		c.blockOutlineOpacity = 100;
		c.blockOutlineWidth = 4f;
		c.lowShield = items;
		c.lowShieldAmount = 15f;
		// daylight (an earlier test leaves our own night on), so the hands are easy to see
		c.timeChanger = false;
		c.heldItems = items;
		c.heldItemScale = 0.6f;
		c.heldItemX = 0f;
		c.heldItemY = 0f;
		c.heldItemZ = 0f;
	}

	/** "outlines,items": how often each was drawn changed so far. */
	public static String handViewCounts() {
		return BlockOutline.drawn + "," + HeldItems.changed;
	}

	/** The held item skins this mod can draw: "shields|weapons". */
	public static String heldSkins() {
		return String.join(",", HeldSkins.SHIELDS) + "|" + String.join(",", HeldSkins.WEAPONS);
	}

	/** Other players' shield and weapon skins shown or not. */
	public static void heldOthers(boolean on) {
		SlashHud.config.heldSkinsOthers = on;
	}

	/**
	 * The skin our own player's main hand and off hand items show ("main,off", "-" for none), for
	 * ourselves or as if another player wearing the same held them.
	 */
	public static String heldPick(boolean self) {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		java.util.UUID id = self ? p.getUUID() : java.util.UUID.fromString("00000000-0000-4000-8000-0000000000aa");
		if (!self) for (String slot : HeldSkins.SLOTS) Cosmetics.set(id, slot, Cosmetics.worn(p.getUUID(), slot));
		String main = HeldSkins.pick(id, self, p.getMainHandItem()), off = HeldSkins.pick(id, self, p.getOffhandItem());
		return (main == null ? "-" : main) + "," + (off == null ? "-" : off);
	}

	/** How many held items were drawn with a skin so far. */
	public static int heldSwapped() {
		return HeldSkins.swapped;
	}

	/** Holds (or lets go of) the use key: a bow draws, a shield blocks. */
	public static void useKey(boolean on) {
		net.minecraft.client.Minecraft.getInstance().options.keyUse.setDown(on);
	}

	/** The player looks straight south (+z), level. */
	public static void lookSouth() {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		p.setYRot(0f);
		p.setXRot(0f);
		p.setYHeadRot(0f);
		p.setYBodyRot(0f);
	}

	/** What the crosshair is on: "block", "entity" or "miss". */
	public static String hitKind() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var hit = mc.hitResult;
		String kind = hit == null ? "none" : hit.getType().name().toLowerCase(java.util.Locale.ROOT);
		return kind.equals("block") ? kind : kind + " at " + mc.player.position() + " " + mc.player.getYRot() + "/" + mc.player.getXRot();
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

	/**
	 * The server's 'cosmetics' event, as the launcher passes it on: `set` is what the player wears now
	 * (null: the event without a set, so the HUD asks the server again).
	 */
	public static void liveCosmetics(java.util.UUID id, java.util.Map<String, String> set) {
		var e = new com.google.gson.JsonObject();
		e.addProperty("type", "cosmetics");
		var uuids = new com.google.gson.JsonArray();
		uuids.add(id.toString());
		e.add("uuids", uuids);
		if (set != null) {
			var sets = new com.google.gson.JsonObject();
			var items = new com.google.gson.JsonObject();
			set.forEach(items::addProperty);
			sets.add(id.toString(), items);
			e.add("cosmetics", sets);
		}
		try {
			dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
		} catch (Exception ex) {
			throw new IllegalStateException(ex);
		}
	}

	/** Everything a player shows, slot=item sorted ("" for nothing), for the test to compare. */
	public static String wornAll(java.util.UUID id) {
		var out = new java.util.TreeMap<String, String>();
		for (String slot : java.util.List.of("cape", "wings", "elytra", "trail", "aura", "pet", "hat", "top", "kill", "suit", "shield", "weapon", "shoes", "hands", "face", "ears", "back", "tail", "ring", "move", "spray", "prop")) {
			String item = Cosmetics.worn(id, slot);
			if (item != null) out.put(slot, item);
		}
		return out.toString();
	}

	/** The first hat and top this mod knows (they come from the clothing models). */
	public static String firstClothing(String slot) {
		return ("hat".equals(slot) ? Clothing.HATS : Clothing.TOPS).get(0);
	}

	/** As if the server had just been asked about a player (so only a recheck asks again soon). */
	public static void markLookedUp(java.util.UUID id) {
		Badges.markChecked(id);
	}

	/** Whether the next lookup asks about this player again. */
	public static boolean lookupDue(java.util.UUID id) {
		return !Badges.checked(id);
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

	/** Our own player wears this skin (a texture of the test mod: textures/skin/<name>, or textures/<path> for a path), for screenshots. */
	public static void testSkin(String texture) {
		String path = texture.contains("/") ? texture : "skin/" + texture;
		var id = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", path);
		//#if MC >= 1.21.9
		Cosmetics.testSkin = new net.minecraft.core.ClientAsset.ResourceTexture(id,
			net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "textures/" + path + ".png"));
		//#else
		//$ Cosmetics.testSkin = net.minecraft.resources.Identifier.fromNamespaceAndPath("slashclient-hud-test", "textures/" + path + ".png");
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
	 * (one of them, Huta, left out when `withoutHuta`, as after completing it; `reset`: nothing known before).
	 */
	public static void skyTasksScreen(boolean withoutHuta, boolean reset) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SkyTasks.testWorld = true;
		if (reset) {
			SkyTasks.resetForTest();
			SkyFish.resetForTest();
			SlashHud.config.placement("skyfish").enabled = true;
		}
		SlashHud.config.placement("skytasks").enabled = true;
		// the iron ingot as the game names it in the language the test plays in
		// SkyUp's Polish names (the test game plays in English: matched all the same)
		String iron = "Sztabka żelaza", stone = "Kamień", torch = "Pochodnia", chestName = "Skrzynia";
		var chest = new net.minecraft.world.SimpleContainer(27);
		chest.setItem(0, task(net.minecraft.world.item.Items.LAVA_BUCKET, "Od czego zacząć?", "Opis » Żeby wygenerować kamień musimy", "  znaleźć lawę. Powinna być w tej", "  jaskini koło domku!", "",
			"Posiadaj w ekwipunku:", "» Wiadro lawy: 1", "", "Za ukończenie otrzymasz:", "» 1 x Generator kamienia", "» 100.0 SC", "» 30 xp", "", "LPM \ue510 » Ukończ"));
		chest.setItem(1, task(net.minecraft.world.item.Items.STONE, "Podstawowy kamieniołom", "Zalecane ukończenie wyzwania Od czego", "  zacząć?", "", "Opis » Postaw generator i zobacz jak", "  działa!", "",
			"Zbierz:", "» " + stone + ": 28/128", "", "Za ukończenie otrzymasz:", "» Przedmioty na kolejny generator", "  kamienia /recipe Generator:", "» 4 x Sproszkowany redstone", "» 100.0 SC", "", "LPM \ue510 » Ukończ"));
		chest.setItem(2, task(net.minecraft.world.item.Items.TORCH, "A co tutaj tak ciemno?", "Opis » Rozświetl wyspę pochodniami, bo", "  zjedzą Cię potwory!", "",
			"Stwórz:", "» " + torch + ": 0/64", "Postaw", "» " + torch + ": 0/64", "", "Za ukończenie otrzymasz:", "» 2 x Latarnia", "» 100.0 SC", "» 30 xp", "", "LPM \ue510 » Ukończ"));
		if (!withoutHuta) chest.setItem(3, task(net.minecraft.world.item.Items.IRON_INGOT, "Huta", "Opis » Przepal surowe żelazo. Od", "  czegoś trzeba zacząć, co nie?", "",
			"Posiadaj w ekwipunku:", "» " + iron + ": 16", "", "Za ukończenie otrzymasz:", "» 10 x Węgiel", "» 150.0 SC", "» 50 xp", "", "LPM \ue510 » Ukończ"));
		chest.setItem(4, task(net.minecraft.world.item.Items.BELL, "Dobra praca się opłaca", "Opis » Zacznij piąć się w swojej", "  karierze. Awansuj w wybranej pracy!", "",
			"Posiadaj poziom dowolnej pracy: 5 poz.", "", "Za ukończenie otrzymasz:", "» 16 x Zaklęta butelka", "» 150.0 SC", "» 50 xp", "", "LPM \ue510 » Ukończ"));
		chest.setItem(5, task(net.minecraft.world.item.Items.BARRIER, "Stacja inkubacja", "Opis » Kaktusiarki to pieśń", "  przeszłości!", "",
			"Posiadaj w ekwipunku:", "» Kaktus: 16", "Posiadaj na wyspie co najmniej:", "» kaktus: 1 poz.", "", "Za ukończenie otrzymasz:", "» Redstone na rozwój inkubatora:",
			"» 24 x Sproszkowany redstone", "", "Uwaga » Przedmioty zostaną zabrane!", "LPM \ue510 » Ukończ"));
		chest.setItem(6, task(net.minecraft.world.item.Items.CRAFTING_TABLE, "Składzik", "Opis » Zbuduj swój pierwszy składzik!", "", "Stój obok:", "» " + chestName + ": 8", "",
			"Za ukończenie otrzymasz:", "» 2 x Skrzynia", "", "LPM \ue510 » Ukończ"));
		chest.setItem(7, task(net.minecraft.world.item.Items.GRASS_BLOCK, "Ciasno, ale własno", "Opis » Zwiększ poziom wyspy.", "", "Posiadaj poziom wyspy: 20 poz.", "",
			"Za ukończenie otrzymasz:", "» 200.0 SC", "", "LPM \ue510 » Ukończ"));
		chest.setItem(8, task(net.minecraft.world.item.Items.PUFFERFISH, "Moczykij", "Opis » Wyłów 24 ryby.", "", "Wyłów:", "» Dowolna ryba: 0/24", "", "Za ukończenie otrzymasz:", "» 1 x Wędka", "", "LPM \ue510 » Ukończ"));
		chest.setItem(9, task(net.minecraft.world.item.Items.SALMON, "Rybak", "Opis » Dziś rozliczamy się od wagi!", "", "Wyłów: 0g/200 000g", "", "Za ukończenie otrzymasz:", "» 250.0 SC", "", "LPM \ue510 » Ukończ"));
		chest.setItem(10, task(net.minecraft.world.item.Items.TROPICAL_FISH, "Mamut morski", "Opis » Ostatecznie mogą być też ogromne.", "", "Wyłów conajmniej ogromne: 0/45", "", "Za ukończenie otrzymasz:", "» 500.0 SC", "", "LPM \ue510 » Ukończ"));
		chest.setItem(11, task(net.minecraft.world.item.Items.FURNACE, "Piecoznawstwo", "Opis » Ulepsz piec na fortunę!", "", "Posiadaj w ekwipunku:", "» Piec przynajmniej Szczęście I: 1", "",
			"Za ukończenie otrzymasz:", "» 250.0 SC", "", "LPM \ue510 » Ukończ"));
		// the info item and the way back: no tasks
		chest.setItem(13, task(net.minecraft.world.item.Items.OAK_SIGN, "Informacje", "Wyzwania to kluczowy element", "  gry na Skyblocku!"));
		chest.setItem(22, task(net.minecraft.world.item.Items.PLAYER_HEAD, "Wróć", "LPM » Wróć"));
		var menu = net.minecraft.world.inventory.ChestMenu.threeRows(1000, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), net.minecraft.network.chat.Component.literal("\ue001\ue151\ue002Wyzwania » Nowicjusz")));
	}

	/** SkyUp's challenges menu ("Wyzwania"): the Nowicjusz category with `left` tasks left, and the daily task. */
	public static void skyMenuScreen(int left) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var chest = new net.minecraft.world.SimpleContainer(27);
		chest.setItem(10, task(net.minecraft.world.item.Items.BEETROOT, "Zadanie codzienne", "Ukończone zadania dzienne » 0", "Kategoria » Wirtuoz", "",
			"Zbierz:", "» Buraki: 0/3 888", "", "Za ukończenie otrzymasz:", "» 20000.0 SC", "", "LPM \ue510 » Ukończ wyzwanie"));
		chest.setItem(12, task(net.minecraft.world.item.Items.EMERALD, "Nowicjusz", "Pozostałe zadania » " + left, "", "Na tym poziomie » 969", "Ukończyli » 458", "",
			"Na tym poziomie otrzymasz m.in:", "» grzybnię", "", "LPM \ue510 » Sprawdź wyzwania"));
		chest.setItem(14, task(net.minecraft.world.item.Items.DIAMOND, "Wirtuoz", "Pozostałe zadania » 16", "", "Za ukończenie poziomu otrzymasz:", "» 500 SP", "", "LPM \ue510 » Sprawdź wyzwania"));
		var menu = net.minecraft.world.inventory.ChestMenu.threeRows(1001, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), net.minecraft.network.chat.Component.literal("\ue003\ue150\ue002Wyzwania")));
	}

	/** As if the player broke three stone blocks and crafted four torches (what the game's hooks report). */
	public static void skyEvents() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		for (int i = 0; i < 3; i++) SkyCounters.broken(mc.player, net.minecraft.world.level.block.Blocks.STONE.defaultBlockState());
		SkyCounters.crafted(mc.player, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.TORCH, 4), 4);
		// a fish as SkyUp gives them: a cod with its own name, the weight and size in the lore
		var fish = new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.COD);
		fish.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME, net.minecraft.network.chat.Component.literal("Ogromny, niezjadliwy Halibut atlantycki"));
		fish.set(net.minecraft.core.component.DataComponents.LORE, new net.minecraft.world.item.component.ItemLore(java.util.List.of(net.minecraft.network.chat.Component.literal(""),
			line("Wyłowił » " + mc.player.getName().getString(), net.minecraft.ChatFormatting.AQUA), line("Waga » 8 090,31g (ogromny)", net.minecraft.ChatFormatting.AQUA), line("Jakość » 8% (niezjadliwy)", net.minecraft.ChatFormatting.AQUA))));
		// as SkyUp says it in the chat: the fish on hover
		var hover = new net.minecraft.network.chat.HoverEvent.ShowItem(net.minecraft.world.item.ItemStackTemplate.fromNonEmptyStack(fish));
		Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal("Wędkarstwo » ").append(net.minecraft.network.chat.Component.literal("Wyłowiono: Ogromny Halibut (8 090,31g, 8%)!")
			.withStyle(s -> s.withHoverEvent(hover))));
	}

	/** The same tasks (Huta gone) in a chest of another name: not SkyUp's challenges, so not read. */
	public static void skyOtherChest() {
		skyTasksScreen(true, false);
		var mc = net.minecraft.client.Minecraft.getInstance();
		var open = (net.minecraft.client.gui.screens.inventory.ContainerScreen) screen();
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(open.getMenu(), mc.player.getInventory(), net.minecraft.network.chat.Component.literal("Skrzynia")));
	}

	public static String skyFish() {
		return SkyFish.debug();
	}

	/** Off SkyUp (another server): the tracker and the fish counter show nothing. */
	public static String skyElsewhere(boolean elsewhere) {
		SkyTasks.testWorld = !elsewhere;
		var mc = net.minecraft.client.Minecraft.getInstance();
		return "tasks " + new SkyTasks.Module().visible(mc) + " fish " + new SkyFish.Module().visible(mc);
	}

	public static String skyProgress() {
		return SkyTasks.debugProgress(net.minecraft.client.Minecraft.getInstance());
	}

	public static String skyCategories() {
		return SkyTasks.debugCategories();
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
