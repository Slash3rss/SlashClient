package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;
import net.fabricmc.loader.api.FabricLoader;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Settings in config/slashclient-hud.json. The launcher writes the same file, so the
 * player can switch modules on and off there too; the in-game editor moves them.
 */
public final class HudConfig {
	/**
	 * Where a module sits: an anchor (0 = left/top, 0.5 = middle, 1 = right/bottom) plus an
	 * offset in GUI pixels. Modules stay by their corner or edge at any window size.
	 */
	public static final class Placement {
		/** A pulled-out chat tab's window, placed where it was dropped. */
		public static Placement at(float ax, float ay) {
			return new Placement(true, ax, ay, 0, 0);
		}

		public boolean enabled = true;
		public float ax;
		public float ay;
		public int dx;
		public int dy;
		/** Size of the module, 0.5 to 2. */
		public float scale = 1f;
		/** Own background setting; null = the HUD-wide one. */
		public Boolean background;
		/** Own text colour and shadow; null = the HUD-wide ones. */
		public Integer color;
		public Boolean shadow;
		/** How opaque the background is, 0 to 100 (null = 44, the HUD's usual). */
		public Integer opacity;
		/** A thin accent frame around the module. */
		public boolean outline;

		/** For Gson, so missing fields keep the defaults above. */
		Placement() {}

		public float scale() {
			return scale <= 0 ? 1f : scale;
		}

		public boolean background(HudConfig cfg) {
			return background == null ? cfg.background : background;
		}

		public int textColor(HudConfig cfg) {
			return color == null ? cfg.textColor : color;
		}

		public boolean shadow(HudConfig cfg) {
			return shadow == null ? cfg.textShadow : shadow;
		}

		public int opacity() {
			return opacity == null ? 44 : Math.max(0, Math.min(100, opacity));
		}

		Placement(boolean enabled, float ax, float ay, int dx, int dy) {
			this.enabled = enabled;
			this.ax = ax;
			this.ay = ay;
			this.dx = dx;
			this.dy = dy;
		}
	}

	/** A chat tab: shows only the lines that match one of its patterns. */
	public static final class ChatTab {
		public String name;
		/** Plain text (case does not matter) or regular expressions; "{nick}" is the player's name. */
		public List<String> patterns = new ArrayList<>();
		/** Pulled out of the chat: its own window there (null = a tab in the chat's row). */
		public Placement window;
		/** The pulled-out window's own size: its width and how many lines it shows (0 = the usual). */
		public int windowWidth, windowLines;
		/** Lines that match one of these stay out of the tab, even when `patterns` catch them. */
		public List<String> excludes = new ArrayList<>();
		public boolean regex;
		/** The pulled-out window has its own line to type in while the chat is open (off: it only shows lines). */
		public boolean input;
		/** Put in front of every message sent from this tab ("/msg Steve ", "/g ", "@"); "" = nothing. */
		public String replyPrefix = "";
		/** The pulled-out window folded to its title (a click on the title folds and unfolds it). */
		public boolean collapsed;
		/** The sound of a mention caught by this tab ("" = the usual bell, "none" = silent; ChatTabs.SOUNDS). */
		public String sound = "";

		/** Never null: configs from before the field get "" (the usual bell). */
		public String sound() {
			return sound == null ? "" : sound;
		}

		/** Never null: configs from before the field get "". */
		public String prefix() {
			return replyPrefix == null ? "" : replyPrefix;
		}

		/** Never null: configs from before the field get an empty list. */
		public List<String> excludes() {
			if (excludes == null) excludes = new ArrayList<>();
			return excludes;
		}

		public ChatTab(String name, boolean regex, String... patterns) {
			this.name = name;
			this.regex = regex;
			this.patterns.addAll(List.of(patterns));
		}
	}

	public Map<String, Placement> modules = new LinkedHashMap<>();
	public List<ChatTab> chatTabs = new ArrayList<>();
	/** ARGB colour of the text. */
	public int textColor = 0xFFFFFFFF;
	public boolean background = true;
	public boolean textShadow = true;

