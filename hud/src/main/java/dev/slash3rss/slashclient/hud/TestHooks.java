// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Options;
import dev.slash3rss.slashclient.hud.benchmark.BenchScene;
import dev.slash3rss.slashclient.hud.benchmark.Benchmark;
import dev.slash3rss.slashclient.hud.benchmark.BenchmarkScreen;
import dev.slash3rss.slashclient.hud.chat.ChatExtras;
import dev.slash3rss.slashclient.hud.chat.ChatLook;
import dev.slash3rss.slashclient.hud.chat.ChatTabInput;
import dev.slash3rss.slashclient.hud.chat.ChatTabs;
import dev.slash3rss.slashclient.hud.chat.ChatTabsScreen;
import dev.slash3rss.slashclient.hud.chat.ChatWindows;
import dev.slash3rss.slashclient.hud.cosmetics.Clothing;
import dev.slash3rss.slashclient.hud.cosmetics.Cosmetics;
import dev.slash3rss.slashclient.hud.cosmetics.CosmeticsScreen;
import dev.slash3rss.slashclient.hud.cosmetics.EmoteScreen;
import dev.slash3rss.slashclient.hud.cosmetics.Gear;
import dev.slash3rss.slashclient.hud.cosmetics.HeldSkins;
import dev.slash3rss.slashclient.hud.cosmetics.KillEffects;
import dev.slash3rss.slashclient.hud.cosmetics.Leaves;
import dev.slash3rss.slashclient.hud.cosmetics.MoveEffects;
import dev.slash3rss.slashclient.hud.cosmetics.RingEffects;
import dev.slash3rss.slashclient.hud.cosmetics.Sprays;
import dev.slash3rss.slashclient.hud.cosmetics.Suits;
import dev.slash3rss.slashclient.hud.inventory.DropGuard;
import dev.slash3rss.slashclient.hud.map.Minimap;
import dev.slash3rss.slashclient.hud.map.MinimapTerrain;
import dev.slash3rss.slashclient.hud.map.Waypoints;
import dev.slash3rss.slashclient.hud.replay.Clips;
import dev.slash3rss.slashclient.hud.servers.PartnerServers;
import dev.slash3rss.slashclient.hud.servers.PinnedServer;
import dev.slash3rss.slashclient.hud.servers.Reconnect;
import dev.slash3rss.slashclient.hud.servers.ServerLayouts;
import dev.slash3rss.slashclient.hud.servers.ServerLayoutsPanel;
import dev.slash3rss.slashclient.hud.skyup.DungeonMap;
import dev.slash3rss.slashclient.hud.skyup.DungeonMapScreen;
import dev.slash3rss.slashclient.hud.skyup.DungeonRooms;
import dev.slash3rss.slashclient.hud.skyup.LootHighlight;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyCounters;
import dev.slash3rss.slashclient.hud.skyup.SkyFish;
import dev.slash3rss.slashclient.hud.skyup.SkyGenerator;
import dev.slash3rss.slashclient.hud.skyup.SkyIncubator;
import dev.slash3rss.slashclient.hud.skyup.SkyShaman;
//#endif
import dev.slash3rss.slashclient.hud.skyup.SkyTaskParser;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyTasks;
//#endif

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

	/**
	 * What the module cards offer and what the new options do to the sizes: "ping.textColor=false
	 * inventory.shadow=false keystrokes.background=true keys=46 coords=14 armor=5x" (the keys without
	 * the mouse and the space bar, the coordinates on one line, the armour side by side).
	 */
	public static String moduleOptions() {
		var entries = dev.slash3rss.slashclient.hud.ui.Catalog.entries(() -> {});
		java.util.function.BiFunction<String, String, Boolean> has = (id, key) -> entries.stream().filter(e -> e.id().equals(id)).findFirst()
			.map(e -> e.settings().stream().anyMatch(s -> s.labelKey().equals(key))).orElse(false);
		var mc = net.minecraft.client.Minecraft.getInstance();
		HudConfig c = SlashHud.config;
		c.keystrokesMouse = c.keystrokesSpace = false;
		c.coordsOneLine = true;
		int keys = new Modules.Keystrokes().height(mc), coords = new Modules.Coords().height(mc);
		c.keystrokesMouse = c.keystrokesSpace = true;
		c.coordsOneLine = false;
		var armor = new Modules.Armor();
		int tall = armor.height(mc);
		c.armorHorizontal = true;
		int flat = armor.height(mc);
		c.armorHorizontal = false;
		return "ping.textColor=" + has.apply("ping", "slashclient-hud.textColor") + " inventory.shadow=" + has.apply("inventory", "slashclient-hud.shadow")
			+ " keystrokes.background=" + has.apply("keystrokes", "slashclient-hud.background") + " keys=" + keys + " coords=" + coords
			+ " armor=" + (flat < tall ? "flat" : "tall");
	}

	private static final java.util.Map<String, Boolean> optionsDemoWas = new java.util.HashMap<>();

	/** The new options on, for a screenshot: blue boxes, the armour side by side in percent, keys without the mouse… (off: back to the defaults). */
	public static void moduleOptionsDemo(boolean on) {
		HudConfig c = SlashHud.config, d = new HudConfig();
		for (String id : new String[] { "armor", "keystrokes", "coords" }) {
			if (on) optionsDemoWas.put(id, c.placement(id).enabled);
			c.placement(id).enabled = on || optionsDemoWas.getOrDefault(id, false);
		}
		c.backgroundColor = on ? 0xFF1E3A8A : d.backgroundColor;
		c.outlineColor = on ? 0xFFFACC15 : d.outlineColor;
		c.armorHorizontal = on;
		c.armorDurability = on ? "percent" : d.armorDurability;
		c.durabilityFormat = on ? "percent" : d.durabilityFormat;
		c.durabilityBar = !on;
		c.compassDegrees = !on;
		c.keystrokesMouse = !on;
		c.keystrokesPressed = on ? 0xFF4ADE80 : d.keystrokesPressed;
		c.coordsOneLine = on;
		c.coordsY = !on;
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

	/** The autoclicker switched on in a mode ("hold" or "toggle", not armed yet), its buttons and speed; its click counts reset. */
	public static void autoClicker(boolean on, String mode, boolean left, boolean right, boolean mobs, int cps) {
		HudConfig c = SlashHud.config;
		c.assistWarned = true;
		c.autoClicker = on;
		c.autoClickMode = mode;
		c.autoClickLeft = left;
		c.autoClickRight = right;
		c.autoClickMobs = mobs;
		c.autoClickCps = c.autoClickRightCps = cps;
		c.autoClickJump = false;
		c.autoClickShield = true;
		c.autoClickCooldown = false;
		c.autoClickContainers = true;
		Assist.arm(false);
		Assist.leftClicks = Assist.rightClicks = 0;
	}

	/** The mouse buttons held down by the player (or let go). */
	public static void holdButtons(boolean left, boolean right) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.options.keyAttack.setDown(left);
		mc.options.keyUse.setDown(right);
	}

	/** The toggle mode's key pressed: the clicking starts on its own. */
	public static void armAutoClicker() {
		Assist.arm(true);
	}

	/** "Hold the right button" on a key ("key.keyboard.h"; null: none), for the test that lets go of it over a window. */
	public static void bindHoldUse(String key) {
		Assist.holdUseKey.setKey(key == null ? com.mojang.blaze3d.platform.InputConstants.UNKNOWN : com.mojang.blaze3d.platform.InputConstants.getKey(key));
		net.minecraft.client.KeyMapping.resetMapping();
	}

	/** A button held by its key (attack: the left one) on or off, and whether it goes on over the inventory and the pause menu. */
	public static void hold(boolean attack, boolean on, boolean inScreens) {
		SlashHud.config.holdInScreens = inScreens;
		Assist.hold(attack, on);
	}

	/** The hotbar slot in hand, set and read (the game's way differs between versions). */
	public static void selectSlot(int slot) {
		// written as the versions' replacements expect it ("inv.setSelectedSlot(")
		var inv = net.minecraft.client.Minecraft.getInstance().player.getInventory();
		inv.setSelectedSlot(slot);
	}

	public static int selectedSlot() {
		return net.minecraft.client.Minecraft.getInstance().player.getInventory().getSelectedSlot();
	}

	/** Whether a key or the use button is down now ("attack/use"), to see nothing stays stuck. */
	public static String buttonsDown() {
		var o = net.minecraft.client.Minecraft.getInstance().options;
		return o.keyAttack.isDown() + "/" + o.keyUse.isDown();
	}

	/** The world opened to LAN, so the pause menu does not pause it (as on a server). */
	public static boolean openToLan() {
		var server = net.minecraft.client.Minecraft.getInstance().getSingleplayerServer();
		if (server == null) return false;
		//#if MC >= 26.2
		return server.publishServer(net.minecraft.server.MinecraftServer.MultiplayerScope.LAN, net.minecraft.util.HttpUtil.getAvailablePort());
		//#else
		//$ return server.publishServer(net.minecraft.world.level.GameType.SURVIVAL, false, net.minecraft.util.HttpUtil.getAvailablePort());
		//#endif
	}

	/** Whether the right button is being held by its key. */
	public static boolean holdingUse() {
		return Assist.holding(false);
	}

	/** The autoclicker jumps too, this many a second; the jumps made so far. */
	public static int autoClickJumps(int perSecond) {
		if (perSecond > 0) {
			SlashHud.config.autoClickJump = true;
			SlashHud.config.autoClickJumps = perSecond;
		}
		return Assist.jumps;
	}

	/** Full hits at mobs on or off. */
	public static void autoClickCooldown(boolean on) {
		SlashHud.config.autoClickCooldown = on;
	}

	/** A shield in the off hand, raised (or lowered). */
	public static void raiseShield(boolean up) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (up) mc.player.setItemSlot(net.minecraft.world.entity.EquipmentSlot.OFFHAND, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.SHIELD));
		mc.options.keyUse.setDown(up);
	}

	/**
	 * The attack indicator module just after a hit (the weapon charging again), with our crosshair and
	 * with the game's: "shown with ours / shown with the game's" (the game draws its own then).
	 */
	public static String attackIndicator() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		String keep = SlashHud.config.crosshair;
		var option = mc.options.attackIndicator().get();
		mc.options.attackIndicator().set(net.minecraft.client.AttackIndicatorStatus.CROSSHAIR);
		mc.player.resetAttackStrengthTicker();
		var module = new Extras.AttackIndicator();
		SlashHud.config.crosshair = "plus";
		boolean ours = module.visible(mc);
		SlashHud.config.crosshair = "vanilla";
		boolean game = module.visible(mc);
		SlashHud.config.crosshair = keep;
		mc.options.attackIndicator().set(option);
		// only its size can be set (no box, no text)
		int options = dev.slash3rss.slashclient.hud.ui.Catalog.entries(() -> {}).stream().filter(e -> e.id().equals("attackindicator")).findFirst().map(e -> e.settings().size()).orElse(-1);
		return ours + "/" + game + "/" + options;
	}

	/** The clicks a second the CPS module and the keystrokes show: "left/right". */
	public static String shownCps() {
		return Modules.CLICKS.left() + "/" + Modules.CLICKS.right();
	}

	/** The autoclicker's clicks since it was set: "left/right". */
	public static String autoClicks() {
		return Assist.leftClicks + "/" + Assist.rightClicks;
	}

	/** The health of the living thing nearest to us (not us), or -1. */
	public static float nearestHealth() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		net.minecraft.world.entity.LivingEntity best = null;
		for (var e : mc.level.entitiesForRendering()) {
			if (e == mc.player || !(e instanceof net.minecraft.world.entity.LivingEntity l)) continue;
			if (best == null || e.distanceTo(mc.player) < best.distanceTo(mc.player)) best = l;
		}
		return best == null ? -1 : best.getHealth();
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

	/**
	 * As if the server had said the rank we show is this one in this colour (servers from 0.9.23; -1: none,
	 * the HUD's own colours), written to the chat like ownRank; our own nametag shows in F5.
	 */
	public static void chosenRank(String label, String rank, int color) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SlashHud.config.ownNametag = true;
		Badges.setRank(mc.player.getUUID(), rank);
		Badges.setBadgeColor(mc.player.getUUID(), color);
		Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal(label + ": ")
			.append(Badges.decorate(mc.player.getUUID(), mc.player.getName())));
	}

	/** As if the server had said we are live on this platform ("twitch", "kick"; null: not live), with our own name shown (F5). */
	public static void live(String platform) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SlashHud.config.ownNametag = true;
		Badges.setLive(mc.player.getUUID(), platform);
	}

	/** The "● NA ŻYWO" line our own name would have now (null: none). */
	public static net.minecraft.network.chat.Component liveLabel() {
		return Badges.liveLabel(net.minecraft.client.Minecraft.getInstance().player.getUUID());
	}

	/**
	 * Our own name tag (F5) as another player's on a server, with this ping on our tab list entry
	 * (anyWorld: singleplayer counts as a server); the name tag as it would be drawn now, as text with
	 * the ping's colour after "#" ("Slash 45ms#55FF55"), or the bare name when it has no ping.
	 */
	public static String nametagPing(boolean anyWorld, int ms) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SlashHud.config.ownNametag = true;
		NametagPing.anyWorld = anyWorld;
		var info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
		try {
			var set = net.minecraft.client.multiplayer.PlayerInfo.class.getDeclaredMethod("setLatency", int.class);
			set.setAccessible(true);
			set.invoke(info, ms);
		} catch (ReflectiveOperationException e) {
			throw new IllegalStateException(e);
		}
		var label = NametagPing.label(mc.player.getUUID());
		String name = NametagPing.decorate(mc.player, mc.player.getName()).getString();
		boolean shown = !name.equals(mc.player.getName().getString());
		return !shown || label == null || label.getStyle().getColor() == null ? name : name + String.format("#%06X", label.getStyle().getColor().getValue());
	}

	/** Our name tag with everything around it at once: the logo in a rank's colour, a clan's [TAG] and "● NA ŻYWO" (null: all off). */
	public static void nametagExtras(boolean on) {
		var id = net.minecraft.client.Minecraft.getInstance().player.getUUID();
		Badges.setRank(id, on ? "partner" : null);
		Badges.setClan(id, on ? "SLSH" : null);
		Badges.setLive(id, on ? "twitch" : null);
	}

	/** As if the server had said we support the project with a tier of this colour (-1: the default pink), written to the chat like ownRank. */
	public static void supporterRank(String label, int color) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Badges.setRank(mc.player.getUUID(), "supporter");
		Badges.setSupporterColor(mc.player.getUUID(), color);
		Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal(label + ": ")
			.append(Badges.decorate(mc.player.getUUID(), mc.player.getName())));
	}

	public static boolean moduleOn(String id) {
		return SlashHud.config.placement(id).enabled;
	}

	// ---------- the editor's undo and redo (GameHudUndo) ----------

	/** "steps back, steps forward" of the open editor. */
	public static String historyState() {
		return ((HudEditScreen) screen()).historySizes();
	}

	/** The middle of the editor's undo or redo button (GUI coordinates), or null when it is not shown. */
	public static double[] historyButton(boolean redo) {
		return ((HudEditScreen) screen()).historyButtonCenter(redo);
	}

	/** A point inside a module's box in the layout editor. */
	/**
	 * Only these modules on (the others off, the game's parts too), at their normal size, as earlier
	 * tests may have scaled them; gives back the ids that were on, for {@link #modulesOn}.
	 */
	public static java.util.List<String> onlyModules(String... ids) {
		java.util.List<String> was = new java.util.ArrayList<>();
		java.util.Set<String> keep = java.util.Set.of(ids);
		for (HudModule m : SlashHud.MODULES) {
			HudConfig.Placement p = SlashHud.config.placement(m.id());
			if (p.enabled) was.add(m.id());
			p.enabled = keep.contains(m.id());
			if (p.enabled) p.scale = 1f;
		}
		return was;
	}

	/** These modules on again, the others off. */
	public static void modulesOn(java.util.List<String> ids) {
		for (HudModule m : SlashHud.MODULES) SlashHud.config.placement(m.id()).enabled = ids.contains(m.id());
	}

	/** The module the mouse is on in the open editor, or null. */
	public static String editorSelected() {
		return ((HudEditScreen) screen()).selectedId();
	}

	public static String editorHovered() {
		return ((HudEditScreen) screen()).hoveredId();
	}

	/** A module's box (x, y, width, height) in the open editor. */
	public static int[] editorBox(String id) {
		return ((HudEditScreen) screen()).boxOf(id);
	}

	public static double[] modulePoint(String id) {
		int[] b = ((HudEditScreen) screen()).boxOf(id);
		return new double[] { b[0] + Math.min(4, b[2] / 2.0), b[1] + Math.min(4, b[3] / 2.0) };
	}

	/** The middle of a row of the open settings page, or null when it is not drawn. */
	public static double[] settingsRow(String labelKey) {
		int[] r = HudEditScreen.ROWS.get(labelKey);
		return r == null ? null : new double[] { r[0] + r[2] / 2.0, r[1] + r[3] / 2.0 };
	}

	/** The middle of a key button on the open settings page (by the key's name), or null when it is not drawn. */
	public static double[] keyButton(String name) {
		int[] k = HudEditScreen.KEYS.get(name);
		return k == null ? null : new double[] { k[0] + k[2] / 2.0, k[1] + k[3] / 2.0 };
	}

	/** The key a binding of the game's controls has now, as options.txt saves it ("key.keyboard.g"). */
	public static String keyOf(String name) {
		return dev.slash3rss.slashclient.hud.ui.Catalog.keyMapping(name).saveString();
	}

	/** Sets a binding back to its default key. */
	public static void defaultKey(String name) {
		var k = dev.slash3rss.slashclient.hud.ui.Catalog.keyMapping(name);
		dev.slash3rss.slashclient.hud.ui.Catalog.setKey(k, k.getDefaultKey());
	}

	/** What options.txt says about a binding now ("key.keyboard.g"), or null when it has no line. */
	public static String savedKey(String name) {
		try {
			for (String line : java.nio.file.Files.readAllLines(new java.io.File(net.minecraft.client.Minecraft.getInstance().gameDirectory, "options.txt").toPath()))
				if (line.startsWith("key_" + name + ":")) return line.substring(name.length() + 5);
		} catch (java.io.IOException e) {
			throw new java.io.UncheckedIOException(e);
		}
		return null;
	}

	/** A point on a slider of the open settings page, `f` of the way along it. */
	public static double[] sliderPoint(String labelKey, double f) {
		int[] s = HudEditScreen.SLIDERS.get(labelKey);
		return s == null ? null : new double[] { s[0] + s[2] * f, s[1] + 5 };
	}

	/** The right mouse button pressed and let go on the open screen. */
	public static void rightClick(double[] at) {
		var e = new net.minecraft.client.input.MouseButtonEvent(at[0], at[1], new net.minecraft.client.input.MouseButtonInfo(com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT, 0));
		//#if MC >= 1.21.9
		screen().mouseClicked(e, false);
		screen().mouseReleased(e);
		//#else
		//$ screen().mouseClicked(e.x(), e.y(), e.button());
		//$ screen().mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}

	/** A key with Ctrl (Cmd on a Mac), and Shift when asked, pressed on the open screen. */
	public static void commandKey(char letter, boolean shift) {
		int key = letter == 'z' ? com.mojang.blaze3d.platform.InputConstants.KEY_Z : com.mojang.blaze3d.platform.InputConstants.KEY_Y;
		//#if MC >= 1.21.9
		int mods = net.minecraft.client.input.InputQuirks.EDIT_SHORTCUT_KEY_MODIFIER | (shift ? com.mojang.blaze3d.platform.InputConstants.MOD_SHIFT : 0);
		//#else
		//$ int mods = (net.minecraft.client.Minecraft.ON_OSX ? org.lwjgl.glfw.GLFW.GLFW_MOD_SUPER : org.lwjgl.glfw.GLFW.GLFW_MOD_CONTROL)
		//$ 	| (shift ? org.lwjgl.glfw.GLFW.GLFW_MOD_SHIFT : 0);
		//#endif
		//#if MC >= 1.21.9
		// the key's place, then from 26.3 the letter it types with the keyboard's layout (before it a scan code, not read)
		screen().keyPressed(new net.minecraft.client.input.KeyEvent(key, letter, mods));
		//#else
		//$ screen().keyPressed(key, 0, mods);
		//#endif
	}

	/** What the undo test changes: the FPS module's place, scale and background, and whether the ping is on. */
	public static String undoProbe() {
		HudConfig.Placement fps = SlashHud.config.placement("fps");
		return String.format(java.util.Locale.ROOT, "fps %.2f,%.2f,%d,%d x%.2f bg=%s | ping %s", fps.ax, fps.ay, fps.dx, fps.dy, fps.scale(),
			fps.background(SlashHud.config), SlashHud.config.placement("ping").enabled);
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

	/** The tab list's own texts hidden (or shown again); what it holds afterwards: "header|footer", "-" for none. */
	public static String tabTexts(boolean hide) {
		SlashHud.config.tabHideHeader = SlashHud.config.tabHideFooter = hide;
		var parts = (dev.slash3rss.slashclient.hud.mixin.PlayerTabOverlayAccessor) Compat.tabList(net.minecraft.client.Minecraft.getInstance());
		var h = parts.slashclient$header();
		var f = parts.slashclient$footer();
		return (h == null ? "-" : h.getString()) + "|" + (f == null ? "-" : f.getString());
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

	/** Hides or shows the whole GUI, as F1 does. */
	public static void hideGui(boolean hidden) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		//#if MC >= 26.2
		if (mc.gui.hud.isHidden() != hidden) mc.gui.hud.toggle();
		//#else
		//$ mc.options.hideGui = hidden;
		//#endif
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

	/**
	 * As the game starts with a tab already pulled out and its lines kept out of "All": the setting
	 * on, the chat's filter as the game starts it (everything); null name = all of that undone.
	 */
	public static void pulledOutAtStart(String name, String pattern) {
		SlashHud.config.chatTabs.removeIf(t -> t.window != null && t.name.startsWith("Start "));
		SlashHud.config.chatWindowsOnly = name != null;
		if (name != null) {
			HudConfig.ChatTab tab = new HudConfig.ChatTab(name, false);
			tab.patterns.add(pattern);
			tab.window = HudConfig.Placement.at(0.6f, 0.1f);
			SlashHud.config.chatTabs.add(tab);
		}
		ChatTabs.changed();
		if (name != null) Compat.setChatFilter(Compat.chat(net.minecraft.client.Minecraft.getInstance()), m -> true);
	}

	/** Enchantments' names as tooltips show them: each one's colour (hex) for a few levels, and with the setting off. */
	public static String enchantColors() {
		var reg = net.minecraft.client.Minecraft.getInstance().level.registryAccess().lookupOrThrow(net.minecraft.core.registries.Registries.ENCHANTMENT);
		StringBuilder out = new StringBuilder();
		Object[][] cases = { { net.minecraft.world.item.enchantment.Enchantments.SHARPNESS, 1 }, { net.minecraft.world.item.enchantment.Enchantments.SHARPNESS, 3 },
			{ net.minecraft.world.item.enchantment.Enchantments.SHARPNESS, 5 }, { net.minecraft.world.item.enchantment.Enchantments.SHARPNESS, 6 },
			{ net.minecraft.world.item.enchantment.Enchantments.MENDING, 1 }, { net.minecraft.world.item.enchantment.Enchantments.VANISHING_CURSE, 1 } };
		for (int pass = 0; pass < 2; pass++) {
			SlashHud.config.enchantColors = pass == 0;
			for (Object[] c : cases) {
				@SuppressWarnings("unchecked")
				var key = (net.minecraft.resources.ResourceKey<net.minecraft.world.item.enchantment.Enchantment>) c[0];
				var color = net.minecraft.world.item.enchantment.Enchantment.getFullname(reg.getOrThrow(key), (int) c[1]).getStyle().getColor();
				out.append(color == null ? "none" : String.format("%06x", color.getValue())).append(' ');
			}
			out.append("| ");
		}
		SlashHud.config.enchantColors = true;
		return out.toString().strip();
	}

	/** What the food in the hand gives and the food bar after eating it: "points saturation -> food saturation". */
	public static String foodPreview() {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		float[] gives = FoodPreview.of(p.getMainHandItem());
		if (gives == null) return "none";
		float[] then = FoodPreview.after(p.getFoodData().getFoodLevel(), p.getFoodData().getSaturationLevel(), gives);
		return String.format(java.util.Locale.ROOT, "%.0f %.1f -> %.0f %.1f", gives[0], gives[1], then[0], then[1]);
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

	/** How many messages the chat keeps after 1500 different ones arrive and 1500 are sent ("kept/sent"), with the longer history on (at `lines`) or off. */
	public static String chatHistory(boolean longer, int lines) {
		var cfg = SlashHud.config;
		boolean keptOn = cfg.chatLongHistory;
		int keptLines = cfg.chatHistoryLines;
		cfg.chatLongHistory = longer;
		cfg.chatHistoryLines = lines;
		var chat = Compat.chat(net.minecraft.client.Minecraft.getInstance());
		chat.clearMessages(false);
		for (int i = 0; i < 1500; i++) {
			//#if MC >= 26.1
			chat.addClientSystemMessage(net.minecraft.network.chat.Component.literal("history line " + i));
			//#else
			//$ chat.addMessage(net.minecraft.network.chat.Component.literal("history line " + i));
			//#endif
		}
		int kept = ((dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) chat).slashclient$allMessages().size();
		for (int i = 0; i < 1500; i++) chat.addRecentChat("sent " + i);
		int sent = chat.getRecentChat().size();
		chat.clearMessages(true);
		cfg.chatLongHistory = keptOn;
		cfg.chatHistoryLines = keptLines;
		return kept + "/" + sent;
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
	/** For the test: a server played on, so the disconnect screen offers "Reconnect" to it. */
	/** For the test: how good auto tool finds a stack for a block. */
	/** For the test: the slot auto tool picks for a block (hotbar 0-8, backpack 9-35). */
	public static int autoToolSlot(net.minecraft.world.entity.player.Inventory inv, net.minecraft.world.level.block.state.BlockState state) {
		return Assist.bestSlot(inv, state);
	}

	/** Auto tool's weapon for a hit: the slot it picks, and a stack's attack damage. */
	public static int autoToolWeapon(net.minecraft.world.entity.player.Inventory inv) {
		return Assist.bestWeapon(inv);
	}

	/** The slot auto tool takes for a right click on that mob (-1: none). */
	public static int autoToolFor(net.minecraft.world.entity.player.Inventory inv, net.minecraft.world.entity.Entity mob) {
		return Assist.slotFor(inv, mob);
	}

	public static double weaponDamage(net.minecraft.world.item.ItemStack stack) {
		return Assist.damage(stack);
	}

	public static float autoToolSpeed(net.minecraft.world.item.ItemStack stack, net.minecraft.world.level.block.state.BlockState state) {
		return Assist.speed(stack, state);
	}

	public static void reconnectTo(net.minecraft.client.multiplayer.ServerData data) {
		Reconnect.lastForTest(data);
	}

	/** For the test: the titles' box closed with ✕ in the editor, then switched on in the module list – shown again? */
	public static boolean titlesBackAfterClose() {
		SlashHud.config.placement("titles").enabled = false;
		for (var e : dev.slash3rss.slashclient.hud.ui.Catalog.entries(() -> {})) if (e.id().equals("titles")) {
			if (e.get().get()) return false;
			e.set().accept(true);
		}
		return GameParts.TITLES.on();
	}

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
		// only the chat tabs: back the same, a tab of the same name replaced, a new one added, no HUD code taken
		HudConfig.ChatTab spy = new HudConfig.ChatTab("SPY", false, "{nick}");
		spy.sound = "pling";
		spy.replyPrefix = "/g ";
		String tabs = ShareCode.encodeTabs(java.util.List.of(spy, new HudConfig.ChatTab("PM", true, "\\[msg\\]")));
		java.util.List<HudConfig.ChatTab> read = ShareCode.decodeTabs(tabs);
		if (read == null || read.size() != 2 || !"pling".equals(read.get(0).sound) || !"/g ".equals(read.get(0).prefix()) || !read.get(1).regex)
			throw new AssertionError("tabs code does not round-trip: " + tabs);
		if (ShareCode.decodeTabs(code) != null || ShareCode.decodeTabs("SCTABS1:not-a-code") != null) throw new AssertionError("bad tabs codes must be refused");
		java.util.List<HudConfig.ChatTab> mine = new java.util.ArrayList<>(java.util.List.of(new HudConfig.ChatTab("PM", false, "old"), new HudConfig.ChatTab("@", false, "{nick}")));
		int added = HudEditScreen.importTabs(mine, read);
		if (added != 2 || mine.size() != 3 || !mine.get(0).regex || !mine.get(2).name.equals("SPY")) throw new AssertionError("tabs import: " + added + " " + mine.size());
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

	/** The test scene from the menu, flown `speed` times faster than a real run. */
	public static void benchScene(double speed) {
		Benchmark.timeScale = speed;
		BenchScene.open(net.minecraft.client.Minecraft.getInstance());
	}

	/** "stage scene running", e.g. "running forest true", for the test scene's test. */
	public static String benchSceneState() {
		return BenchScene.state() + " " + Benchmark.running();
	}

	/** The newest run's mark and its scenes as "id:avg:frames", for the test scene's test. */
	public static String benchSceneResult() {
		Benchmark.Result r = Benchmark.latest();
		if (r == null) return "none";
		StringBuilder b = new StringBuilder(String.valueOf(r.scene)).append(' ').append(r.frames).append(' ').append(r.fps.avg)
			.append(' ').append(screen() instanceof BenchmarkScreen);
		if (r.scenes != null) for (var sc : r.scenes) b.append(' ').append(sc.id).append(':').append(sc.avg).append(':').append(sc.frames);
		return b.toString();
	}

	/**
	 * Runs from before, for the comparison: a test scene run (slower in every scene) and, newer,
	 * one in an own world, which the test scene's result must not be compared with.
	 */
	public static void benchEarlierRuns() {
		long now = System.currentTimeMillis();
		Benchmark.Result scene = new Benchmark.Result();
		scene.at = now - 120_000;
		scene.version = "26.3";
		scene.scene = BenchScene.ID;
		scene.fps.avg = 40;
		scene.fps.low1 = 9;
		scene.frames = 2000;
		scene.scenes = new java.util.ArrayList<>();
		for (String id : new String[] { "forest", "panorama", "village", "water", "entities", "particles", "night" }) {
			Benchmark.SceneFps sc = new Benchmark.SceneFps();
			sc.id = id;
			sc.avg = 40;
			sc.low1 = 9;
			sc.frames = 300;
			scene.scenes.add(sc);
		}
		Benchmark.save(scene);
		Benchmark.Result own = new Benchmark.Result();
		own.at = now - 60_000;
		own.version = "26.3";
		own.world = "New World";
		own.fps.avg = 500;
		own.fps.low1 = 100;
		own.frames = 5000;
		Benchmark.save(own);
	}

	/** What the newest run is compared with: "scene avg" of the run before it, or "none". */
	public static String benchCompared() {
		Benchmark.Result r = Benchmark.latest();
		Benchmark.Result before = r == null ? null : Benchmark.previous(r);
		return before == null ? "none" : before.scene + " " + before.fps.avg;
	}

	/** Where the scene's camera is now: x y z yaw pitch, or "none". */
	public static String benchCamera() {
		double[] at = BenchScene.camera();
		return at == null ? "none" : at[0] + " " + at[1] + " " + at[2] + " " + at[3] + " " + at[4];
	}

	/** The places the test scene would use in this server's world, as "key=value" words (on the server's thread). */
	public static String benchPlan(net.minecraft.server.MinecraftServer server) {
		BenchScene.Plan p = BenchScene.compute(server.overworld());
		return "village=" + p.village + " centre=" + p.cx + "," + p.ground + "," + p.cz + " forest=" + p.forestHits + " water=" + p.waterHits
			+ " bumps=" + p.penBumps + " lanterns=" + p.lanterns.size() + " mobs=" + p.mobs.size() + " seconds=" + p.length();
	}

	public static void benchSceneDone() {
		Benchmark.timeScale = 1;
	}

	/**
	 * Out of a world the test opened itself (not through the test's world builder), as the test
	 * framework closes its own: without waiting here for the save, which the test's ticks drive.
	 */
	public static void leaveWorld() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var saving = net.minecraft.network.chat.Component.translatable("menu.savingLevel");
		//#if MC >= 1.21.6
		if (mc.level != null) mc.level.disconnect(saving);
		//#elif MC >= 1.21.4
		//$ if (mc.level != null) mc.level.disconnect();
		//#endif
		//#if MC >= 1.21.4
		mc.disconnect(new net.minecraft.client.gui.screens.GenericMessageScreen(saving), false);
		//#else
		//$ Compat.leaveWorld(mc, saving);
		//#endif
	}

	public static boolean inWorld() {
		return net.minecraft.client.Minecraft.getInstance().level != null;
	}

	/** Out of the world and on a menu that is not a loading or saving screen. */
	public static boolean onMenu() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var s = screen();
		return mc.level == null && (s instanceof net.minecraft.client.gui.screens.TitleScreen || s instanceof dev.slash3rss.slashclient.hud.ui.SlashTitleScreen);
	}

	public static int renderDistance() {
		return net.minecraft.client.Minecraft.getInstance().options.renderDistance().get();
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

	/** How many autumn leaves (Leaves: the leaf auras and rings) have been made so far. */
	public static int leavesMade() {
		return Leaves.made;
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

	/** The open cosmetics menu's layout: its panel (GUI pixels: x, y, width, height), the slot tabs' rows and how many show, the tiles in a row. */
	public static int[] cosmeticsLayout() {
		return Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c ? c.layoutForTest() : null;
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

	// ---------- the Sparks shop ----------

	private static final java.util.Map<String, Integer> SHOP_PRICES = java.util.Map.ofEntries(java.util.Map.entry("emberstar", 600), java.util.Map.entry("obsidian", 500),
		java.util.Map.entry("coral", 500), java.util.Map.entry("thunder", 700), java.util.Map.entry("regal", 800), java.util.Map.entry("cosmos", 1000),
		java.util.Map.entry("emberwings", 1200), java.util.Map.entry("sapphire", 1000), java.util.Map.entry("obsidianwings", 1000));

	/** The cosmetics menu with the shop's capes and wings at their prices (the coral cape and the sapphire wings already bought) and this many Sparks. */
	public static void shopMenu(String slot, int balance) {
		net.minecraft.client.Minecraft.getInstance().setScreenAndShow(CosmeticsScreen.sampleShop(slot, balance, SHOP_PRICES, java.util.Set.of("coral", "sapphire")));
	}

	/** The open menu's "buy it?" box for a shop item, as a click on its tile; false when it is not for sale. */
	public static boolean shopOffer(String id) {
		return Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c && c.offerForTest(id);
	}

	/** "Buy" in the open box; the purchase is answered as the server would (no launcher here). */
	public static void shopConfirm() {
		CosmeticsScreen.shopForTest = id -> {
			if (!(Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c)) throw new IllegalStateException("HTTP 502 {\"error\":\"not_found\"}");
			int balance = Integer.parseInt(c.shopForTest(id).split("\\|")[0]);
			com.google.gson.JsonObject res = new com.google.gson.JsonObject();
			res.addProperty("balance", balance - SHOP_PRICES.get(id));
			return res;
		};
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.confirmForTest();
	}

	/** The game's language switched (as in its options), the texts reloaded; the future is done when they are. */
	public static java.util.concurrent.CompletableFuture<Void> language(String code) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.options.languageCode = code;
		mc.getLanguageManager().setSelected(code);
		return mc.reloadResourcePacks();
	}

	/** The middle of an item's tile in the open menu, in the window's pixels (for the mouse), or null. */
	public static double[] shopTile(String id) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		int[] at = Compat.screen(mc) instanceof CosmeticsScreen c ? c.tileForTest(id) : null;
		double s = mc.getWindow().getGuiScale();
		return at == null ? null : new double[] {(at[0] + 16) * s, (at[1] + 20) * s};
	}

	/** The open menu's shop: "balance|box open|item owned|worn in this slot". */
	public static String shopState(String id) {
		return Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c ? c.shopForTest(id) : "";
	}

	/** The server's 'wallet' event, as the launcher passes it on. */
	public static void walletEvent(int balance, int change) throws Exception {
		com.google.gson.JsonObject e = new com.google.gson.JsonObject();
		e.addProperty("type", "wallet");
		e.addProperty("balance", balance);
		e.addProperty("change", change);
		e.addProperty("reason", "admin");
		dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
	}

	/** An unlocked achievement that paid Sparks (with a cape too, or not), and one of several at once ("quiet": no toast of its own). */
	public static void achievementSparksToast(boolean cape, boolean quiet) throws Exception {
		com.google.gson.JsonObject a = new com.google.gson.JsonObject();
		a.addProperty("name", cape ? "Weteran" : "Nocny marek");
		a.addProperty("nameEn", cape ? "Veteran" : "Night owl");
		a.addProperty("sparks", cape ? 250 : 50);
		a.addProperty("category", "time");
		a.addProperty("hidden", false);
		if (cape) {
			com.google.gson.JsonObject reward = new com.google.gson.JsonObject();
			reward.addProperty("id", "veteran");
			reward.addProperty("slot", "cape");
			reward.addProperty("name", "Weteran");
			a.add("reward", reward);
		}
		com.google.gson.JsonObject e = new com.google.gson.JsonObject();
		e.addProperty("type", "achievement");
		e.add("achievement", a);
		if (quiet) e.addProperty("quiet", true);
		dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
	}

	/** A daily or weekly challenge completed: the server's 'challenge' event (server 0.9.36+). */
	public static void challengeToast(boolean weekly) throws Exception {
		com.google.gson.JsonObject c = new com.google.gson.JsonObject();
		c.addProperty("id", weekly ? "w_play_300" : "d_play_30");
		c.addProperty("period", weekly ? "weekly" : "daily");
		c.addProperty("name", weekly ? "Graj 300 min w tym tygodniu" : "Graj 30 min");
		c.addProperty("nameEn", weekly ? "Play for 300 min this week" : "Play for 30 min");
		c.addProperty("sparks", weekly ? 100 : 15);
		com.google.gson.JsonObject e = new com.google.gson.JsonObject();
		e.addProperty("type", "challenge");
		e.add("challenge", c);
		dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
	}

	/** All of a day's challenges done: the server's 'challenges-bonus' event. */
	public static void challengesBonusToast(int sparks) throws Exception {
		com.google.gson.JsonObject e = new com.google.gson.JsonObject();
		e.addProperty("type", "challenges-bonus");
		e.addProperty("period", "daily");
		e.addProperty("sparks", sparks);
		dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
	}

	/** Several achievements at once: the server's 'achievements-summary' event. */
	public static void achievementsSummaryToast(int count, int sparks) throws Exception {
		com.google.gson.JsonObject e = new com.google.gson.JsonObject();
		e.addProperty("type", "achievements-summary");
		e.addProperty("count", count);
		e.addProperty("sparks", sparks);
		dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
	}

	/** Scrolls the open cosmetics menu's grid to its end. */
	public static void scrollCosmetics() {
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.scrollBy(10_000);
	}

	/** The open cosmetics menu's grid scrolled by this many GUI pixels (negative: up). */
	public static void scrollCosmeticsBy(int pixels) {
		if (Compat.screen(net.minecraft.client.Minecraft.getInstance()) instanceof CosmeticsScreen c) c.scrollBy(pixels);
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

	/**
	 * The dungeon loot highlight on (through walls or not; a distance limit, or -1 for none) or
	 * off, made at once: how many boxes, and per kind of DungeonRooms.LOOT ("6 [2, 1, 1, 1, 1]").
	 */
	public static String lootHighlight(boolean on, boolean walls, int range) {
		HudConfig c = SlashHud.config;
		c.lootHighlight = on;
		c.lootHighlightWalls = walls;
		c.lootHighlightLimit = range > 0;
		if (range > 0) c.lootHighlightRange = range;
		LootHighlight.tick(net.minecraft.client.Minecraft.getInstance());
		int[] kinds = new int[LootHighlight.KINDS];
		for (var b : LootHighlight.boxes()) kinds[b.cat()]++;
		// the drops glow instead of a box: counted as their kind
		kinds[LootHighlight.DROP] = LootHighlight.glowing().size();
		return (LootHighlight.boxes().size() + LootHighlight.glowing().size()) + " " + java.util.Arrays.toString(kinds);
	}

	/** The colours the glowing drops have now, sorted ("4deeea f1ead8"), and whether the game draws them glowing. */
	public static String lootGlow() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		StringBuilder out = new StringBuilder();
		LootHighlight.glowing().values().stream().sorted().forEach((c) -> out.append(String.format("%06x ", c)));
		boolean drawn = LootHighlight.glowing().keySet().stream().allMatch((id) -> {
			var e = mc.level.getEntity(id);
			return e != null && mc.shouldEntityAppearGlowing(e) && e.getTeamColor() == LootHighlight.glowColor(e);
		});
		return out.toString().trim() + (drawn ? " drawn" : " not-drawn");
	}

	/** The glow colour a server item named in a colour gets (the name's colour). */
	public static int lootNameColor() {
		return LootHighlight.dropColor(new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.COBBLESTONE)
			.copy(), 0xFFFFFF) == 0xC084FC
			? LootHighlight.nameColor(net.minecraft.network.chat.Component.literal("Mistyczna ruda").withStyle(net.minecraft.ChatFormatting.LIGHT_PURPLE))
			: -2;
	}

	/** The widest loot box now (blocks along x or z): a double chest is one box two blocks long. */
	public static double lootWidest() {
		double w = 0;
		for (var b : LootHighlight.boxes()) w = Math.max(w, Math.max(b.x1() - b.x0(), b.z1() - b.z0()));
		return w;
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

	/** The name the Target module shows for the mob under the crosshair. */
	public static String shownTargetName() {
		return MoreModules.Target.shownName(net.minecraft.client.Minecraft.getInstance());
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

	/** Our own emote playing now ("" for none). */
	public static String emotePlaying() {
		var p = Cosmetics.playing(net.minecraft.client.Minecraft.getInstance().player.getUUID());
		return p == null ? "" : p.emote();
	}

	/** Our own emote as the wheel sends it (shown, the camera turned; the launcher is not there in the test). */
	public static void emoteSend(String emote) {
		Cosmetics.send(net.minecraft.client.Minecraft.getInstance(), emote);
	}

	/** Our own player turned to that yaw (body and head), as if they turned round. */
	public static void turnSelf(float yaw) {
		var p = net.minecraft.client.Minecraft.getInstance().player;
		p.setYRot(yaw);
		p.setYHeadRot(yaw);
		p.setYBodyRot(yaw);
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

	/** A tab's typing line in its window and its reply prefix. */
	public static void chatTabTyping(String name, boolean input, String prefix) {
		for (var tab : SlashHud.config.chatTabs) if (tab.name.equals(name)) {
			tab.input = input;
			tab.replyPrefix = prefix;
		}
	}

	/** Makes a docked tab the open one in the chat ("" = "All"). */
	public static void selectChatTab(String name) {
		int index = -1;
		for (int i = 0; i < SlashHud.config.chatTabs.size(); i++) if (SlashHud.config.chatTabs.get(i).name.equals(name)) index = i;
		ChatTabs.select(index);
	}

	/** Outgoing chat and commands kept for the test instead of being sent (off = they go again). */
	public static void captureOutgoing(boolean on) {
		ChatTabInput.captured = on ? new java.util.ArrayList<>() : null;
	}

	/** What was kept, one per line ("chat:…", "command:/…"), and the list emptied. */
	public static String takeOutgoing() {
		if (ChatTabInput.captured == null) return "";
		String out = String.join("\n", ChatTabInput.captured);
		ChatTabInput.captured.clear();
		return out;
	}

	public static double[] chatFieldCenter(String name) {
		return ChatTabInput.fieldCenter(name);
	}

	public static String chatFocus() {
		return ChatTabInput.focus();
	}

	public static String chatFieldValue(String name) {
		return ChatTabInput.fieldValue(name);
	}

	public static void chatFieldClear(String name) {
		var screen = screen();
		if (screen != null) for (var child : screen.children()) if (child instanceof ChatTabInput.Field f && f.tab.name.equals(name)) f.setValue("");
	}

	/** Where the chat's own line starts (it moves over for the open tab's prefix); -1 without the chat. */
	public static int chatInputX() {
		var screen = screen();
		var in = screen == null ? null : ChatTabInput.mainInput(screen);
		return in == null ? -1 : in.getX();
	}

	/** Whether the chat is open. */
	public static boolean chatOpen() {
		return screen() instanceof net.minecraft.client.gui.screens.ChatScreen;
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
	/** Block info's extra lines for the block looked at, with all of them switched on. */
	/** As if the player were digging `pos` this far (or stopped, with a negative `progress`); what block info then reads. */
	public static float digging(int x, int y, int z, float progress) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var dig = (dev.slash3rss.slashclient.hud.mixin.DestroyProgressAccessor) mc.gameMode;
		var pos = new net.minecraft.core.BlockPos(x, y, z);
		dig.slashclient$setDestroying(progress >= 0);
		dig.slashclient$setPos(pos);
		dig.slashclient$setProgress(Math.max(0, progress));
		return ExtraModules.BlockInfo.breaking(mc, pos);
	}

	/** What block info reads for that block: how far it is broken (-1: not being dug). */
	public static float breakingAt(int x, int y, int z) {
		return ExtraModules.BlockInfo.breaking(net.minecraft.client.Minecraft.getInstance(), new net.minecraft.core.BlockPos(x, y, z));
	}

	public static String blockInfoLines() {
		HudConfig c = SlashHud.config;
		c.blockGrowth = c.blockDetails = c.blockPower = c.blockCoords = c.blockLight = c.blockHardness = c.blockId = c.blockState = true;
		c.blockTool = c.blockBees = c.blockShelf = c.blockFrames = true;
		c.placement("block").enabled = true;
		return ExtraModules.BlockInfo.linesForTest(net.minecraft.client.Minecraft.getInstance());
	}

	/** A tab's mention sound ("" = the usual bell). */
	public static void chatTabSound(String name, String sound) {
		for (HudConfig.ChatTab t : SlashHud.config.chatTabs) if (t.name.equals(name)) t.sound = sound;
	}

	/** The mention sound last played after `line` came in ("" = the bell, "none" = silent), or "-" when none rang. */
	public static String mentionSoundFor(String line) {
		ChatTabs.lastSound = "-";
		ChatTabs.lastChimeForTest(0);
		ChatTabs.onMessage(line);
		return ChatTabs.lastSound;
	}

	/** A point on a pulled-out window's title, left of its × (GUI coordinates). */
	public static double[] chatWindowTitle(String name) {
		var w = net.minecraft.client.Minecraft.getInstance().getWindow();
		for (HudConfig.ChatTab t : SlashHud.config.chatTabs) if (t.name.equals(name) && t.window != null) {
			int[] p = ChatWindows.at(t, w.getGuiScaledWidth(), w.getGuiScaledHeight());
			return new double[] { p[0] + 30, p[1] + 4 };
		}
		return null;
	}

	/** A window's state: folded or not, its height (GUI pixels) and how far it is scrolled back. */
	public static String chatWindowState(String name) {
		for (HudConfig.ChatTab t : SlashHud.config.chatTabs) if (t.name.equals(name) && t.window != null)
			return (t.collapsed ? "folded " : "open ") + ChatWindows.inner(t) + " " + ChatWindows.scrolledForTest(name);
		return "none";
	}

	/** What a right click at this point (GUI coordinates) would copy from the chat or a chat window. */
	public static String copyAt(double[] at) {
		return ChatExtras.copyAt(at[0], at[1]);
	}

	/** A point (GUI coordinates) over text with a click action in an open chat window, or null. */
	public static double[] chatWindowClickable() {
		var w = net.minecraft.client.Minecraft.getInstance().getWindow();
		for (int y = 0; y < w.getGuiScaledHeight(); y += 2) for (int x = 0; x < w.getGuiScaledWidth(); x += 2) {
			var style = ChatWindows.styleAt(x, y);
			if (style != null && style.getClickEvent() != null) return new double[] { x + 1, y + 1 };
		}
		return null;
	}

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

	/** The middle of a settings card as the window's pixels (for TestInput.setCursorPos); null if not drawn. */
	public static double[] cardCenter(String id) {
		int[] r = HudEditScreen.CARDS.get(id);
		if (r == null) return null;
		double s = net.minecraft.client.Minecraft.getInstance().getWindow().getGuiScale();
		return new double[] { (r[0] + r[2] / 2.0) * s, (r[1] + r[3] / 2.0) * s };
	}

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
	//#if MC >= 26.3
	/** For the test: SkyUp's task progress saved to the account's file and read back. */
	public static String skyTasksStaleRows() {
		return SkyTasks.staleRowsForTest(net.minecraft.client.Minecraft.getInstance());
	}

	public static String skyTasksReload() {
		return SkyTasks.reloadForTest();
	}
	//#endif

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
		// SkyUp's no-break space inside a name ("Stojak na zbroję"): the iron's counted all the same
		String iron = "Sztabka żelaza", stone = "Kamień", torch = "Pochodnia", chestName = "Skrzynia";
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
		// handed in already, as admins still see it: a slate frame, no task
		chest.setItem(12, task(net.minecraft.world.item.Items.OAK_SAPLING, "Pierwsze drzewo", "", "• Zadanie ukończone!", "", "Podgląd admina:", "Opis » Posadź drzewo.", "",
			"Za ukończenie otrzymasz:", "» 50.0 SC"));
		// the info item and the way back: no tasks
		chest.setItem(13, task(net.minecraft.world.item.Items.OAK_SIGN, "Informacje", "Wyzwania to kluczowy element", "  gry na Skyblocku!"));
		chest.setItem(22, task(net.minecraft.world.item.Items.PLAYER_HEAD, "Wróć", "LPM » Wróć"));
		var menu = net.minecraft.world.inventory.ChestMenu.threeRows(1000, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), net.minecraft.network.chat.Component.literal("\ue001\ue151\ue002Wyzwania » Nowicjusz")));
	}

	/** The daily task's reminder: untracked, then tracked (and untracked again after); "none" without the task. */
	public static String skyDaily() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SkyTaskParser.Task daily = null;
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) if (t.name.contains("Zadanie codzienne")) daily = t;
		if (daily == null) return "none";
		var before = SkyTasks.dailyReminder(mc);
		boolean was = SkyTasks.tracked(daily);
		if (!was) SkyTasks.toggle(daily);
		var after = SkyTasks.dailyReminder(mc);
		if (!was) SkyTasks.toggle(daily);
		return (before == null ? "null" : before.getString()) + " | " + (after == null ? "null" : after.getString());
	}

	/** A generator's window as SkyUp sends it (the owner's dump): the points read as spent in it. */
	public static int skyGeneratorSpent(int timeLevel, int coalLevel) {
		java.util.List<net.minecraft.world.item.ItemStack> items = new java.util.ArrayList<>();
		for (int i = 0; i < 54; i++) items.add(net.minecraft.world.item.ItemStack.EMPTY);
		items.set(1, task(net.minecraft.world.item.Items.PAPER, "Punkty ulepszeń", "▪ Dostępne punkty ulepszeń » 26 pkt", "▪ Wykopane bloki » 1 749 bloków"));
		items.set(9, task(net.minecraft.world.item.Items.CLOCK, "Czas regeneracji", "▪ Czas regeneracji » 2s"));
		items.set(10, task(net.minecraft.world.item.Items.PAPER, "Postęp", "▪ Poziom » " + timeLevel + " / 10"));
		items.set(11, task(net.minecraft.world.item.Items.PAPER, "Postęp", "▪ Poziom » " + timeLevel + " / 10"));
		items.set(12, task(net.minecraft.world.item.Items.PAPER, "Ulepsz", "▪ Koszty ulepszenia:", "  » ✔ 1 pkt"));
		items.set(18, task(net.minecraft.world.item.Items.COAL, "Węgiel", "▪ Szansa na drop » 0,3%"));
		items.set(19, task(net.minecraft.world.item.Items.PAPER, "Postęp", "▪ Poziom » " + coalLevel + " / 10"));
		items.set(20, task(net.minecraft.world.item.Items.PAPER, "Postęp", "▪ Poziom » " + coalLevel + " / 10"));
		items.set(23, task(net.minecraft.world.item.Items.RAW_IRON, "Ruda żelaza", "▪ Szansa na drop » 0,2%"));
		items.set(24, task(net.minecraft.world.item.Items.PAPER, "Postęp", "▪ Poziom » 1 / 10"));
		items.set(25, task(net.minecraft.world.item.Items.PAPER, "Postęp", "▪ Poziom » 1 / 10"));
		return SkyGenerator.read(items);
	}

	/**
	 * An incubator's window as SkyUp sends it (the owner's dump: cocoa in its cost, so the sugar cane one,
	 * at level 5) seen, then what tasks' requirements read: the cane's and the cactus' levels, and kinds named.
	 */
	public static String skyIncubator() {
		java.util.List<net.minecraft.world.item.ItemStack> items = new java.util.ArrayList<>();
		for (int i = 0; i < 45; i++) items.add(net.minecraft.world.item.ItemStack.EMPTY);
		items.set(8, task(net.minecraft.world.item.Items.PAPER, "Ulepsz", "▪ Koszt ulepszenia:", "» Ziarna kakaowe: 240/240", "» Tropikalny pień: 180/180", "» Szmaragd: 2/2",
			"» Koszt: 3 750 SC", "▪ Następny poziom » 22,15/min (+3,69/min)"));
		for (int i = 9; i < 15; i++) items.set(i, task(net.minecraft.world.item.Items.GLASS_PANE, "Status", "▪ Przyspieszenie » x5/x500",
			"▪ Prędkość inkubacji » 18,46/min (0,92/3s)", "▪ Stan magazynu » 1", "▪ Pojemność magazynu » 2 225"));
		SkyIncubator.seen(items);
		return SkyIncubator.level("Inkubator trzciny") + " " + SkyIncubator.level("Inkubator kaktusów") + " " + SkyIncubator.kind("Inkubator dyń")
			+ " " + SkyIncubator.kind("Inkubator wodorostów") + " " + SkyIncubator.kind("Inkubator kakao");
	}

	/**
	 * Shamanism: a task "Przyzwij: Wiedźma 0/1" tracked, the HUD's rows under it (the recipe), then a
	 * summon (SkyUp's line after a click on a campfire) and the requirement's count.
	 */
	/** A task with the newly counted kinds (a bell, a sheep, the level, a case by hand), on the HUD's list. */
	public static void skyMoreTasks() {
		SkyTaskParser.Task t = SkyTaskParser.parse("Zaawansowany", "» Wszystko naraz «", java.util.List.of("Opis » Test.", "",
			"Uderz w dzwony:", "  » Uderz w dzwony: 0/5", "",
			"Ostrzyż:", "  » Owca: 0/32", "",
			"Otwórz SkyCase:", "  » Ręcznie: 0/8", "",
			"Posiadaj poziom: 60", "  poz.", "",
			"Za ukończenie otrzymasz:", "  » 100.0 SC"));
		t.seen = System.currentTimeMillis();
		SkyTasks.data().tasks.put(t.key(), t);
	}

	/** That task's requirements as counted now: "header=count" each. */
	public static String skyMoreProgress() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		StringBuilder out = new StringBuilder();
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) {
			if (!t.name.equals("Wszystko naraz")) continue;
			for (SkyTaskParser.Section s : t.sections) for (SkyTaskParser.Req r : s.items) out.append(s.header).append('=').append(SkyTasks.current(mc, s, r)).append(' ');
		}
		return out.toString().strip();
	}

	/** A right click as the game makes it, on what is under the crosshair now (a bell, a sheep, a chest). */
	public static void skyUse() {
		((dev.slash3rss.slashclient.hud.mixin.MinecraftAccessor) net.minecraft.client.Minecraft.getInstance()).slashclient$startUseItem();
	}

	/** Only what the HUD sees of a right click, the server doing nothing (as on a protected plot). */
	public static void skyUseRefused() {
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.used(net.minecraft.client.Minecraft.getInstance());
	}

	public static String skyShaman() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SkyTaskParser.Task t = SkyTaskParser.parse("Wtajemniczony", "» Szamaństwo «", java.util.List.of("Opis » Przyzwij wiedźmę.", "", "Przyzwij:", "  » Wiedźma: 0/1", "",
			"Za ukończenie otrzymasz:", "  » 100.0 SC"));
		t.seen = System.currentTimeMillis();
		SkyTasks.data().tasks.put(t.key(), t);
		if (!SkyTasks.tracked(t)) SkyTasks.toggle(t);
		int max = SlashHud.config.skyTasksMax;
		SlashHud.config.skyTasksMax = 10;
		String rows = SkyTasks.debugRows(mc);
		// the rotten flesh carried: still on the list, marked as there
		var inv = mc.player.getInventory();
		var kept = inv.getItem(20);
		inv.setItem(20, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.ROTTEN_FLESH, 20));
		rows += "\n--- carried\n" + SkyTasks.debugRows(mc);
		inv.setItem(20, kept);
		SlashHud.config.skyTasksMax = max;
		SkyShaman.pendingForTest("Wiedźma");
		SkyCounters.onChat(net.minecraft.network.chat.Component.literal("Szamaństwo » To… to… TO ŻYJE!!!"));
		long now = t.sections.get(0).items.get(0).current + t.sections.get(0).items.get(0).extra;
		SkyTasks.toggle(t);
		SkyTasks.data().tasks.remove(t.key());
		return rows + "\ncount " + now;
	}

	/** The daily reminder's sound set so, as it is played ("" the bell); the setting put back after. */
	public static String skyDailySound(String set) {
		String keep = SlashHud.config.skyDailySound;
		SlashHud.config.skyDailySound = set;
		String out = SkyTasks.dailySound();
		SlashHud.config.skyDailySound = keep;
		return out;
	}

	/** The HUD's rows with the daily task tracked for a moment ("none" without the task). */
	public static String skyDailyOnTop() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		SkyTaskParser.Task daily = null;
		for (SkyTaskParser.Task t : SkyTasks.data().tasks.values()) if (SkyTasks.daily(t)) daily = t;
		if (daily == null) return "none";
		boolean was = SkyTasks.tracked(daily);
		if (!was) SkyTasks.toggle(daily);
		String rows = SkyTasks.debugRows(mc);
		if (!was) SkyTasks.toggle(daily);
		return rows;
	}

	/** SkyUp's challenges menu ("Wyzwania"): the Nowicjusz category with `left` tasks left, and the daily task. */
	public static void skyMenuScreen(int left) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		var chest = new net.minecraft.world.SimpleContainer(27);
		chest.setItem(10, task(net.minecraft.world.item.Items.BEETROOT, "Zadanie codzienne", "Ukończone zadania dzienne » 0", "Kategoria » Wirtuoz", "",
			"Zbierz:", "» Buraki: 0/3 888", "", "Za ukończenie otrzymasz:", "» 20000.0 SC", "", "LPM \ue510 » Ukończ wyzwanie"));
		// none left: as SkyUp shows a category done
		chest.setItem(12, left == 0
			? task(net.minecraft.world.item.Items.EMERALD_BLOCK, "Nowicjusz", "Kategoria ukończona!", "Wszystkie zadania ukończone!", "Na tym poziomie » 181", "Ukończyli » 151")
			: task(net.minecraft.world.item.Items.EMERALD, "Nowicjusz", "Pozostałe zadania » " + left, "", "Na tym poziomie » 969", "Ukończyli » 458", "",
			"Na tym poziomie otrzymasz m.in:", "» grzybnię", "", "LPM \ue510 » Sprawdź wyzwania"));
		chest.setItem(14, task(net.minecraft.world.item.Items.DIAMOND, "Wirtuoz", "Pozostałe zadania » 16", "", "Za ukończenie poziomu otrzymasz:", "» 500 SP", "", "LPM \ue510 » Sprawdź wyzwania"));
		var menu = net.minecraft.world.inventory.ChestMenu.threeRows(1001, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), net.minecraft.network.chat.Component.literal("\ue003\ue150\ue002Wyzwania")));
	}

	/** As if the player broke three stone blocks and crafted four torches (what the game's hooks report). */
	public static void skyEvents() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		for (int i = 0; i < 3; i++) SkyCounters.broken(mc.player, net.minecraft.world.level.block.Blocks.STONE.defaultBlockState());
		// a shift-click: the game foresees the first four torches, the server sends eight more a moment later
		var inv = mc.player.getInventory();
		inv.setItem(20, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.TORCH, 4));
		SkyCounters.crafted(mc.player, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.TORCH, 4), 4);
		inv.setItem(20, new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.TORCH, 12));
		// two torches placed, one of them broken and placed again on its spot within three minutes: two
		var wall = (net.minecraft.world.item.BlockItem) net.minecraft.world.item.Items.TORCH;
		var spot = mc.player.blockPosition();
		SkyCounters.placed(mc.player, wall, spot);
		SkyCounters.placed(mc.player, wall, spot);
		SkyCounters.placed(mc.player, wall, spot.east());
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

	public static String skyFishAfterPause() {
		return SkyFish.afterPauseForTest();
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

	/** The slots of the open challenges GUI lit as ready to hand in on the last frame: "4,7,11". */
	public static String skyHandedIn() {
		return SkyTasks.handedInSlots.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
	}

	public static String skyHighlighted() {
		return SkyTasks.highlighted.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
	}

	/** For the test: "(/recipe)" in a task's text, on the header or after it, is neither a requirement nor part of the header. */
	public static String skyCommandHint() {
		StringBuilder out = new StringBuilder();
		for (var lore : java.util.List.of(
				java.util.List.of("Opis » Stwórz stojak.", "Stwórz (/recipe):", "  » Stojak na zbroję: 3/12", "Za ukończenie otrzymasz:", "» 200.0 SC"),
				java.util.List.of("Opis » Stwórz stojak.", "Stwórz: (/recipe)", "  » Stojak na zbroję: 3/12", "Za ukończenie otrzymasz:", "» 200.0 SC"))) {
			SkyTaskParser.Task t = SkyTaskParser.parse("ZBROJOWNIA", "» Stojak «", lore);
			for (SkyTaskParser.Section s : t.sections) {
				out.append(s.header).append('[');
				for (SkyTaskParser.Req r : s.items) out.append(r.thing).append(' ').append(r.current).append('/').append(r.required).append(';');
				out.append("] ");
			}
		}
		return out.toString().strip();
	}

	/** For the test: "Dowolny blok" (any block placed, "Mało miejsca dla kolegów") takes stone and planks, "Dowolne drewno" only logs. */
	public static String skyAnyBlock() {
		var stone = dev.slash3rss.slashclient.hud.skyup.SkyCounters.Thing.of(false, false, false, false, "Kamień");
		var log = dev.slash3rss.slashclient.hud.skyup.SkyCounters.Thing.of(false, true, false, false, "Dębowy pień");
		var brownEgg = dev.slash3rss.slashclient.hud.skyup.SkyCounters.Thing.of(false, false, false, false, "Brązowe jajko");
		var sherd = dev.slash3rss.slashclient.hud.skyup.SkyCounters.Thing.of(false, false, false, false, "Odłamek ceramiki z łucznikiem");
		return dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolny blok", stone) + " " + dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolny blok", log)
			+ " " + dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolne drewno", stone) + " " + dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolne drewno", log)
			+ " " + dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolne jajko", brownEgg) + " " + dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolny odłamek ceramiki", sherd)
			+ " " + dev.slash3rss.slashclient.hud.skyup.SkyCounters.matches("Dowolne jajko", stone);
	}

	/**
	 * For the test: the jobs' levels from the jobs' window (two heads, and a head with a number that is no
	 * job), then from a job's boss bar; and a task needing another, before and after that one is handed in.
	 */
	public static String skyJobsAndNeeds() {
		var d = dev.slash3rss.slashclient.hud.skyup.SkyTasks.data();
		java.util.function.BiFunction<String, String, net.minecraft.world.item.ItemStack> head = (name, line) -> {
			var s = new net.minecraft.world.item.ItemStack(net.minecraft.world.item.Items.PLAYER_HEAD);
			s.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME, net.minecraft.network.chat.Component.literal(name));
			s.set(net.minecraft.core.component.DataComponents.LORE, new net.minecraft.world.item.component.ItemLore(java.util.List.of(net.minecraft.network.chat.Component.literal(line))));
			return s;
		};
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.jobsSeen(java.util.List.of(head.apply("» Górnik (7) «", "▪ Postęp poziomu » 14%"),
			head.apply("» Drwal (9) «", "▪ Postęp poziomu » 22%"), head.apply("» Ranking (3) «", "▪ LPM » Sprawdź")));
		String window = d.jobs.get("Górnik") + " " + d.jobs.get("Drwal") + " " + d.jobs.containsKey("Ranking");
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.jobBar("Drwal (poziom 10) 1 504,02/7 000 xp (+15,3 xp)");
		var task = SkyTaskParser.parse("WTAJEMNICZONY", "» Kryptomaniak «", java.util.List.of("▪ Wymaga ukończenia wyzwania Zmory", "  podziemi", "▪ Dotrzyj do poziomu w dungeonach: 10", "  poz.", "▪ Za ukończenie otrzymasz:", "  » 200.0 SC"));
		boolean before = dev.slash3rss.slashclient.hud.skyup.SkyTasks.requirementDone(task);
		dev.slash3rss.slashclient.hud.skyup.SkyTasks.onChat(net.minecraft.network.chat.Component.literal("Wyzwania » Ukończono zadanie Zmory podziemi!"));
		// one done long before the mod watched: its category shows it as "Zadanie ukończone!"
		var older = SkyTaskParser.parse("WTAJEMNICZONY", "» Ranczo «", java.util.List.of("▪ Wymaga ukończenia wyzwania Szamaństwo", "▪ Przyzwij: 1", "▪ Za ukończenie otrzymasz:", "  » 200.0 SC"));
		boolean unread = dev.slash3rss.slashclient.hud.skyup.SkyTasks.requirementDone(older);
		dev.slash3rss.slashclient.hud.skyup.SkyTasks.doneShownForTest(java.util.List.of(head.apply("» Szamaństwo «", "▪ Zadanie ukończone!"), head.apply("» Kuźnia «", "▪ Stój obok:")));
		return window + " | bar " + d.jobs.get("Drwal") + " | needs '" + task.requires + "' " + before + " -> " + dev.slash3rss.slashclient.hud.skyup.SkyTasks.requirementDone(task)
			+ " | long ago '" + older.requires + "' " + unread + " -> " + dev.slash3rss.slashclient.hud.skyup.SkyTasks.requirementDone(older)
			+ " " + dev.slash3rss.slashclient.hud.skyup.SkyTasks.doneNames();
	}

	/** For the test: "Dotrzyj do poziomu w dungeonach: 10 poz." before any dungeon, and after level 7 was on the boss bar. */
	public static String skyDungeonLevel() {
		var task = SkyTaskParser.parse("WTAJEMNICZONY", "» Kryptomaniak «", java.util.List.of("▪ Opis » Zawalcz w Dungeonach!", "▪ Dotrzyj do poziomu w dungeonach: 10", "  poz.", "▪ Za ukończenie otrzymasz:", "  » 200.0 SC"));
		var s = task.sections.get(0);
		var r = s.items.get(0);
		var mc = net.minecraft.client.Minecraft.getInstance();
		long before = dev.slash3rss.slashclient.hud.skyup.SkyTasks.current(mc, s, r);
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.dungeonLevel(7);
		dev.slash3rss.slashclient.hud.skyup.SkyCounters.dungeonLevel(3);
		return before + " " + dev.slash3rss.slashclient.hud.skyup.SkyTasks.current(mc, s, r) + "/" + r.required;
	}

	/** For the test: a task the GUI still shows as handed in (admins' preview) is no task. */
	public static boolean skyCompletedIsNoTask() {
		return SkyTaskParser.parse("NOWICJUSZ", "» Ciasno, ale własno «", java.util.List.of("", "• Zadanie ukończone!", "", "Podgląd admina:", "Opis » Zwiększ poziom wyspy.", "Posiadaj poziom wyspy: 20 poz.", "Za ukończenie otrzymasz:", "» 200.0 SC")) == null
			&& SkyTaskParser.parse("NOWICJUSZ", "» Ciasno, ale własno «", java.util.List.of("Posiadaj poziom wyspy: 20 poz.", "Za ukończenie otrzymasz:", "» 200.0 SC")) != null;
	}

	/** A plain line in the chat. */
	public static void skyChat(String line) {
		Compat.chat(net.minecraft.client.Minecraft.getInstance()).addClientSystemMessage(net.minecraft.network.chat.Component.literal(line));
	}

	/** SkyUp's line in the chat after handing a task in, with its colours and private glyphs. */
	public static void skyCompletedChat(String name) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal(" ").append(net.minecraft.network.chat.Component.literal("Wyzwania » ").withStyle(net.minecraft.ChatFormatting.LIGHT_PURPLE))
			.append(net.minecraft.network.chat.Component.literal("Ukończono zadanie ").withStyle(net.minecraft.ChatFormatting.GRAY))
			.append(net.minecraft.network.chat.Component.literal(name).withStyle(net.minecraft.ChatFormatting.GOLD, net.minecraft.ChatFormatting.BOLD))
			.append(net.minecraft.network.chat.Component.literal("!").withStyle(net.minecraft.ChatFormatting.GRAY)));
	}

	/** The categories tracked from the menu, and whether the HUD module shows at all: "Nowicjusz,Wirtuoz visible true". */
	public static String skyCategoryState() {
		return String.join(",", SkyTasks.headerTiers()) + " visible " + new SkyTasks.Module().visible(net.minecraft.client.Minecraft.getInstance());
	}

	public static void skyTasksOptions(boolean rewards, boolean compact) {
		SlashHud.config.skyTasksRewards = rewards;
		SlashHud.config.skyTasksCompact = compact;
	}
	//#endif

	/** The hit marker on or off in a look, a second long (long enough for a screenshot), with a kill colour and the sound; what showed is forgotten. */
	public static void hitMarker(boolean on, String style) {
		HudConfig c = SlashHud.config;
		c.hitMarker = on;
		c.hitMarkerStyle = style;
		c.hitMarkerSize = 5;
		c.hitMarkerDuration = 1000;
		c.hitMarkerColor = 0xFFFFFFFF;
		c.hitMarkerKill = true;
		c.hitMarkerKillColor = 0xFFF87171;
		c.hitMarkerProjectiles = true;
		c.hitMarkerSound = true;
		HitMarker.reset();
	}

	/** What the hit marker shows now: "hit", "kill" or "". */
	public static String hitMarkerState() {
		return HitMarker.state();
	}

	/** Hiding our own armour on or off, and which pieces. */
	public static void hideOwnArmor(boolean on, boolean helmet, boolean chestplate, boolean leggings, boolean boots, boolean elytra) {
		HudConfig c = SlashHud.config;
		c.hideOwnArmor = on;
		c.hideOwnHelmet = helmet;
		c.hideOwnChestplate = chestplate;
		c.hideOwnLeggings = leggings;
		c.hideOwnBoots = boots;
		c.hideOwnElytra = elytra;
	}

	/**
	 * The armour a render state gets, as it is drawn: "head,chest,legs,feet" (item ids, "-" for
	 * none), for our own player or the nearest other humanoid (a zombie standing in for other players).
	 */
	public static String armorState(boolean own) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		net.minecraft.world.entity.LivingEntity e = own ? mc.player : null;
		if (!own) for (var other : mc.level.entitiesForRendering()) {
			if (net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(other.getType()).getPath().equals("zombie") && other instanceof net.minecraft.world.entity.LivingEntity z
				&& (e == null || z.distanceTo(mc.player) < e.distanceTo(mc.player))) e = z;
		}
		if (e == null) return "none";
		Object state = mc.getEntityRenderDispatcher().getRenderer(e).createRenderState(e, 0f);
		if (!(state instanceof net.minecraft.client.renderer.entity.state.HumanoidRenderState h)) return "?";
		return String.join(",", armorName(h.headEquipment), armorName(h.chestEquipment), armorName(h.legsEquipment), armorName(h.feetEquipment));
	}

	private static String armorName(net.minecraft.world.item.ItemStack s) {
		return s.isEmpty() ? "-" : net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem()).getPath();
	}
}
//#endif
