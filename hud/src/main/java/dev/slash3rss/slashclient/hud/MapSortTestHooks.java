// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import dev.slash3rss.slashclient.hud.social.FriendPositions;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Sorting, friends on the minimap and the full map for the in-game tests (src/gametest
 * GameInventorySort, GameWorldMap).
 */
public final class MapSortTestHooks {
	private MapSortTestHooks() {}

	// ---------- sorting ----------

	public static void sortSettings(boolean on, int delay, boolean hotbar, String offServers) {
		HudConfig c = SlashHud.config;
		c.inventorySort = on;
		c.sortDelay = delay;
		c.sortHotbar = hotbar;
		c.sortButton = true;
		c.sortOffServers = offServers;
	}

	public static boolean blockedOn(String address, String list) {
		return InventorySort.blockedOn(address, list);
	}

	/** Opens the chest (or barrel…) at a place, as a right click on its top would. */
	public static void use(int x, int y, int z) {
		Minecraft mc = Minecraft.getInstance();
		BlockPos pos = new BlockPos(x, y, z);
		mc.gameMode.useItemOn(mc.player, InteractionHand.MAIN_HAND, new BlockHitResult(Vec3.atCenterOf(pos).add(0, 0.5, 0), Direction.UP, pos, false));
	}

	/** Starts sorting the open window's chest part or the player's part, as the key would; how it went. */
	public static String sort(boolean player) {
		Minecraft mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return "no window";
		InventorySort.start(mc, screen, player);
		return InventorySort.last;
	}

	public static boolean sorting() {
		return InventorySort.running();
	}

	public static String lastSort() {
		return InventorySort.last;
	}

	/** Where the sort button of a part of the open window is, in window pixels (its middle). */
	public static int[] sortButton(boolean player) {
		Minecraft mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return new int[] { 0, 0 };
		ContainerScreenAccessor a = (ContainerScreenAccessor) screen;
		int x = a.slashclient$leftPos() + a.slashclient$imageWidth() - 7 - 5;
		int y = player ? a.slashclient$topPos() + a.slashclient$imageHeight() - 96 + 5 : a.slashclient$topPos() + 4 + 5;
		double scale = mc.getWindow().getGuiScale();
		return new int[] { (int) (x * scale), (int) (y * scale) };
	}

	/** The middle of an arrow next to the sort buttons (window pixels): into the chest by "Inventory", out of it by its title. */
	public static int[] moveButton(boolean intoChest) {
		Minecraft mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return new int[] { 0, 0 };
		ContainerScreenAccessor a = (ContainerScreenAccessor) screen;
		int x = a.slashclient$leftPos() + a.slashclient$imageWidth() - 7 - 10 - (SlashHud.config.sortButton ? 12 : 0) + 5;
		int y = intoChest ? a.slashclient$topPos() + a.slashclient$imageHeight() - 96 + 5 : a.slashclient$topPos() + 4 + 5;
		double scale = mc.getWindow().getGuiScale();
		return new int[] { (int) (x * scale), (int) (y * scale) };
	}