	// ---- extras, the other things clients usually have ----
	/** Hold the zoom key (C) to zoom; the mouse wheel changes how far while held. */
	public boolean zoom = true;
	public float zoomFactor = 4f;
	public boolean zoomSmooth = true;
	/** The zoom key switches the zoom on and off instead of being held. */
	public boolean zoomToggle = false;
	/** The camera glides while zoomed (the game's cinematic camera). */
	public boolean zoomCinematic = false;
	/** The wheel's zoom is kept for the next time, instead of the zoom factor. */
	public boolean zoomRemember = false;
	/** Q drops a valuable item (a tool, weapon or armour, enchanted or rare, a shulker box) only when pressed twice. */
	public boolean dropGuard = true;
	/** Seconds left above lit TNT. */
	public boolean tntTimer = true;
	/** The dungeon map: how much closer than the whole of it (1 = all that was seen). */
	public float dungeonZoom = 1f;
	/** Other players on the dungeon map. */
	public boolean dungeonPlayers = true;
	/** The dungeon map's title ("Dungeon · poziom 3" and the containers taken). */
	public boolean dungeonTitle = true;
	/** The dungeon map's size on screen, in pixels (80–240): more map, the text and icons as they are. */
	public int dungeonSize = 120;
	/** How far around the player the dungeon's floor is read for the map (blocks; DungeonMap.MIN_RANGE–MAX_RANGE). */
	public int dungeonScanRange = 96;
	/** Rooms not seen yet drawn from the map SkyUp builds above the dungeon. */
	public boolean dungeonPlan = false;
	/** Progress to the next level (the boss bar's fill) on the dungeon map. */
	public boolean dungeonProgress = true;
	/** You on the dungeon map as your head instead of an arrow. */
	public boolean dungeonSelfHead = false;
	/** Mobs and NPCs (players with a skin who are not on the tab list) on the dungeon map. */
	public boolean dungeonMobs = true;
	/** How each mob class shows on the dungeon map: "head", "dot", "skull" or "hidden". */
	public String dungeonMobNormal = "head", dungeonMobElite = "head", dungeonMobBoss = "head", dungeonMobMinion = "head", dungeonMobOther = "head";
	/** Spawners on the dungeon map: armour stands with a spawner on the head. */
	public boolean dungeonSpawners = true;
	/** How a spawner shows on the dungeon map: "icon", "dot" or "hidden". */
	public String dungeonSpawnerStyle = "icon";
	/** Chests, barrels and pots on the dungeon map, counted per room (taken of all). */
	public boolean dungeonContainers = true;
	/** The dungeon map's floor in its blocks' colours instead of one plain grey. */
	public boolean dungeonBlockColors = false;
	/** The kinds of loot counted on the dungeon map (in rooms and under it): chests, barrels, pots, flower pots, deepslate ores. */
	public boolean dungeonChests = true, dungeonBarrels = true, dungeonPots = true, dungeonFlowerPots = true, dungeonOres = true;
	/** Counters under the dungeon map, one per kind of loot. */
	public boolean dungeonCounters = true;
	/** Deepslate ores not counted ("coal,copper"), the rest are. */
	public String dungeonOresOff = "";
	/**
	 * Loot not taken yet, and items lying on the ground, outlined in the world while in a SkyUp dungeon (LootHighlight): each kind
	 * (as DungeonRooms.LOOT) on or off and in its colour, a soft fill, faint pulsing, as far as
	 * lootHighlightRange (when limited), and seen through walls only when switched on.
	 */
	public boolean lootHighlight = false;
	public boolean lootChests = true, lootBarrels = true, lootPots = true, lootFlowerPots = true, lootOres = true, lootDrops = true;
	public int lootChestColor = 0xFFFACC15, lootBarrelColor = 0xFFFB923C, lootPotColor = 0xFFA855F7, lootFlowerPotColor = 0xFF4ADE80, lootOreColor = 0xFF55FFFF, lootDropColor = 0xFFFFFFFF;
	/** Dropped items glow in a colour like the item (dungeon drops); off, or for other items: lootDropColor. */
	public boolean lootDropItemColors = true;
	public boolean lootHighlightFill = true, lootHighlightPulse = false, lootHighlightWalls = false, lootHighlightLimit = true;
	public int lootHighlightRange = 32;
	/** Rooms cleared of mobs in green, with the time until they come back. */
	public boolean dungeonCleared = true;
	/** Rooms without a spawner edged in blue. */
	public boolean dungeonNoSpawner = true;
	/** The dungeon map keeps the player in its middle. */
	public boolean dungeonFollow = false;
	/** The dungeon map is read at one height (dungeonY) instead of at the player's feet. */
	public boolean dungeonFixedY = false;
	public int dungeonY = 64;
	/** "square" or "circle". */
	public String dungeonShape = "square";
	/** The minimap: its size in pixels, pixels per block, shape, turning with the player, the line under it, waypoints on it. */
	public int minimapSize = 100;
	public float minimapZoom = 1f;
	public String minimapShape = "square";
	public boolean minimapRotate = false;
	public boolean minimapCoords = true;
	public boolean minimapWaypoints = true;
	/** Players, hostile mobs and other mobs the game knows about around the player, on the minimap and the full map. */
	public boolean mapPlayers = true;
	public boolean mapHostile = true;
	public boolean mapPassive = true;
	/** SkyUp's tasks on the HUD: how many at most, one line each, those ready to complete hidden, rewards shown. */
	public int skyTasksMax = 5;
	/** The module's widest, in pixels: longer names are cut with "…". */
	public int skyTasksWidth = 220;
	public boolean skyTasksCompact = false, skyTasksHideDone = false, skyTasksRewards = false;
	/** Every unfinished task tracked (those switched off one by one aside). */
	public boolean skyTasksTrackAll = false;
	/** The category last open and how many of its tasks are left. */
	public boolean skyTasksTierCount = true;
	/** On joining SkyUp, a line saying the tasks GUI loads the progress. */
	public boolean skyTasksJoinHint = true;
	/** SkyUp's fish counter: split by "none", "size", "species" or "quality"; their weight and value shown. */
	public String skyFishSplit = "none";
	public boolean skyFishWeight = true, skyFishValue = true;
	/** SkyUp's case counter: "recent" drops, the "top" rewards of the case shown, or its "summary" only; how many rows. */
	public String skyCaseLayout = "recent";
	public static final String[] SKY_CASE_LAYOUTS = { "recent", "top", "summary" };
	public int skyCaseRows = 5;
	/** A toast when a case gives a reward never won before. */
	public boolean skyCaseNewDrop = true;
	/** SkyUp's resource pack kept up to date in the player's resource packs; switched on there, SkyUp's offer is not asked about (SkyPack). */
	public boolean skyPackLocal = true;
	/** Seconds a case's preview (or a win only it gives) counts as the case being opened, for rewards more cases give. */
	public int skyCaseWindow = 60;
	/** Rewards summed by item ("4x Diament" counts as 4 Diament): the detail window grouped, the top rewards in pieces. */
	public boolean skyCaseSum = false;
	/** SkyUp's wardrobe module: the worn items' names beside them (else only their pictures in a row), and the wardrobe's two switches. */
	public boolean skyWardrobeNames = false, skyWardrobeStatus = true;
	/** How much health a mob or player just lost, rising from it. */
	public boolean damageNumbers = true;
	/** Your nick written differently in chat, the tab list and above your head (for recordings and streams). */
	public boolean nickHider = false;
	/** What it is written as: "you", "player", "hidden" or "stars". */
	public String nickAlias = "you";
	/** A button on the "disconnected" screen that joins the same server again. */
	public boolean reconnect = true;
	/** The game's Microsoft session renewed from the launcher before it runs out, without a restart (SessionRenew). */
	public boolean sessionRenew = true;
	/** Server resource packs on servers not in the list: one of ServerPacks.MODES. */
	public String serverPackDefault = "prompt";
	public boolean fullbright = false;
	/** The fire overlay sits lower, so it covers less of the screen. */
	public boolean lowFire = false;
	/** The outline of the block looked at in its own colour (opacity in %) and thickness (× the game's). */
	public boolean blockOutline = false;
	public int blockOutlineColor = 0xFFFFFFFF, blockOutlineOpacity = 60;
	public float blockOutlineWidth = 2f;
	/** A held shield sits lower in first person, by this many hundredths of a block. */
	public boolean lowShield = false;
	public float lowShieldAmount = 20f;
	/** Held items in first person smaller (scale) and moved (in hundredths of a block). */
	public boolean heldItems = false;
	public float heldItemScale = 0.75f, heldItemX = 0f, heldItemY = 0f, heldItemZ = 0f;
	public boolean chatTimestamps = false;
	/** A chime when someone writes your nick, and the "@" badge over the closed chat. */
	public boolean chatMentions = true;
	/** What a pulled-out chat tab catches shows only in its window, not also in "All". */
	public boolean chatWindowsOnly = false;
	/** "vanilla", one of Crosshair.PRESETS, or "custom" for the painted crosshairPattern. */
	public String crosshair = "vanilla";
	public String crosshairPattern;
	/** The crosshair to come back to when it is switched on again. */
	public String crosshairLast = "plusdot";
	public boolean crosshairOutline = true;
	public int crosshairColor = 0xFFFFFFFF;
	public int crosshairSize = 5;
	public int crosshairGap = 2;
	/**
	 * A marker at the crosshair when we hit something (HitMarker): its colour, arm length in pixels,
	 * how long it shows (ms) and its look; a short sound and how loud (%); a colour of its own when
	 * the hit kills; hits by our arrows and tridents too.
	 */
	public boolean hitMarker = false;
	public int hitMarkerColor = 0xFFFFFFFF, hitMarkerSize = 4, hitMarkerDuration = 300;
	public String hitMarkerStyle = "x";
	public boolean hitMarkerSound = false;
	public String hitMarkerSoundKind = "ding";
	public int hitMarkerVolume = 50;
	public boolean hitMarkerKill = true;
	public int hitMarkerKillColor = 0xFFF87171;
	public boolean hitMarkerProjectiles = true;
	/** Our own armour not drawn on our player (F5, the inventory), piece by piece, so the skin and cosmetics show (OwnArmor); others always see it. */
	public boolean hideOwnArmor = false;
	public boolean hideOwnHelmet = true, hideOwnChestplate = true, hideOwnLeggings = true, hideOwnBoots = true;
	/** The elytra too (then the cape or SlashClient wings show in its place): off, so gliding still looks like gliding. */
	public boolean hideOwnElytra = false;
	/** The logo next to SlashClient players (and telling the server that you are one). */
	public boolean badges = true;
	/** The [TAG] of a player's SlashClient clan after that logo: off, so names stay short. */
	public boolean clanTags = true;
	/** Kill effects (a SlashClient cosmetic): ours when we kill something, and those of other players with SlashClient. */
	public boolean killEffects = true;
	public boolean killEffectsOthers = true;
	/** Other players' SlashClient shield and weapon skins (ours always show): off, so in PvP every weapon looks as the game's. */
	public boolean heldSkinsOthers = false;
	/** Rings under the feet and movement effects (SlashClient cosmetics): ours, and those of other players with SlashClient. */
	public boolean ringEffects = true;
	public boolean ringEffectsOthers = true;
	public boolean moveEffects = true;
	public boolean moveEffectsOthers = true;
	/** Sprays (a SlashClient cosmetic) on blocks: shown at all, and other players' too. */
	public boolean sprays = true;
	public boolean spraysOthers = true;
	/** The SlashClient main menu instead of Minecraft's own. */
	public boolean customMenu = true;
	/** The SlashClient pause menu instead of Minecraft's own. */
	public boolean customPause = true;
	/** The SlashClient server list (cards, search) instead of Minecraft's own. */
	public boolean customServerList = true;
	/** SlashClient's own look for joining a server and entering a world (only the look: the game loads as always). */
	public boolean customLoading = true;
	/** The rotating tip line at the bottom of that screen. */
	public boolean loadingTips = true;

	// ---- the game's own HUD parts: shown or hidden, scaled, moved ----
	public boolean scoreboard = true;
	public float scoreboardScale = 1f;
	/** Pixels up (negative) or down from the middle of the right edge. */
	public int scoreboardOffset = 0;
	/** The red numbers next to the lines. */
	public boolean scoreboardNumbers = true;
	public boolean bossBar = true;
	public float bossBarScale = 1f;
	public int bossBarOffset = 0;
	public float tabScale = 1f;
	/** The ping in milliseconds instead of the signal bars. */
	public boolean tabNumericPing = false;
	/** The tab list without the server's text above or below it, and with at most this many players (80: the game's own). */
	public boolean tabHideHeader = false, tabHideFooter = false;
	public int tabMaxPlayers = 80;
	public boolean titles = true;
	public float titleScale = 1f;
	/** The action bar above the hotbar (a server's short messages). */
	public boolean actionBar = true;
	public float actionBarScale = 1f;
	/** Your own name above your head in third person (F5). */
	public boolean ownNametag = false;
	/** Clips: the last seconds of the screen in memory, saved with a key (off: it costs memory and a little CPU). */
	public boolean clips = false;
	public int clipSeconds = 30;
	/** Instant replay (Replay): a key shows the last seconds in the game; it keeps the clips' frames, so it takes the same memory. */
	public boolean replay = false;
	public int replaySeconds = 30;
	/** Singleplayer stops while the replay is watched. */
	public boolean replayPause = true;