	private static String describe(ItemStack s) {
		return s.isEmpty() ? "-" : net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem()).getPath() + " x" + s.getCount();
	}

	/** The open window's chest part, slot by slot ("dirt x64,-,…"). */
	/** The top edge of a slot of the open window's chest part, in window pixels (its tooltip rises above the window). */
	public static int[] chestSlotTop(int index) {
		Minecraft mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return new int[] { 0, 0 };
		ContainerScreenAccessor a = (ContainerScreenAccessor) screen;
		Slot s = screen.getMenu().slots.get(index);
		double scale = mc.getWindow().getGuiScale();
		return new int[] { (int) ((a.slashclient$leftPos() + s.x + 8) * scale), (int) ((a.slashclient$topPos() + s.y) * scale) };
	}

	public static String chest() {
		Minecraft mc = Minecraft.getInstance();
		if (!(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return "";
		StringBuilder out = new StringBuilder();
		for (Slot s : screen.getMenu().slots) if (!(s.container instanceof Inventory)) out.append(describe(s.getItem())).append(',');
		return out.toString();
	}

	/** The player's inventory: slots `from` to `to` (0–8 the hotbar, 9–35 the backpack). */
	public static String inventory(int from, int to) {
		Minecraft mc = Minecraft.getInstance();
		StringBuilder out = new StringBuilder();
		for (int i = from; i <= to; i++) out.append(describe(mc.player.getInventory().getItem(i))).append(',');
		return out.toString();
	}

	/** Closes the open window as Escape would (the server hears it). */
	public static void closeWindow() {
		Minecraft mc = Minecraft.getInstance();
		if (mc.player != null) mc.player.closeContainer();
	}

	public static boolean carrying() {
		Minecraft mc = Minecraft.getInstance();
		return Compat.screen(mc) instanceof AbstractContainerScreen<?> screen && !screen.getMenu().getCarried().isEmpty();
	}

	// ---------- friends on the minimap ----------

	public static void friend(String id, String name, String dimension, double x, double y, double z) {
		FriendPositions.sampleForTest(id, name, "test.slashclient.dev", dimension, x, y, z, 0f);
	}

	public static void friendGone(String id) {
		com.google.gson.JsonObject e = new com.google.gson.JsonObject();
		e.addProperty("type", "friend-position");
		e.addProperty("from", id);
		e.addProperty("gone", true);
		try {
			dev.slash3rss.slashclient.hud.social.Social.eventForTest(e);
		} catch (Exception ex) {
			throw new IllegalStateException(ex);
		}
	}

	/** The friends drawn now, nearest first ("Kumpel,Ola"). */
	public static String friendsShown() {
		StringBuilder out = new StringBuilder();
		for (FriendPositions.Pos p : FriendPositions.visible(Minecraft.getInstance())) out.append(p.name()).append(',');
		return out.toString();
	}

	public static void friendsClear() {
		FriendPositions.clearForTest();
	}

	public static void friendsOnMap(boolean on) {
		SlashHud.config.friendsOnMap = on;
		SlashHud.config.friendsOnMapNames = true;
	}

	// ---------- the full map ----------

	public static void worldMap(boolean on, float zoom) {
		SlashHud.config.worldMap = on;
		SlashHud.config.worldMapZoom = zoom;
	}

	public static int explored() {
		return MinimapTerrain.exploredChunks();
	}

	public static int exploredColor(int x, int z) {
		return MinimapTerrain.explored(x, z);
	}

	private static WorldMapScreen map() {
		return Compat.screen(Minecraft.getInstance()) instanceof WorldMapScreen m ? m : null;
	}

	public static boolean mapOpen() {
		return map() != null;
	}

	/** The open map: its zoom, the world point in its middle, the waypoint open ("2.0,10,-4,Baza"). */
	public static String mapState() {
		WorldMapScreen m = map();
		if (m == null) return "closed";
		return String.format(java.util.Locale.ROOT, "%.3f,%d,%d,%s", m.zoom, Math.round(m.centerX), Math.round(m.centerZ), m.selected == null ? "-" : m.selected.name);
	}

	/** Where a world point is drawn on the open map, in window pixels. */
	public static int[] mapToWindow(double x, double z) {
		WorldMapScreen m = map();
		Minecraft mc = Minecraft.getInstance();
		double scale = mc.getWindow().getGuiScale();
		int aw = m.width - 12, ah = m.height - (22 + 4) - 16;
		double vx = m.centerX - aw / 2.0 / m.zoom, vz = m.centerZ - ah / 2.0 / m.zoom;
		return new int[] { (int) ((6 + (x - vx) * m.zoom) * scale), (int) ((26 + (z - vz) * m.zoom) * scale) };
	}

	/** The world point in the middle of the open map's screen area, as window pixels. */
	public static int[] mapMiddle() {
		WorldMapScreen m = map();
		return mapToWindow(m.centerX, m.centerZ);
	}

	public static void mapCenter(double x, double z, float zoom) {
		WorldMapScreen m = map();
		m.centerX = x;
		m.centerZ = z;
		m.zoom = zoom;
	}

	/** The open waypoint renamed, as if typed into its field. */
	public static void mapRename(String name) {
		WorldMapScreen m = map();
		if (m != null && m.selected != null) {
			m.selected.name = name;
			m.select(m.selected);
			Waypoints.save();
		}
	}

	/** A waypoint of this world by name: "x,y,z,visible", or "none". */
	public static String waypoint(String name) {
		for (Waypoints.Point p : Waypoints.points(Minecraft.getInstance())) if (p.name.equals(name)) return p.x + "," + p.y + "," + p.z + "," + p.visible;
		return "none";
	}

	/** Every waypoint of the test's ("Mapa…", "Punkt…") gone. */
	public static void clearWaypoints() {
		Waypoints.here(Minecraft.getInstance()).removeIf(p -> p.name.startsWith("Mapa") || p.name.startsWith("Punkt") || p.name.startsWith("Point"));
		Waypoints.save();
	}

	/** A friend's shared waypoint in this world, as if accepted from the chat. */
	public static void sharedWaypoint(String name, int x, int y, int z, String from) {
		Minecraft mc = Minecraft.getInstance();
		Waypoints.addShared(Waypoints.worldKey(mc), name, x, y, z, Waypoints.dimension(mc), from);
	}

	// ---------- players and mobs on the maps ----------

	public static void mapEntities(boolean players, boolean hostile, boolean passive) {
		SlashHud.config.mapPlayers = players;
		SlashHud.config.mapHostile = hostile;
		SlashHud.config.mapPassive = passive;
	}

	/** What the minimap and the full map drew last: "players,hostile,passive:nicks". */
	public static String entitiesOnMinimap() {
		return MapEntities.drawnMinimap;
	}

	public static String entitiesOnWorldMap() {
		return MapEntities.drawnWorldMap;
	}

	/** How each mob was drawn last on a map: "cow:head,silverfish:dot,". */
	public static String markers(boolean worldMap) {
		return MapEntities.markers(worldMap ? MapEntities.shownWorldMap : MapEntities.shownMinimap);
	}

	/** A screen with the faces of the mobs nearby drawn large with their names, to see each face is cut right. */
	public static net.minecraft.client.gui.screens.Screen facesSheet() {
		return new net.minecraft.client.gui.screens.Screen(net.minecraft.network.chat.Component.literal("faces")) {
			@Override
			public void extractRenderState(net.minecraft.client.gui.GuiGraphicsExtractor g, int mx, int my, float delta) {
				Minecraft mc = Minecraft.getInstance();
				g.fill(0, 0, width, height, 0xFF404850);
				java.util.TreeMap<String, net.minecraft.world.entity.Entity> one = new java.util.TreeMap<>();
				for (var e : mc.level.entitiesForRendering()) if (MobHeads.listed(e.getType())) one.putIfAbsent(net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).getPath(), e);
				int i = 0, size = 20, cols = Math.max(1, width / (size + 22));
				for (var entry : one.entrySet()) {
					MobHeads.Head head = MobHeads.head(entry.getValue());
					int x = 10 + (i % cols) * (size + 22), y = 6 + (i / cols) * (size + 12);
					if (head != null) MobHeads.draw(g, head, x, y, size, size);
					var pose = g.pose();
					pose.pushMatrix();
					pose.translate(x, y + size + 1);
					pose.scale(0.5f, 0.5f);
					g.text(mc.font, entry.getKey(), 0, 0, 0xFFFFFFFF, false);
					pose.popMatrix();
					i++;
				}
			}
		};
	}

	/** The textures the faces on a map were cut from, with their sizes. */
	public static String faceTextures(boolean worldMap) {
		return MapEntities.textures(worldMap ? MapEntities.shownWorldMap : MapEntities.shownMinimap);
	}

	private static final java.util.List<net.minecraft.client.player.RemotePlayer> fakePlayers = new java.util.ArrayList<>();

	/**
	 * Another player standing at a place, only in this game (a singleplayer world has no one
	 * else): as a server would send them, with a real player's id; `npc` gives them an NPC's id.
	 */
	public static void fakePlayer(String name, double x, double y, double z, boolean npc) {
		Minecraft mc = Minecraft.getInstance();
		java.util.UUID id = npc ? new java.util.UUID(java.util.UUID.randomUUID().getMostSignificantBits() & ~0xF000L | 0x2000L, java.util.UUID.randomUUID().getLeastSignificantBits())
			: java.util.UUID.nameUUIDFromBytes(("SlashClient test " + name).getBytes(java.nio.charset.StandardCharsets.UTF_8));
		var p = new net.minecraft.client.player.RemotePlayer(mc.level, new com.mojang.authlib.GameProfile(id, name));
		p.setPos(x, y, z);
		p.xo = x;
		p.yo = y;
		p.zo = z;
		// an id far from the server's own ones
		p.setId(2_000_000_000 + fakePlayers.size());
		mc.level.addEntity(p);
		fakePlayers.add(p);
	}

	public static void fakePlayersGone() {
		Minecraft mc = Minecraft.getInstance();
		for (var p : fakePlayers) if (mc.level != null) mc.level.removeEntity(p.getId(), net.minecraft.world.entity.Entity.RemovalReason.DISCARDED);
		fakePlayers.clear();
	}
}
//#endif