	// ---- helpers (see Assist) ----
	/** The player has read that servers may ban for the automatic helpers. */
	public boolean assistWarned = false;
	public boolean autoClicker = false;
	public boolean autoClickLeft = true;
	public boolean autoClickRight = false;
	public int cpsMin = 8;
	public int cpsMax = 12;
	/** Left clicks wait for the weapon to charge fully instead of the clicks per second. */
	public boolean autoClickCooldown = true;
	/** Left clicks on their own whenever a mob is under the crosshair. */
	public boolean autoClickMobs = false;
	public boolean autoClickPlayers = false;
	public boolean autoTool = false;
	public boolean autoToolRestore = true;
	public boolean autoRefill = false;
	/** Buttons held by their keys go on with the inventory or the pause menu open. */
	public boolean holdInScreens = true;
	public boolean toolWarning = true;
	public int toolWarningPercent = 10;
	/** Health above 10 hearts in one row, each 10 hearts more in another colour. */
	public boolean compactHearts = true;
	/** Shift-drag over slots and the wheel move items in inventories. */
	public boolean mouseTweaks = true;
	/** Shift-clicking a crafting result crafts only what fits, with room kept for what stays on the grid (CraftFit). */
	public boolean craftFit = true;
	/**
	 * Sorting chests and the inventory with a key (InventorySort): the pause between its clicks (ms),
	 * the hotbar sorted too, the small button in the window's corner, and the servers it stays off on.
	 */
	public boolean inventorySort = true;
	public int sortDelay = 0;
	/** The delay's old default (50 ms) was moved to 0 once: sorting all at once like other mods. */
	public Boolean sortDelayMoved;
	public boolean sortHotbar = false;
	public boolean sortButton = true;
	/** Arrows in a chest's window: all that fits from the inventory into the chest, or from the chest into the inventory (the hotbar too when asked). */
	public boolean chestMove = true;
	public boolean chestMoveHotbar = false;
	/** Their rules forbid sorting mods (Hypixel's do): more can be added, with their subdomains. */
	public String sortOffServers = "hypixel.net";
	/** Friends who share their position, on the minimap and the full map, with their nicks. */
	public boolean friendsOnMap = true;
	public boolean friendsOnMapNames = true;
	/** M outside a dungeon opens the map of all the ground seen (WorldMapScreen), at this zoom (GUI pixels a block). */
	public boolean worldMap = true;
	public float worldMapZoom = 2f;
	// ---- options of single modules ----
	public boolean clockSeconds = false;
	public boolean clock12h = false;
	public int coordsDecimals = 0;
	public boolean coordsFacing = true;
	/**
	 * Block info's extra lines: a crop's growth, what a block holds or counts (honey in a hive, a
	 * composter's level, an anchor's charges, candles…) and the redstone signal (only where there is one),
	 * the block's coordinates, the light on the face looked at, hardness and blast resistance, its
	 * id (with the mod it comes from) and its state (facing, half, waterlogged…).
	 */
	public boolean blockGrowth = true, blockDetails = true, blockPower = true, blockCoords = false, blockLight = false, blockHardness = false, blockId = false, blockState = false;
	/** Block info: the tool (as a picture) and how long breaking takes, bees in a hive (singleplayer), a shelf's items, what an item frame holds. */
	public boolean blockTool = true, blockBees = true, blockShelf = true, blockFrames = true;
	/** Block info: the fastest tool in the game that makes the block drop, and the weakest that still does. */
	public boolean blockBestTool = true;
	/** FPS green, yellow or red by how smooth the game runs. */
	public boolean fpsColored = false;
	public boolean effectIcons = true;

	// ---- chat ----
	/** The same line again becomes "×2", "×3" on the last one instead of a new line. */
	public boolean chatStack = true;
	/** Right click on a chat line copies it. */
	public boolean chatCopy = true;
	/** Coordinates in chat lines underlined: a click saves them as a waypoint (ChatCoords). */
	public boolean chatCoords = true;
	/** How a copied message comes out: "plain", "section" (§ codes), "ampersand" (& codes) or "json". */
	public String chatCopyFormat = "plain";
	/** The time the message came in, in front: "off", "hm" ([HH:mm]) or "hms" ([HH:mm:ss]). */
	public String chatCopyTime = "off";
	/** Only the message: "<nick> ", "nick » ", "nick: " in front is left out. */
	public boolean chatCopyNoSender = false;
	/** What the line above the hotbar says after a copy: "off", "short" or "preview" (the copied text). */
	public String chatCopyNotice = "short";
	/** A search box over the open chat. */
	public boolean chatSearch = true;
	/** The chat bigger than the game's largest chat scale: the game's scale times this, 1 to 1.5 (see ChatLook). */
	public float chatScaleExtra = 1f;

	// ---- more extras ----
	/** Your own time of day, only for you; the server's time stays as it is. */
	public boolean timeChanger = false;
	public int fixedTime = 6000;
	/** Hold the key to look around without turning (off by default: some servers forbid it). */
	public boolean freelook = false;
	public boolean waypoints = true;
	/** A waypoint put by itself where you last died (one per world and dimension, see DeathPoint). */
	public boolean deathWaypoint = true;
	/** The death screen with the place, the time lived and a button keeping the place as a waypoint (DeathInfo). */
	public boolean deathScreen = true;
	/** Crosses where monsters can spawn, switched with a key (F9), this many blocks around (LightOverlay). */
	public boolean lightOverlay = false;
	public int lightOverlayRadius = 16;
	/** The overlay marks farmland too: green where crops on it grow (light 9 and up), blue where it is too dark. */
	public boolean lightOverlayCrops = true;
	/** No rain, snow or thunder, only for you (the server's weather stays). */
	public boolean weatherOff = false;
	/** The third person camera's distance with the mouse wheel: held key or the wheel alone, starting distance, back to it after F5. */
	public boolean cameraDistance = false;
	public boolean cameraDistanceKey = true;
	public float cameraDistanceDefault = 4f;
	public boolean cameraDistanceReset = false;
	/** F2 also puts the picture on the clipboard (through the launcher) and shows it in the corner. */
	public boolean screenshotClipboard = true;
	/** F2's screenshots get a caption in a corner: coordinates and dimension, date and time, server (ShotCaption). */
	public boolean screenshotCaption = false;
	/** Which corner: one of ShotCaption.CORNERS. */
	public String screenshotCaptionCorner = "bottomLeft";
	public boolean screenshotCaptionCoords = true;
	public boolean screenshotCaptionServer = true;
	/** A shulker box's tooltip shows what is inside as a grid (ShulkerPreview). */
	public boolean shulkerPreview = true;
	/** A search box over inventories and chests (InventorySearch). */
	public boolean inventorySearch = true;
	/** Locked hotbar slots keep their items (SlotLock); which ones, a bit for each slot. */
	public boolean slotLock = true;
	public int lockedSlots = 0;
	/** A toast when a friend comes online or starts playing (muted friends never make one). */
	public boolean friendPlayingToasts = true;
	/** Faces of friends playing on a server next to it in the server list (ServerFriends). */
	public boolean serverFriends = true;
	/** "● NA ŻYWO" above SlashClient players live on Twitch or Kick with Minecraft (Badges.liveLabel). */
	public boolean liveNametags = true;
	/** Other players' ping after their name above the head, on servers (NametagPing). */
	public boolean nametagPing = false;
	/** The live chats of a Twitch and a Kick channel on the HUD (see StreamChatModule). */
	public dev.slash3rss.slashclient.hud.streams.StreamChatSettings twitchChat = new dev.slash3rss.slashclient.hud.streams.StreamChatSettings();
	public dev.slash3rss.slashclient.hud.streams.StreamChatSettings kickChat = new dev.slash3rss.slashclient.hud.streams.StreamChatSettings();
	/** "Now playing" (see SpotifyModule; "spotify" from when it showed only Spotify): what shows and how. */
	public dev.slash3rss.slashclient.hud.spotify.SpotifySettings spotify = new dev.slash3rss.slashclient.hud.spotify.SpotifySettings();

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-hud.json");

	static HudConfig defaults() {
		HudConfig c = new HudConfig();
		// left column, one text line (14 px) apart
		// the dungeon map on the left, under the usual modules; it shows only in a dungeon
		c.modules.put("dungeonmap", new Placement(true, 0f, 0.55f, 2, 0));
		// SkyUp's tasks on the left, under the usual top-left modules and above the dungeon map (the right side has
		// the effects, CPU/GPU and the scoreboard); shown only with tasks to show
		c.modules.put("skytasks", new Placement(true, 0f, 0.3f, 2, 0));
		// the fish counter lower on the right; shown once a fish was caught on SkyUp
		c.modules.put("skyfish", new Placement(true, 1f, 0.75f, -2, 0));
		// the case counter above it; shown once a case was opened on SkyUp
		c.modules.put("skycase", new Placement(true, 1f, 0.55f, -2, 0));
		// the wardrobe above the case counter; shown once SkyUp's wardrobe window was opened
		c.modules.put("skywardrobe", new Placement(true, 1f, 0.35f, -2, 0));
		// the minimap in the top right corner, off until switched on; its own picture needs no background
		Placement minimap = new Placement(false, 1f, 0f, -2, 2);
		minimap.background = false;
		c.modules.put("minimap", minimap);
		GameParts.defaults(c);
		c.modules.put("fps", new Placement(true, 0, 0, 2, 2));
		c.modules.put("ping", new Placement(true, 0, 0, 2, 17));
		c.modules.put("cps", new Placement(true, 0, 0, 2, 32));
		c.modules.put("coords", new Placement(true, 0, 0, 2, 47));
		c.modules.put("speed", new Placement(false, 0, 0, 2, 74));
		// under the coordinates (where speed is, also off by default), switched on when wanted
		c.modules.put("nethercoords", new Placement(false, 0, 0, 2, 74));
		// top middle, under the boss bar area only when switched on
		c.modules.put("server", new Placement(false, 0.5f, 0, 0, 2));
		c.modules.put("players", new Placement(false, 0.5f, 0, 0, 17));
		c.modules.put("biome", new Placement(false, 0.5f, 0, 0, 32));
		c.modules.put("daytime", new Placement(false, 0.5f, 0, 0, 47));
		c.modules.put("light", new Placement(false, 0.5f, 0, 0, 62));
		c.modules.put("saturation", new Placement(false, 0.5f, 0, 0, 77));
		// right column; the effect list replaces Minecraft's own effect icons
		c.modules.put("clock", new Placement(false, 1, 0, -2, 2));
		c.modules.put("memory", new Placement(false, 1, 0, -2, 17));
		c.modules.put("session", new Placement(false, 1, 0, -2, 32));
		c.modules.put("cpu", new Placement(false, 1, 0, -2, 62));
		c.modules.put("gpu", new Placement(false, 1, 0, -2, 77));
		c.modules.put("tps", new Placement(false, 1, 0, -2, 92));
		c.modules.put("network", new Placement(false, 1, 0, -2, 107));
		c.modules.put("fpsgraph", new Placement(false, 0, 0, 2, 74));
		c.modules.put("friends", new Placement(false, 1, 1, -2, -28));
		c.modules.put("kd", new Placement(false, 0.5f, 0, 0, 45));
		c.modules.put("sky", new Placement(false, 0.5f, 0, 0, 30));
		// the compass at the top in the middle; around the crosshair what you need while aiming
		c.modules.put("compass", new Placement(false, 0.5f, 0, 0, 2));
		c.modules.put("hits", new Placement(false, 0.5f, 0.5f, 0, -22));
		c.modules.put("durability", new Placement(false, 0.5f, 0.5f, 60, 0));
		c.modules.put("ammo", new Placement(false, 0.5f, 0.5f, -60, 0));
		c.modules.put("block", new Placement(false, 0.5f, 0.5f, 0, -45));
		c.modules.put("elytra", new Placement(false, 0.5f, 1, 0, -60));
		c.modules.put("effects", new Placement(true, 1, 0, -2, 47));
		c.modules.put("armor", new Placement(true, 1, 0.5f, -2, 20));
		c.modules.put("items", new Placement(true, 1, 1, -2, -2));
		// around the crosshair
		c.modules.put("target", new Placement(true, 0.5f, 0.5f, 0, 40));
		c.modules.put("combo", new Placement(false, 0.5f, 0.5f, 30, 12));
		c.modules.put("reach", new Placement(false, 0.5f, 0.5f, -30, 12));
		c.modules.put("sprint", new Placement(false, 0, 1, 2, -2));
		c.modules.put("keystrokes", new Placement(true, 0, 0.5f, 2, 20));
		c.modules.put("movement", new Placement(false, 0, 0.5f, 2, -2));
		// a stream's chat low on the left, above the game's chat; off until a channel is set
		c.modules.put("twitchchat", new Placement(false, 0, 0.62f, 2, 0));
		c.modules.put("kickchat", new Placement(false, 1, 0.62f, -2, 0));
		// what plays on this computer on the right, between the effects and the armour; off until switched on
		c.modules.put("spotify", new Placement(false, 1, 0.3f, -2, 0));
		// the backpack's slots low on the right, above the item counter; off until switched on
		c.modules.put("inventory", new Placement(false, 1, 0.8f, -2, 0));
		c.chatTabs.add(new ChatTab("@", false, "{nick}"));
		// private messages look different on every server; these catch the common ones
		c.chatTabs.add(new ChatTab("PM", true, "(?i)(whispers to you|szepcze|\\[msg\\]|-> ?(me|ja)\\b|\\bfrom \\w+:)"));
		return c;
	}

	public static HudConfig load() {
		HudConfig defaults = defaults();
		try {
			if (!Files.exists(FILE)) {
				defaults.save();
				return defaults;
			}
			HudConfig read = GSON.fromJson(Files.readString(FILE), HudConfig.class);
			return read == null ? defaults : fillMissing(read);
		} catch (IOException | JsonSyntaxException e) {
			SlashHud.LOG.warn("Nie udało się wczytać {}: {}", FILE, e.toString());
			return defaults;
		}
	}

	/** Settings from an older version or a share code: whatever is missing gets its default. */
	static HudConfig fillMissing(HudConfig read) {
		HudConfig defaults = defaults();
		if (read.modules == null) read.modules = new LinkedHashMap<>();
		// modules added in newer versions get their default place
		// the game's parts start where they were (the old offset sliders), not at the defaults' places
		GameParts.defaults(read);
		for (var e : defaults.modules.entrySet()) read.modules.putIfAbsent(e.getKey(), e.getValue());
		if (read.chatTabs == null) read.chatTabs = defaults.chatTabs;
		if (read.crosshair == null) read.crosshair = defaults.crosshair;
		if (read.crosshairLast == null) read.crosshairLast = defaults.crosshairLast;
		if (read.nickAlias == null) read.nickAlias = defaults.nickAlias;
		if (read.skyFishSplit == null) read.skyFishSplit = defaults.skyFishSplit;
		if (read.sortOffServers == null) read.sortOffServers = defaults.sortOffServers;
		read.skyCaseLayout = oneOf(read.skyCaseLayout, SKY_CASE_LAYOUTS);
		read.chatCopyFormat = oneOf(read.chatCopyFormat, ChatExtras.COPY_FORMATS);
		read.chatCopyTime = oneOf(read.chatCopyTime, ChatExtras.COPY_TIMES);
		read.chatCopyNotice = oneOf(read.chatCopyNotice, ChatExtras.COPY_NOTICES);
		read.serverPackDefault = oneOf(read.serverPackDefault, ServerPacks.MODES);
		read.screenshotCaptionCorner = oneOf(read.screenshotCaptionCorner, ShotCaption.CORNERS);
		read.hitMarkerStyle = oneOf(read.hitMarkerStyle, HitMarker.STYLES);
		read.hitMarkerSoundKind = oneOf(read.hitMarkerSoundKind, HitMarker.SOUNDS);
		read.twitchChat = read.twitchChat == null ? defaults.twitchChat : read.twitchChat.checked();
		read.kickChat = read.kickChat == null ? defaults.kickChat : read.kickChat.checked();
		read.spotify = read.spotify == null ? defaults.spotify : read.spotify.checked();
		return read;
	}

	/** Takes over everything from `other` (a pasted code) and saves. */
	public void copyFrom(HudConfig other) {
		modules = other.modules;
		chatTabs = other.chatTabs;
		textColor = other.textColor;
		background = other.background;
		textShadow = other.textShadow;
		zoom = other.zoom;
		zoomFactor = other.zoomFactor;
		zoomSmooth = other.zoomSmooth;
		zoomToggle = other.zoomToggle;
		zoomCinematic = other.zoomCinematic;
		zoomRemember = other.zoomRemember;
		dropGuard = other.dropGuard;
		tntTimer = other.tntTimer;
		dungeonZoom = other.dungeonZoom;
		dungeonPlayers = other.dungeonPlayers;
		dungeonTitle = other.dungeonTitle;
		dungeonSize = other.dungeonSize;
		dungeonScanRange = Math.max(32, Math.min(128, other.dungeonScanRange));
		dungeonPlan = other.dungeonPlan;
		dungeonProgress = other.dungeonProgress;
		dungeonSelfHead = other.dungeonSelfHead;
		dungeonMobs = other.dungeonMobs;
		dungeonMobNormal = other.dungeonMobNormal;
		dungeonMobElite = other.dungeonMobElite;
		dungeonMobBoss = other.dungeonMobBoss;
		dungeonMobMinion = other.dungeonMobMinion;
		dungeonMobOther = other.dungeonMobOther;
		dungeonSpawners = other.dungeonSpawners;
		dungeonSpawnerStyle = other.dungeonSpawnerStyle;
		dungeonContainers = other.dungeonContainers;
		dungeonBlockColors = other.dungeonBlockColors;
		dungeonChests = other.dungeonChests;
		dungeonBarrels = other.dungeonBarrels;
		dungeonPots = other.dungeonPots;
		dungeonFlowerPots = other.dungeonFlowerPots;
		lootHighlight = other.lootHighlight;
		lootChests = other.lootChests;
		lootBarrels = other.lootBarrels;
		lootPots = other.lootPots;
		lootFlowerPots = other.lootFlowerPots;
		lootOres = other.lootOres;
		lootDrops = other.lootDrops;
		lootChestColor = other.lootChestColor;
		lootBarrelColor = other.lootBarrelColor;
		lootPotColor = other.lootPotColor;
		lootFlowerPotColor = other.lootFlowerPotColor;
		lootOreColor = other.lootOreColor;
		lootDropColor = other.lootDropColor;
		lootDropItemColors = other.lootDropItemColors;
		lootHighlightFill = other.lootHighlightFill;
		lootHighlightPulse = other.lootHighlightPulse;
		lootHighlightWalls = other.lootHighlightWalls;
		lootHighlightLimit = other.lootHighlightLimit;
		lootHighlightRange = Math.max(8, Math.min(64, other.lootHighlightRange));
		dungeonOres = other.dungeonOres;
		dungeonCounters = other.dungeonCounters;
		dungeonOresOff = other.dungeonOresOff;
		dungeonCleared = other.dungeonCleared;
		dungeonNoSpawner = other.dungeonNoSpawner;
		dungeonFollow = other.dungeonFollow;
		dungeonFixedY = other.dungeonFixedY;
		dungeonY = other.dungeonY;
		dungeonShape = other.dungeonShape;
		minimapSize = other.minimapSize;
		minimapZoom = other.minimapZoom;
		minimapShape = other.minimapShape;
		minimapRotate = other.minimapRotate;
		minimapCoords = other.minimapCoords;
		minimapWaypoints = other.minimapWaypoints;
		mapPlayers = other.mapPlayers;
		mapHostile = other.mapHostile;
		mapPassive = other.mapPassive;
		skyTasksMax = Math.max(1, Math.min(10, other.skyTasksMax));
		skyTasksWidth = Math.max(100, Math.min(320, other.skyTasksWidth));
		skyTasksCompact = other.skyTasksCompact;
		skyTasksHideDone = other.skyTasksHideDone;
		skyTasksRewards = other.skyTasksRewards;
		skyTasksTrackAll = other.skyTasksTrackAll;
		skyTasksTierCount = other.skyTasksTierCount;
		skyTasksJoinHint = other.skyTasksJoinHint;
		skyFishSplit = other.skyFishSplit == null ? "none" : other.skyFishSplit;
		skyFishWeight = other.skyFishWeight;
		skyFishValue = other.skyFishValue;
		skyCaseLayout = oneOf(other.skyCaseLayout, SKY_CASE_LAYOUTS);
		skyCaseRows = Math.max(1, Math.min(10, other.skyCaseRows));
		skyCaseNewDrop = other.skyCaseNewDrop;
		skyWardrobeNames = other.skyWardrobeNames;
		skyWardrobeStatus = other.skyWardrobeStatus;
		skyPackLocal = other.skyPackLocal;
		skyCaseWindow = Math.max(5, Math.min(600, other.skyCaseWindow));
		skyCaseSum = other.skyCaseSum;
		damageNumbers = other.damageNumbers;
		nickHider = other.nickHider;
		nickAlias = other.nickAlias;
		reconnect = other.reconnect;
		sessionRenew = other.sessionRenew;
		serverPackDefault = oneOf(other.serverPackDefault, ServerPacks.MODES);
		fullbright = other.fullbright;
		lowFire = other.lowFire;
		blockOutline = other.blockOutline;
		blockOutlineColor = other.blockOutlineColor;
		blockOutlineOpacity = other.blockOutlineOpacity;
		blockOutlineWidth = other.blockOutlineWidth;
		lowShield = other.lowShield;
		lowShieldAmount = other.lowShieldAmount;
		heldItems = other.heldItems;
		heldItemScale = other.heldItemScale;
		heldItemX = other.heldItemX;
		heldItemY = other.heldItemY;
		heldItemZ = other.heldItemZ;
		chatTimestamps = other.chatTimestamps;
		chatMentions = other.chatMentions;
		chatWindowsOnly = other.chatWindowsOnly;
		crosshair = other.crosshair;
		crosshairColor = other.crosshairColor;
		crosshairSize = other.crosshairSize;
		crosshairGap = other.crosshairGap;
		crosshairPattern = other.crosshairPattern;
		crosshairLast = other.crosshairLast;
		crosshairOutline = other.crosshairOutline;
		hitMarker = other.hitMarker;
		hitMarkerColor = other.hitMarkerColor;
		hitMarkerSize = Math.max(HitMarker.MIN_SIZE, Math.min(HitMarker.MAX_SIZE, other.hitMarkerSize));
		hitMarkerDuration = Math.max(100, Math.min(1000, other.hitMarkerDuration));
		hitMarkerStyle = oneOf(other.hitMarkerStyle, HitMarker.STYLES);
		hitMarkerSound = other.hitMarkerSound;
		hitMarkerSoundKind = oneOf(other.hitMarkerSoundKind, HitMarker.SOUNDS);
		hitMarkerVolume = Math.max(0, Math.min(100, other.hitMarkerVolume));
		hitMarkerKill = other.hitMarkerKill;
		hitMarkerKillColor = other.hitMarkerKillColor;
		hitMarkerProjectiles = other.hitMarkerProjectiles;
		hideOwnArmor = other.hideOwnArmor;
		hideOwnHelmet = other.hideOwnHelmet;
		hideOwnChestplate = other.hideOwnChestplate;
		hideOwnLeggings = other.hideOwnLeggings;
		hideOwnBoots = other.hideOwnBoots;
		hideOwnElytra = other.hideOwnElytra;
		customMenu = other.customMenu;
		customPause = other.customPause;
		customServerList = other.customServerList;
		customLoading = other.customLoading;
		loadingTips = other.loadingTips;
		badges = other.badges;
		clanTags = other.clanTags;
		killEffects = other.killEffects;
		killEffectsOthers = other.killEffectsOthers;
		heldSkinsOthers = other.heldSkinsOthers;
		ringEffects = other.ringEffects;
		ringEffectsOthers = other.ringEffectsOthers;
		moveEffects = other.moveEffects;
		moveEffectsOthers = other.moveEffectsOthers;
		sprays = other.sprays;
		spraysOthers = other.spraysOthers;
		scoreboard = other.scoreboard;
		scoreboardScale = other.scoreboardScale;
		scoreboardOffset = other.scoreboardOffset;
		scoreboardNumbers = other.scoreboardNumbers;
		bossBar = other.bossBar;
		bossBarScale = other.bossBarScale;
		bossBarOffset = other.bossBarOffset;
		tabScale = other.tabScale;
		tabNumericPing = other.tabNumericPing;
		tabHideHeader = other.tabHideHeader;
		tabHideFooter = other.tabHideFooter;
		tabMaxPlayers = Math.max(10, Math.min(80, other.tabMaxPlayers == 0 ? 80 : other.tabMaxPlayers));
		titles = other.titles;
		titleScale = other.titleScale;
		actionBar = other.actionBar;
		actionBarScale = other.actionBarScale;
		ownNametag = other.ownNametag;
		clips = other.clips;
		clipSeconds = Math.max(10, Math.min(60, other.clipSeconds));
		replay = other.replay;
		replaySeconds = Math.max(15, Math.min(60, other.replaySeconds));
		replayPause = other.replayPause;
		assistWarned = other.assistWarned;
		autoClicker = other.autoClicker;
		autoClickLeft = other.autoClickLeft;
		autoClickRight = other.autoClickRight;
		cpsMin = Math.max(1, Math.min(20, other.cpsMin));
		cpsMax = Math.max(1, Math.min(20, other.cpsMax));
		autoClickCooldown = other.autoClickCooldown;
		autoClickMobs = other.autoClickMobs;
		autoClickPlayers = other.autoClickPlayers;
		autoTool = other.autoTool;
		autoToolRestore = other.autoToolRestore;
		autoRefill = other.autoRefill;
		holdInScreens = other.holdInScreens;
		toolWarning = other.toolWarning;
		toolWarningPercent = Math.max(1, Math.min(50, other.toolWarningPercent));
		compactHearts = other.compactHearts;
		mouseTweaks = other.mouseTweaks;
		craftFit = other.craftFit;
		inventorySort = other.inventorySort;
		sortDelay = Math.max(0, Math.min(250, other.sortDelay));
		// the old default (50 ms between clicks), never changed by the player: now all at once
		if (other.sortDelayMoved == null && sortDelay == 50) sortDelay = 0;
		sortDelayMoved = true;
		sortHotbar = other.sortHotbar;
		sortButton = other.sortButton;
		chestMove = other.chestMove;
		chestMoveHotbar = other.chestMoveHotbar;
		sortOffServers = other.sortOffServers == null ? "hypixel.net" : other.sortOffServers;
		friendsOnMap = other.friendsOnMap;
		friendsOnMapNames = other.friendsOnMapNames;
		worldMap = other.worldMap;
		worldMapZoom = Math.max(WorldMapScreen.MIN_ZOOM, Math.min(WorldMapScreen.MAX_ZOOM, other.worldMapZoom));
		clockSeconds = other.clockSeconds;
		clock12h = other.clock12h;
		coordsDecimals = Math.max(0, Math.min(2, other.coordsDecimals));
		coordsFacing = other.coordsFacing;
		blockGrowth = other.blockGrowth;
		blockDetails = other.blockDetails;
		blockPower = other.blockPower;
		blockCoords = other.blockCoords;
		blockLight = other.blockLight;
		blockHardness = other.blockHardness;
		blockId = other.blockId;
		blockState = other.blockState;
		blockTool = other.blockTool;
		blockBees = other.blockBees;
		blockShelf = other.blockShelf;
		blockFrames = other.blockFrames;
		blockBestTool = other.blockBestTool;
		fpsColored = other.fpsColored;
		effectIcons = other.effectIcons;
		chatStack = other.chatStack;
		chatCopy = other.chatCopy;
		chatCoords = other.chatCoords;
		chatCopyFormat = oneOf(other.chatCopyFormat, ChatExtras.COPY_FORMATS);
		chatCopyTime = oneOf(other.chatCopyTime, ChatExtras.COPY_TIMES);
		chatCopyNoSender = other.chatCopyNoSender;
		chatCopyNotice = oneOf(other.chatCopyNotice, ChatExtras.COPY_NOTICES);
		chatSearch = other.chatSearch;
		chatScaleExtra = Math.max(1f, Math.min(ChatLook.MAX, other.chatScaleExtra));
		timeChanger = other.timeChanger;
		fixedTime = other.fixedTime;
		freelook = other.freelook;
		waypoints = other.waypoints;
		deathWaypoint = other.deathWaypoint;
		deathScreen = other.deathScreen;
		lightOverlay = other.lightOverlay;
		lightOverlayRadius = Math.max(4, Math.min(32, other.lightOverlayRadius));
		lightOverlayCrops = other.lightOverlayCrops;
		weatherOff = other.weatherOff;
		cameraDistance = other.cameraDistance;
		cameraDistanceKey = other.cameraDistanceKey;
		cameraDistanceDefault = CameraDistance.clamp(other.cameraDistanceDefault);
		cameraDistanceReset = other.cameraDistanceReset;
		screenshotClipboard = other.screenshotClipboard;
		screenshotCaption = other.screenshotCaption;
		screenshotCaptionCorner = oneOf(other.screenshotCaptionCorner, ShotCaption.CORNERS);
		screenshotCaptionCoords = other.screenshotCaptionCoords;
		screenshotCaptionServer = other.screenshotCaptionServer;
		shulkerPreview = other.shulkerPreview;
		inventorySearch = other.inventorySearch;
		slotLock = other.slotLock;
		friendPlayingToasts = other.friendPlayingToasts;
		serverFriends = other.serverFriends;
		liveNametags = other.liveNametags;
		nametagPing = other.nametagPing;
		twitchChat = other.twitchChat == null ? new dev.slash3rss.slashclient.hud.streams.StreamChatSettings() : other.twitchChat.copy();
		kickChat = other.kickChat == null ? new dev.slash3rss.slashclient.hud.streams.StreamChatSettings() : other.kickChat.copy();
		spotify = other.spotify == null ? new dev.slash3rss.slashclient.hud.spotify.SpotifySettings() : other.spotify.copy();
		save();
	}

	/** The value when it is one of `allowed`, else the first (the default). */
	private static String oneOf(String value, String[] allowed) {
		for (String a : allowed) if (a.equals(value)) return value;
		return allowed[0];
	}

	public void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(this));
		} catch (IOException e) {
			SlashHud.LOG.warn("Nie udało się zapisać {}: {}", FILE, e.toString());
		}
	}

	public Placement placement(String id) {
		return modules.computeIfAbsent(id, k -> new Placement(false, 0, 0, 2, 2));
	}

	/** Every setting as the file holds it, for the editor's undo (EditHistory). */
	String snapshot() {
		return GSON.toJson(this);
	}

	/**
	 * Puts back settings taken with snapshot(), every field of them, into this same object: whatever
	 * holds on to the config keeps seeing the HUD as it is now.
	 */
	void restore(String snapshot) {
		HudConfig from = GSON.fromJson(snapshot, HudConfig.class);
		if (from == null) return;
		for (java.lang.reflect.Field f : HudConfig.class.getDeclaredFields()) {
			int mod = f.getModifiers();
			if (java.lang.reflect.Modifier.isStatic(mod) || java.lang.reflect.Modifier.isTransient(mod)) continue;
			try {
				f.setAccessible(true);
				f.set(this, f.get(from));
			} catch (ReflectiveOperationException | RuntimeException e) {
				SlashHud.LOG.warn("Nie udało się cofnąć {}: {}", f.getName(), e.toString());
			}
		}
	}
}
