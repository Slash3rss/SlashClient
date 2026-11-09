package dev.slash3rss.slashclient.hud.config;

import dev.slash3rss.slashclient.hud.camera.CameraDistance;
import dev.slash3rss.slashclient.hud.gamehud.GameParts;
import dev.slash3rss.slashclient.hud.gamehud.HitMarker;
import dev.slash3rss.slashclient.hud.SlashHud;

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
import dev.slash3rss.slashclient.hud.chat.ChatExtras;
import dev.slash3rss.slashclient.hud.chat.ChatLook;
import dev.slash3rss.slashclient.hud.map.WorldMapScreen;
import dev.slash3rss.slashclient.hud.replay.ShotCaption;
import dev.slash3rss.slashclient.hud.servers.ServerPacks;

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
		/** How rounded the background's corners are, in pixels (null = the HUD-wide `cornerRadius`). */
		public Integer radius;
		/** When it shows (HudConfig.SHOW_WHEN; null = always), the server for "server" (a part of its address), and hidden with the chat or another window open. */
		public String showWhen, showServer;
		public boolean hideInChat, hideInScreens;

		public String showWhen() {
			return showWhen == null ? "always" : showWhen;
		}

		/** For Gson, so missing fields keep the defaults above. */
		public Placement() {}

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

		public int radius(HudConfig cfg) {
			return Math.max(0, Math.min(MAX_RADIUS, radius == null ? cfg.cornerRadius : radius));
		}

		public Placement(boolean enabled, float ax, float ay, int dx, int dy) {
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
	/** Cards starred in the settings window (their ids): shown first in every list they are in. */
	public List<String> favoriteModules = new ArrayList<>();
	/** ARGB colour of the text. */
	public int textColor = 0xFFFFFFFF;
	/** The modules' boxes (their see-through is each module's own) and outlines. */
	public int backgroundColor = 0xFF000000, outlineColor = 0xFF60A5FA;
	/** SlashClient's windows' accent (buttons, switches, frames): the launcher's blue, or the player's own colour (ui/Season). */
	public int accentColor = 0xFF3B82F6;
	public boolean background = true;
	/** How rounded the modules' backgrounds (and the keystrokes' keys) are, in pixels; 0 = square, as always. */
	public int cornerRadius = 0;
	public static final int MAX_RADIUS = 8;
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
	/** The dungeon map's size on screen, in pixels (80–400): more map, the text and icons as they are. */
	public int dungeonSize = 120;
	/** Rooms not seen yet drawn from the map SkyUp builds above the dungeon. */
	public boolean dungeonPlan = false;
	/** The full dungeon map shows the grid and the rooms' signs, and D there saves what the map knows to a file. */
	public boolean dungeonDebug = false;
	/** The start room marked on the dungeon map, with an arrow on its edge when it is out of sight. */
	public boolean dungeonStartArrow = true;
	/** The player's own emote watched from the front: the camera turns while it plays, and back after. */
	public boolean emoteCamera = true;
	/** Mobs and NPCs (players with a skin who are not on the tab list) on the dungeon map. */
	public boolean dungeonMobs = true;
	/** How each mob class shows on the dungeon map: "head", "dot" or "hidden". */
	public String dungeonMobNormal = "head", dungeonMobElite = "head", dungeonMobBoss = "head", dungeonMobMinion = "head", dungeonMobOther = "head";
	/** Chests, barrels and pots on the dungeon map, counted per room (taken of all). */
	public boolean dungeonContainers = true;
	/** A card with the trip's summary after leaving a dungeon (and the list of trips kept, DungeonRun). */
	public boolean dungeonSummary = true;
	/** The dungeon map's floor in its blocks' colours instead of one plain grey. */
	public boolean dungeonBlockColors = false;
	/** In a dungeon the mini bosses glow (seen through walls), and the elites too when wanted (BossGlow). */
	public boolean dungeonBossGlow = true, dungeonEliteGlow = false;
	/** Mob names, comma-separated: when any are written, only the mobs with one in their name glow. */
	public String dungeonGlowNames = "";
	/** The kinds of loot counted on the dungeon map (in rooms and under it): chests, barrels, pots, flower pots, deepslate ores. */
	public boolean dungeonChests = true, dungeonBarrels = true, dungeonPots = true, dungeonFlowerPots = true, dungeonOres = true;
	/** Counters under the dungeon map, one per kind of loot. */
	public boolean dungeonCounters = true;
	/** The dungeon's XP as a number on its boss bar ("52/125 xp"). */
	public boolean dungeonXp = true;
	/** Where the counters are: "below" the map, "above" it, "inside" it, along its bottom edge, or "apart" (a module of their own). */
	public String dungeonCountersAt = "below";
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
	/** "square" or "circle". */
	public String dungeonShape = "square";
	/** "detailed" (the floor as seen) or "simple" (each room a tile, doors between them). */
	public String dungeonStyle = "detailed";
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
	/**
	 * The maps' ground: caves ("auto" once underground, "always", "off"), slopes shaded ("relief" or "classic"), darker
	 * at night, the trail walked, kept on disk for the next time (MapStore).
	 */
	public String mapCave = "auto", mapShading = "relief";
	public boolean mapNight = true, mapTrail = true, mapSave = true;
	/** How many minutes the trail walked stays on the maps before it fades away. */
	public int mapTrailMinutes = 5;
	/** The full map's chunk grid and biome view. */
	public boolean worldMapGrid = false, worldMapBiomes = false;
	/** SkyUp's tasks on the HUD: how many at most, one line each, those ready to complete hidden, rewards shown. */
	public int skyTasksMax = 5;
	/** The module's widest, in pixels: longer names are cut with "…". */
	public int skyTasksWidth = 220;
	public boolean skyTasksCompact = false, skyTasksHideDone = false, skyTasksRewards = false;
	/** The tasks nearest to done higher on the HUD, by how much of them is done (else in the order set by hand). */
	public boolean skyTasksNearTop = true;
	/** Every unfinished task tracked (those switched off one by one aside). */
	public boolean skyTasksTrackAll = false;
	/** SkyUp's daily task tracked by itself, each day's new one too (unless taken off the HUD by hand). */
	public boolean skyTasksAutoDaily = true;
	/** The category last open and how many of its tasks are left. */
	public boolean skyTasksTierCount = true;
	/** On joining SkyUp, a line saying the tasks GUI loads the progress. */
	public boolean skyTasksJoinHint = true;
	/** Rows too long for the tasks module slide along instead of ending with "…". */
	public boolean skyTasksScroll = true;
	/** Under a mob to summon: its shamanism recipe (wand, main item, level) and the materials still missing. */
	public boolean skyTasksShaman = true;
	/** How the challenges' window marks a task ready or handed in: a frame round the slot, or its background behind the item. */
	public String skyTasksMark = "frame";
	public static final String[] SKY_TASKS_MARKS = { "frame", "background" };
	public static final String[] ARMOR_DURABILITY = { "number", "percent", "bar" }, DURABILITY_FORMATS = { "number", "percent" };
	/** How often the daily task, while tracked and not done, is brought up (minutes); 0 = never. */
	public int skyDailyRemind = 30;
	/** The daily task reminder's sound: "default" (the bell), "none", or one of the chat tabs' (ChatTabs.SOUNDS). */
	public String skyDailySound = "default";
	/**
	 * On SkyUp, how often the daily bonus is brought up while today's is not seen taken (minutes; 0 = never): not
	 * only on joining, as many take it later (its jobs' bonus runs from when it is taken).
	 */
	public int skyBonusEvery = 60;
	/** SkyUp's plan of the week: how many coming events the module lists. */
	public int skyPlanRows = 3;
	/** How many minutes before an event of the plan the banner says it starts (0 = no banner). */
	public int skyPlanRemind = 5;
	/** Which of the plan's kinds the banner is for: SkyUp's events, its fishing contests, its boss arena. */
	public boolean skyPlanEvents = true, skyPlanFishing = true, skyPlanBoss = true;
	/** The plan's banner sound: "default" (the bell), "none", or one of the chat tabs' (ChatTabs.SOUNDS). */
	public String skyPlanSound = "default";
	/** How the plan says when today's events start: "relative" (za 45 min), "clock" (19:00) or "both" (za 45 min (19:00)). */
	public String skyPlanTime = "both";
	/** minecraft.wiki in the game read in English although the game is in a language the wiki also has. */
	public boolean mcWikiEnglish;
	public static final String[] SKY_PLAN_TIMES = { "relative", "clock", "both" };
	/** SkyUp's fish counter: split by "none", "size", "species" or "quality"; their weight and value shown. */
	public String skyFishSplit = "none";
	public boolean skyFishWeight = true, skyFishValue = true;
	/** Minutes without a catch that end a fishing trip (the next fish starts a new one). */
	public int skyFishPause = 10;
	/** SkyUp's case counter: "recent" drops, the "top" rewards of the case shown, or its "summary" only; how many rows. */
	public String skyCaseLayout = "recent";
	public static final String[] SKY_CASE_LAYOUTS = { "recent", "top", "summary" };
	/** The latest wins as their names, their items' icons in a row, or both (an icon before each name). */
	public String skyCaseRecentShow = "name";
	public static final String[] SKY_CASE_RECENT = { "name", "icon", "both" };
	public int skyCaseRows = 5;
	/** A toast when a case gives a reward never won before. */
	public boolean skyCaseNewDrop = true;
	/** SkyUp's resource pack kept up to date in the player's resource packs; switched on there, SkyUp's offer is not asked about (SkyPack). */
	public boolean skyPackLocal = true;
	/** The job hats inside SkyUp's "Kapelusz pracusia", with the XP left in each, in its tooltip (SkyHats). */
	public boolean skyHats = true;
	/** Seconds a case's preview (or a win only it gives) counts as the case being opened, for rewards more cases give. */
	public int skyCaseWindow = 60;
	/** Rewards summed by item ("4x Diament" counts as 4 Diament): the detail window grouped, the top rewards in pieces. */
	public boolean skyCaseSum = false;
	/** SkyUp's wardrobe module: the worn items' names beside them (else only their pictures in a row), and the wardrobe's two switches. */
	public boolean skyWardrobeNames = false, skyWardrobeStatus = true;
	/**
	 * SkyUp's XP calculator, as last set: the level bottled (or a number of bottles), the XP in one
	 * bottle, the clock between two throws (s), the mending assistant's choice, and the countdown's sounds.
	 */
	public int skyXpLevel = 30, skyXpBottles = 64, skyXpBottle = 52, skyXpInterval = 12;
	public boolean skyXpFromLevel = true, skyXpMuted = false;
	public int skyXpGens = 8, skyXpUnbreakingLevel = 3;
	/** The assistant's old choice ("16x", "IV"), read once into the numbers above. */
	public String skyXpGenerators, skyXpUnbreaking;
	/** How much health a mob or player just lost, rising from it. */
	public boolean damageNumbers = true;
	/** How big the damage numbers are (1: the game's text). */
	public float damageNumbersScale = 1f;
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
	/**
	 * How loud (%) SlashClient's sounds are (Sounds): all of them at once, then each module's own — a mention in chat,
	 * the warning before a tool breaks, SkyUp's bottling countdown, daily task and plan reminders.
	 */
	public int soundVolume = 100, chatMentionVolume = 70, toolWarningVolume = 80, skyXpVolume = 100, skyDailyVolume = 70, skyPlanVolume = 70;
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
	/**
	 * A potion drunk running out (PotionEnd): where it is told, how many seconds before its end (0: at the end), the
	 * sound and how loud (%).
	 */
	public boolean potionEnd = true;
	public String potionEndPlace = "toast", potionEndSound = "pling";
	public int potionEndWarn = 0, potionEndVolume = 70;
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
	/** Other players' clan tags too: off, only your own shows (with clanTags on). */
	public boolean clanTagsOthers = true;
	/** Other players' SlashClient cosmetics at all (capes, wings, clothes, pets, effects, emotes); ours always show. */
	public boolean cosmeticsOthers = true;
	/** Skins that players with offline accounts set in the launcher (OfflineSkins); off: the game's own skin. */
	public boolean offlineSkins = true;
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
	/** The seasonal look of the menus and the loading screen (Halloween, ui/Season). */
	public boolean seasonalLook = true;
	/** The game's own windows in dark grey (ui/DarkGui); off unless switched on. */
	public boolean darkGui;
	/** How dark: "dark" (dark grey) or "darker" (nearly black). */
	public String darkGuiShade = "dark";
	/** The windows' block parts made of their blocks (ui/BlockWindows); off unless switched on. */
	public boolean blockWindows;
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
	/** The tab list's backgrounds, 0–100 % opaque: under each player (the game's 13 %) and the whole list (its 50 %). */
	public int tabRowOpacity = TAB_ROW_DEFAULT, tabPanelOpacity = TAB_PANEL_DEFAULT;
	public static final int TAB_ROW_DEFAULT = 13, TAB_PANEL_DEFAULT = 50;
	public boolean titles = true;
	public float titleScale = 1f;
	/** The action bar above the hotbar (a server's short messages). */
	public boolean actionBar = true;
	public float actionBarScale = 1f;
	/** The colour of SlashClient's own messages there ("Fullbright on"). */
	public int actionBarColor = 0xFF60A5FA;
	/** Your own name above your head in third person (F5). */
	public boolean ownNametag = false;
	/** Clips: the last seconds of the screen in memory, saved with a key (off: it costs memory and a little CPU). */
	public boolean clips = false;
	public int clipSeconds = 30;
	/** The clips' (and the instant replay's) size, at most this wide ("480p" … "1440p", "native": the window's), and frames a second. */
	public String clipResolution = "720p";
	public int clipFps = 30;
	public static final String[] CLIP_RESOLUTIONS = { "480p", "720p", "1080p", "1440p", "native" };
	public static final String[] CLIP_FPS = { "20", "30", "60" };
	/** Instant replay (Replay): a key shows the last seconds in the game; it keeps the clips' frames, so it takes the same memory. */
	public boolean replay = false;
	public int replaySeconds = 30;
	/** Singleplayer stops while the replay is watched. */
	public boolean replayPause = true;

	// ---- helpers (see Assist) ----
	/** The player has read that servers may ban for the automatic helpers. */
	public boolean assistWarned = false;
	public boolean autoClicker = false;
	/** "hold": it clicks while the player holds the mouse button; "toggle": its key starts and stops clicking on its own. */
	public String autoClickMode = "hold";
	public static final String[] AUTO_CLICK_MODES = { "hold", "toggle" };
	public boolean autoClickLeft = true;
	public boolean autoClickRight = false;
	/** Each button's clicks a second, steady. */
	public int autoClickCps = 10;
	public int autoClickRightCps = 10;
	/** In the toggle mode it jumps too, this many times a second (held, the space bar held jumps on its own). */
	public boolean autoClickJump = false;
	public int autoClickJumps = 2;
	/** The left button is not clicked while the player's own shield is up. */
	public boolean autoClickShield = true;
	/** In a chest's or a server's window (selling, buying) it clicks the slot under the mouse. */
	public boolean autoClickContainers = true;
	/** With a mob under the crosshair the left button waits for full hits (the weapon charged); at the rest, the CPS. */
	public boolean autoClickCooldown = false;
	/** Left clicks only with a mob under the crosshair (never at a player either way). */
	public boolean autoClickMobs = false;
	public static final String[] AUTO_CLICK_TARGETS = { "all", "mobs" };
	public boolean autoTool = false;
	/**
	 * What auto tool takes into the hand: the tool for digging, the hardest-hitting weapon for a hit,
	 * and for a right click on a mob shears, a bucket or a bowl (milk, stew), a water bucket (fish),
	 * a brush (armadillo) and an animal's food.
	 */
	/** The weapon auto tool takes for a hit: the "strongest", or the best "sword" or "axe" there is (the strongest when there is none). */
	public String autoToolWeapon = "strongest";
	public static final String[] AUTO_TOOL_WEAPONS = { "strongest", "sword", "axe" };
	/** The tool auto tool takes for blocks more than one kind digs: the "fastest", or the kind preferred (when there is one of it). */
	public String autoToolLeaves = "fastest", autoToolCobweb = "fastest", autoToolBamboo = "fastest", autoToolGourds = "fastest";
	public static final String[] AUTO_TOOL_LEAVES = { "fastest", "shears", "hoe" }, AUTO_TOOL_COBWEB = { "fastest", "sword", "shears" },
		AUTO_TOOL_BAMBOO = { "fastest", "sword", "axe" }, AUTO_TOOL_GOURDS = { "fastest", "axe", "sword" };
	/** What a mooshroom gives: "any" (a bowl or a bucket, whichever is found first), its "stew" or its "milk". */
	public String autoToolMooshroom = "any";
	public static final String[] AUTO_TOOL_MOOSHROOM = { "any", "stew", "milk" };
	/**
	 * In a fight (a mob or a player hit a moment ago, or a hostile mob close by) a block clicked by a miss
	 * does not take the weapon out of the hand: only a block dug on for a while does.
	 */
	public boolean autoToolFight = true;
	public boolean autoToolBlocks = true, autoToolWeapons = true, autoToolShears = true, autoToolMilk = true, autoToolFish = true, autoToolBrush = true, autoToolFeed = false;
	public boolean autoRefill = false;
	/** The hand refilled from another hotbar slot too, when the backpack has none of it. */
	public boolean autoRefillHotbar = true;
	/** Buttons held by their keys go on with the inventory or the pause menu open. */
	public boolean holdInScreens = true;
	/** The right button held by its key places as fast as a held keyboard key (a click every tick), not every 4 ticks. */
	public boolean holdUseFast = false;
	public boolean toolWarning = true;
	public int toolWarningPercent = 10;
	/** The tool warning's sound (Sounds.NOTICE; "pling" as it always rang). */
	public String toolWarningSound = "pling";
	/** Health above 10 hearts in one row, each 10 hearts more in another colour. */
	public boolean compactHearts = true;
	/** Food held: what eating it gives, on the food bar (FoodPreview). */
	public boolean foodPreview = true;
	/** The food module's parts (FoodPreview): food values in tooltips, saturation always on the food bar, the exhaustion bar, health eating would heal, F3's lines. */
	public boolean foodTooltip = true, foodSaturation = true, foodExhaustion = true, foodHealth = true, foodDebug = true;
	/** SkyUp's GUI dump on its key (F7; SkyDump). */
	public boolean skyDump = true;
	/** Shift-drag over slots and the wheel move items in inventories. */
	public boolean mouseTweaks = true;
	/** Shift-clicking a crafting result crafts only what fits, with room kept for what stays on the grid (CraftFit). */
	public boolean craftFit = true;
	/** One-click crafting (QuickCraft): on, Alt or Ctrl held turn it off for a click, the drop key held throws the result. */
	public boolean quickCraft = false, quickCraftAlt = true, quickCraftCtrl = false, quickCraftDrop = true;
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
	/** Block info: a bar along its bottom with how far the block being dug is broken. */
	public boolean blockBreakBar = true;
	/** FPS green, yellow or red by how smooth the game runs. */
	public boolean fpsColored = false;
	public boolean effectIcons = true;
	/** FPS, ping, memory, processor and graphics card: where green ends and where red begins (yellow in between). */
	public int fpsGood = 60, fpsBad = 20, pingGood = 60, pingBad = 250, memoryGood = 60, memoryBad = 95, cpuGood = 60, cpuBad = 90, gpuGood = 70, gpuBad = 95;
	public int speedDecimals = 1;
	/** Coordinates: the facing after the numbers instead of under them, and the height among them. */
	public boolean coordsOneLine = false, coordsY = true;
	/** Armour: side by side instead of one under another, and the item in the hand too; wear left as a "number", a "percent" or the game's "bar". */
	public boolean armorHorizontal = false, armorHand = true;
	public String armorDurability = "number";
	/** The item in hand's wear: "number" (left/max) or "percent", the bar under it, and under what share it blinks red. */
	public String durabilityFormat = "number";
	public boolean durabilityBar = true;
	public int durabilityWarn = 10;
	/** Keystrokes: a pressed key's colour, and whether the mouse buttons, their CPS and the space bar show. */
	public int keystrokesPressed = 0xFFFFFFFF;
	public boolean keystrokesMouse = true, keystrokesCps = true, keystrokesSpace = true;
	/** The target's health bar and how far it is. */
	public boolean targetBar = true, targetDistance = true;
	/** The item counter: which groups it counts, the item in hand too, and the player's own items ("cobblestone, tnt"). */
	public boolean itemsArrows = true, itemsPearls = true, itemsTotems = true, itemsGapples = true, itemsXp = true, itemsFireworks = true, itemsPotions = false, itemsHeld = false;
	public String itemsCustom = "";
	/** More of the modules' own options: the clock's date, the day's number and the night's warning, the biome's colour and id, light's warning level and its two kinds, the weather's time left, the session from the game's start, TPS's colours, the FPS graph's length and range, the elytra's rockets and warning. */
	public boolean clockDate = false, daytimeDay = true, daytimeWarn = false, biomeColored = false, biomeId = false, lightSplit = false, skyWeatherTime = true, sessionWholeGame = false, fpsGraphMinMax = false, elytraRockets = true, elytraWarn = true;
	public int lightWarn = 0, tpsGood = 19, tpsBad = 12, fpsGraphSamples = 90;
	/** The compass's target: none, the nearest waypoint, the last death, or the waypoint named `compassTargetName`. */
	public String compassTarget = "none", compassTargetName = "";
	public static final String[] COMPASS_TARGETS = { "none", "nearest", "death", "named" };
	/** When a module shows: always, in singleplayer, on servers, on the server named in its `showServer`. */
	public static final String[] SHOW_WHEN = { "always", "single", "multi", "server" };
	/** The compass's degrees under where you look. */
	public boolean compassDegrees = true;
	/** The most friends online the friends module lists. */
	public int friendsRows = 5;
	/** The backpack module with the hotbar under it too. */
	public boolean inventoryHotbar = false;

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
	/** The chat keeps more than the game's 100 lines (and sent messages): this many (100, the game's own, to 16 000). */
	public boolean chatLongHistory = true;
	public int chatHistoryLines = 1000;
	/** The chat stays on leaving a server (the game empties it). */
	public boolean chatKeep = true;
	/** The chat bigger than the game's largest chat scale: the game's scale times this, 1 to 1.5 (see ChatLook). */
	public float chatScaleExtra = 1f;

	// ---- more extras ----
	/** Your own time of day, only for you; the server's time stays as it is. */
	public boolean timeChanger = false;
	public int fixedTime = 6000;
	/** Hold the key to look around without turning (off by default: some servers forbid it). */
	public boolean freelook = false;
	/** The view locked by its key, or by itself on coming back from another window (LookLock). */
	public boolean lookLock = false;
	public String lookLockOnReturn = "holding";
	/** The camera turned by where the cursor is, for a remote desktop (VncMouse); how fast the window's edges turn it. */
	public boolean vncMouse = false;
	public String vncMouseEdge = "normal";
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
	/** Enchantments' names coloured by how high their level is (EnchantColors). */
	public boolean enchantColors = true;
	/** A search box over inventories and chests (InventorySearch). */
	public boolean inventorySearch = true;
	/** Locked hotbar slots keep their items (SlotLock); which ones, a bit for each slot. */
	public boolean slotLock = true;
	public int lockedSlots = 0;
	/** From before each kind had its own switch: off, the online and playing toasts start off. */
	public boolean friendPlayingToasts = true;
	/**
	 * SlashClient's toasts: all of them, and each kind on its own (muted friends never make one); with the
	 * launcher's status "Nie przeszkadzać", none from friends and communities when `toastDnd` is on (the game's own still come).
	 */
	public boolean toasts = true, toastMessages = true, toastOnline = true, toastPlaying = true, toastLive = true, toastInvites = true,
		toastCommunities = true, toastAchievements = true, toastErrors = true, toastOther = true, toastDnd = true;
	/** A sound with SlashClient's notifications (Sounds.NOTICE; none, as before) and how loud (%). */
	public String toastSound = "none";
	public int toastVolume = 70;
	/** Faces of friends playing on a server next to it in the server list (ServerFriends). */
	public boolean serverFriends = true;
	/** This game's status on Discord (the launcher shows the game in use of those that allow it). */
	public boolean discordStatus = true;
	/** "● NA ŻYWO" above SlashClient players live on Twitch or Kick with Minecraft (Badges.liveLabel). */
	public boolean liveNametags = true;
	/** Other players' ping after their name above the head, on servers (NametagPing). */
	public boolean nametagPing = false;
	/** The live chats of a Twitch and a Kick channel on the HUD (see StreamChatModule). */
	public dev.slash3rss.slashclient.hud.streams.StreamChatSettings twitchChat = new dev.slash3rss.slashclient.hud.streams.StreamChatSettings();
	public dev.slash3rss.slashclient.hud.streams.StreamChatSettings kickChat = new dev.slash3rss.slashclient.hud.streams.StreamChatSettings();
	/** "Now playing" (see NowPlayingModule; "spotify" from when it showed only Spotify): what shows and how. */
	public dev.slash3rss.slashclient.hud.nowplaying.NowPlayingSettings spotify = new dev.slash3rss.slashclient.hud.nowplaying.NowPlayingSettings();

	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-hud.json");

	public static HudConfig defaults() {
		HudConfig c = new HudConfig();
		// left column, one text line (14 px) apart
		// the dungeon map on the left, beside the keystrokes (not over them); it shows only in a dungeon
		c.modules.put("dungeonmap", new Placement(true, 0f, 0.55f, 80, 0));
		// its loot counters on their own (only when set apart from the map), over it
		c.modules.put("dungeonloot", new Placement(true, 0f, 0.5f, 80, 0));
		// the XP got in a dungeon, on the right a quarter down (the map and the counters are on the left)
		c.modules.put("dungeonxp", new Placement(true, 1f, 0.25f, -2, 0));
		// SkyUp's tasks on the left, under the usual top-left modules and above the dungeon map (the right side has
		// the effects, CPU/GPU and the scoreboard); shown only with tasks to show
		c.modules.put("skytasks", new Placement(true, 0f, 0.3f, 2, 0));
		// the fish counter lower on the right; shown once a fish was caught on SkyUp
		c.modules.put("skyfish", new Placement(true, 1f, 0.75f, -2, 0));
		// the case counter above it; shown once a case was opened on SkyUp
		c.modules.put("skycase", new Placement(true, 1f, 0.55f, -2, 0));
		// the wardrobe above the case counter; shown once SkyUp's wardrobe window was opened
		c.modules.put("skywardrobe", new Placement(true, 1f, 0.35f, -2, 0));
		// SkyUp's bottling countdown in the middle of the top; shown only while one runs
		c.modules.put("skyxp", new Placement(true, 0.5f, 0.12f, 0, 0));
		// the shamanism recipes tracked on the left at the dungeon map's height (never both: no summons in a dungeon);
		// shown only with one tracked
		c.modules.put("skyshaman", new Placement(true, 0f, 0.55f, 2, 0));
		// SkyUp's plan of the week under the wardrobe on the right; shown on SkyUp only
		c.modules.put("skyplan", new Placement(true, 1f, 0.2f, -2, 0));
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
		c.modules.put("pinggraph", new Placement(false, 0, 0, 2, 120));
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
		// the attack indicator where the game draws it, under the crosshair (shown with our crosshair only)
		c.modules.put("attackindicator", new Placement(true, 0.5f, 0.5f, 0, 17));
		c.modules.put("combo", new Placement(false, 0.5f, 0.5f, 30, 12));
		c.modules.put("reach", new Placement(false, 0.5f, 0.5f, -30, 12));
		c.modules.put("sprint", new Placement(false, 0, 1, 2, -2));
		c.modules.put("keystrokes", new Placement(true, 0, 0.5f, 2, 20));
		c.modules.put("movement", new Placement(false, 0, 0.5f, 2, -2));
		// a stream's chat at the top on the left, beside the column of FPS and coordinates: lower down it covered the
		// keystrokes (and the game's chat under them); off until a channel is set
		c.modules.put("twitchchat", new Placement(false, 0, 0, 104, 2));
		// the other stream's chat lower on the right, clear of the first one at the top in a small window
		c.modules.put("kickchat", new Placement(false, 1, 0.75f, -2, 0));
		// what plays on this computer on the right, between the effects and the armour; off until switched on
		c.modules.put("spotify", new Placement(false, 1, 0.3f, -2, 0));
		// the backpack's slots low on the right, above the item counter; off until switched on
		c.modules.put("inventory", new Placement(false, 1, 0.8f, -2, 0));
		c.chatTabs.add(new ChatTab("@", false, "{nick}"));
		// private messages look different on every server; these catch the common ones
		c.chatTabs.add(new ChatTab("PM", true, "(?i)(whispers to you|szepcze|\\[msg\\]|-> ?(me|ja)\\b|\\bfrom \\w+:)"));
		// a slower computer (the launcher's saving mode): only the game's own parts on to begin with, SlashClient's
		// modules off until switched on
		if (SlashHud.saver()) for (var e : c.modules.entrySet()) if (!GameParts.IDS.contains(e.getKey())) e.getValue().enabled = false;
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

	/** The mending assistant's choice from before it took any numbers ("16x", "IV"), kept once over. */
	private static void skyXpOld(HudConfig c) {
		if (c.skyXpGenerators != null) c.skyXpGens = "16x".equals(c.skyXpGenerators) ? 16 : 8;
		// (List.of's indexOf does not take null)
		int old = c.skyXpUnbreaking == null ? -1 : java.util.List.of("III", "IV", "V", "VI").indexOf(c.skyXpUnbreaking);
		if (old >= 0) c.skyXpUnbreakingLevel = old + 3;
		c.skyXpGenerators = c.skyXpUnbreaking = null;
	}

	/** Settings from an older version or a share code: whatever is missing gets its default. */
	public static HudConfig fillMissing(HudConfig read) {
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
		read.darkGuiShade = oneOf(read.darkGuiShade, dev.slash3rss.slashclient.hud.ui.DarkGui.SHADES);
		if (read.skyFishSplit == null) read.skyFishSplit = defaults.skyFishSplit;
		if (read.sortOffServers == null) read.sortOffServers = defaults.sortOffServers;
		read.skyCaseLayout = oneOf(read.skyCaseLayout, SKY_CASE_LAYOUTS);
		read.skyCaseRecentShow = oneOf(read.skyCaseRecentShow, SKY_CASE_RECENT);
		read.chatCopyFormat = oneOf(read.chatCopyFormat, ChatExtras.COPY_FORMATS);
		read.chatCopyTime = oneOf(read.chatCopyTime, ChatExtras.COPY_TIMES);
		read.chatCopyNotice = oneOf(read.chatCopyNotice, ChatExtras.COPY_NOTICES);
		read.serverPackDefault = oneOf(read.serverPackDefault, ServerPacks.MODES);
		read.screenshotCaptionCorner = oneOf(read.screenshotCaptionCorner, ShotCaption.CORNERS);
		read.hitMarkerStyle = oneOf(read.hitMarkerStyle, HitMarker.STYLES);
		read.hitMarkerSoundKind = dev.slash3rss.slashclient.hud.Sounds.valid(read.hitMarkerSoundKind, HitMarker.SOUNDS);
		read.mapCave = oneOf(read.mapCave, dev.slash3rss.slashclient.hud.map.MinimapTerrain.CAVE_MODES);
		read.mapShading = oneOf(read.mapShading, dev.slash3rss.slashclient.hud.map.MinimapTerrain.SHADINGS);
		read.potionEndPlace = oneOf(read.potionEndPlace, dev.slash3rss.slashclient.hud.gamehud.PotionEnd.PLACES);
		read.potionEndSound = dev.slash3rss.slashclient.hud.Sounds.valid(read.potionEndSound, dev.slash3rss.slashclient.hud.gamehud.PotionEnd.SOUNDS);
		read.twitchChat = read.twitchChat == null ? defaults.twitchChat : read.twitchChat.checked();
		read.kickChat = read.kickChat == null ? defaults.kickChat : read.kickChat.checked();
		read.spotify = read.spotify == null ? defaults.spotify : read.spotify.checked();
		skyXpOld(read);
		return read;
	}

	/** Takes over everything from `other` (a pasted code) and saves. */
	public void copyFrom(HudConfig other) {
		modules = other.modules;
		chatTabs = other.chatTabs;
		favoriteModules = other.favoriteModules == null ? new ArrayList<>() : new ArrayList<>(other.favoriteModules);
		textColor = other.textColor;
		backgroundColor = other.backgroundColor;
		outlineColor = other.outlineColor;
		accentColor = other.accentColor | 0xFF000000;
		background = other.background;
		cornerRadius = Math.max(0, Math.min(MAX_RADIUS, other.cornerRadius));
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
		dungeonSize = other.dungeonSize;
		dungeonPlan = other.dungeonPlan;
		dungeonDebug = other.dungeonDebug;
		dungeonStartArrow = other.dungeonStartArrow;
		emoteCamera = other.emoteCamera;
		dungeonMobs = other.dungeonMobs;
		dungeonMobNormal = "skull".equals(other.dungeonMobNormal) ? "head" : other.dungeonMobNormal;
		dungeonMobElite = "skull".equals(other.dungeonMobElite) ? "head" : other.dungeonMobElite;
		dungeonMobBoss = "skull".equals(other.dungeonMobBoss) ? "head" : other.dungeonMobBoss;
		dungeonMobMinion = "skull".equals(other.dungeonMobMinion) ? "head" : other.dungeonMobMinion;
		dungeonMobOther = "skull".equals(other.dungeonMobOther) ? "head" : other.dungeonMobOther;
		dungeonContainers = other.dungeonContainers;
		dungeonSummary = other.dungeonSummary;
		dungeonBlockColors = other.dungeonBlockColors;
		dungeonBossGlow = other.dungeonBossGlow;
		dungeonEliteGlow = other.dungeonEliteGlow;
		dungeonGlowNames = other.dungeonGlowNames == null ? "" : other.dungeonGlowNames;
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
		dungeonXp = other.dungeonXp;
		dungeonCountersAt = java.util.List.of("below", "above", "inside", "apart").contains(other.dungeonCountersAt) ? other.dungeonCountersAt : "below";
		dungeonOresOff = other.dungeonOresOff;
		dungeonCleared = other.dungeonCleared;
		dungeonNoSpawner = other.dungeonNoSpawner;
		dungeonFollow = other.dungeonFollow;
		dungeonShape = other.dungeonShape;
		dungeonStyle = other.dungeonStyle;
		minimapSize = other.minimapSize;
		minimapZoom = other.minimapZoom;
		minimapShape = other.minimapShape;
		minimapRotate = other.minimapRotate;
		minimapCoords = other.minimapCoords;
		minimapWaypoints = other.minimapWaypoints;
		mapPlayers = other.mapPlayers;
		mapHostile = other.mapHostile;
		mapPassive = other.mapPassive;
		mapCave = oneOf(other.mapCave, dev.slash3rss.slashclient.hud.map.MinimapTerrain.CAVE_MODES);
		mapShading = oneOf(other.mapShading, dev.slash3rss.slashclient.hud.map.MinimapTerrain.SHADINGS);
		mapNight = other.mapNight;
		mapTrail = other.mapTrail;
		mapTrailMinutes = Math.max(dev.slash3rss.slashclient.hud.map.MapTrail.MIN_MINUTES, Math.min(dev.slash3rss.slashclient.hud.map.MapTrail.MAX_MINUTES, other.mapTrailMinutes));
		mapSave = other.mapSave;
		worldMapGrid = other.worldMapGrid;
		worldMapBiomes = other.worldMapBiomes;
		skyTasksMax = Math.max(1, Math.min(10, other.skyTasksMax));
		skyTasksWidth = Math.max(100, Math.min(320, other.skyTasksWidth));
		skyTasksCompact = other.skyTasksCompact;
		skyDailyRemind = Math.max(0, Math.min(240, other.skyDailyRemind));
		skyDailySound = other.skyDailySound == null ? "default" : other.skyDailySound;
		skyBonusEvery = Math.max(0, Math.min(240, other.skyBonusEvery));
		skyPlanRows = Math.max(1, Math.min(8, other.skyPlanRows));
		skyPlanRemind = Math.max(0, Math.min(60, other.skyPlanRemind));
		skyPlanEvents = other.skyPlanEvents;
		skyPlanFishing = other.skyPlanFishing;
		skyPlanBoss = other.skyPlanBoss;
		skyPlanSound = other.skyPlanSound == null ? "default" : other.skyPlanSound;
		skyPlanTime = java.util.Arrays.asList(SKY_PLAN_TIMES).contains(other.skyPlanTime) ? other.skyPlanTime : "both";
		mcWikiEnglish = other.mcWikiEnglish;
		skyTasksScroll = other.skyTasksScroll;
		skyTasksShaman = other.skyTasksShaman;
		skyTasksMark = oneOf(other.skyTasksMark, SKY_TASKS_MARKS);
		skyTasksHideDone = other.skyTasksHideDone;
		skyTasksNearTop = other.skyTasksNearTop;
		skyTasksRewards = other.skyTasksRewards;
		skyTasksTrackAll = other.skyTasksTrackAll;
		skyTasksAutoDaily = other.skyTasksAutoDaily;
		skyTasksTierCount = other.skyTasksTierCount;
		skyTasksJoinHint = other.skyTasksJoinHint;
		skyFishSplit = other.skyFishSplit == null ? "none" : other.skyFishSplit;
		skyFishWeight = other.skyFishWeight;
		skyFishValue = other.skyFishValue;
		skyFishPause = Math.max(1, Math.min(60, other.skyFishPause));
		skyCaseLayout = oneOf(other.skyCaseLayout, SKY_CASE_LAYOUTS);
		skyCaseRecentShow = oneOf(other.skyCaseRecentShow, SKY_CASE_RECENT);
		skyCaseRows = Math.max(1, Math.min(10, other.skyCaseRows));
		skyCaseNewDrop = other.skyCaseNewDrop;
		skyWardrobeNames = other.skyWardrobeNames;
		skyWardrobeStatus = other.skyWardrobeStatus;
		skyXpLevel = Math.max(0, Math.min(99_999, other.skyXpLevel));
		skyXpBottles = Math.max(1, Math.min(99_999, other.skyXpBottles));
		skyXpBottle = Math.max(1, Math.min(99_999, other.skyXpBottle));
		skyXpInterval = Math.max(1, Math.min(99_999, other.skyXpInterval));
		skyXpFromLevel = other.skyXpFromLevel;
		skyXpMuted = other.skyXpMuted;
		skyXpOld(other);
		skyXpGens = Math.max(1, Math.min(999, other.skyXpGens));
		skyXpUnbreakingLevel = Math.max(0, Math.min(255, other.skyXpUnbreakingLevel));
		skyPackLocal = other.skyPackLocal;
		skyHats = other.skyHats;
		skyCaseWindow = Math.max(5, Math.min(600, other.skyCaseWindow));
		skyCaseSum = other.skyCaseSum;
		damageNumbers = other.damageNumbers;
		damageNumbersScale = other.damageNumbersScale == 0 ? 1f : other.damageNumbersScale;
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
		soundVolume = Math.max(0, Math.min(100, other.soundVolume));
		chatMentionVolume = Math.max(0, Math.min(100, other.chatMentionVolume));
		toolWarningVolume = Math.max(0, Math.min(100, other.toolWarningVolume));
		skyXpVolume = Math.max(0, Math.min(100, other.skyXpVolume));
		skyDailyVolume = Math.max(0, Math.min(100, other.skyDailyVolume));
		skyPlanVolume = Math.max(0, Math.min(100, other.skyPlanVolume));
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
		hitMarkerSoundKind = dev.slash3rss.slashclient.hud.Sounds.valid(other.hitMarkerSoundKind, HitMarker.SOUNDS);
		hitMarkerVolume = Math.max(0, Math.min(100, other.hitMarkerVolume));
		potionEnd = other.potionEnd;
		potionEndPlace = oneOf(other.potionEndPlace, dev.slash3rss.slashclient.hud.gamehud.PotionEnd.PLACES);
		potionEndSound = dev.slash3rss.slashclient.hud.Sounds.valid(other.potionEndSound, dev.slash3rss.slashclient.hud.gamehud.PotionEnd.SOUNDS);
		potionEndWarn = Math.max(0, Math.min(60, other.potionEndWarn));
		potionEndVolume = Math.max(0, Math.min(100, other.potionEndVolume));
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
		seasonalLook = other.seasonalLook;
		darkGui = other.darkGui;
		darkGuiShade = other.darkGuiShade;
		blockWindows = other.blockWindows;
		customPause = other.customPause;
		customServerList = other.customServerList;
		customLoading = other.customLoading;
		loadingTips = other.loadingTips;
		badges = other.badges;
		clanTags = other.clanTags;
		clanTagsOthers = other.clanTagsOthers;
		killEffects = other.killEffects;
		killEffectsOthers = other.killEffectsOthers;
		cosmeticsOthers = other.cosmeticsOthers;
		offlineSkins = other.offlineSkins;
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
		tabRowOpacity = Math.max(0, Math.min(100, other.tabRowOpacity));
		tabPanelOpacity = Math.max(0, Math.min(100, other.tabPanelOpacity));
		titles = other.titles;
		titleScale = other.titleScale;
		actionBar = other.actionBar;
		actionBarScale = other.actionBarScale;
		actionBarColor = other.actionBarColor == 0 ? 0xFF60A5FA : other.actionBarColor;
		ownNametag = other.ownNametag;
		clips = other.clips;
		clipSeconds = Math.max(10, Math.min(60, other.clipSeconds));
		clipResolution = oneOf(other.clipResolution, CLIP_RESOLUTIONS);
		clipFps = other.clipFps == 20 || other.clipFps == 60 ? other.clipFps : 30;
		replay = other.replay;
		replaySeconds = Math.max(15, Math.min(60, other.replaySeconds));
		replayPause = other.replayPause;
		assistWarned = other.assistWarned;
		autoClicker = other.autoClicker;
		autoClickLeft = other.autoClickLeft;
		autoClickRight = other.autoClickRight;
		autoClickMode = oneOf(other.autoClickMode, AUTO_CLICK_MODES);
		autoClickCps = Math.max(1, Math.min(20, other.autoClickCps));
		autoClickRightCps = Math.max(1, Math.min(20, other.autoClickRightCps));
		autoClickJump = other.autoClickJump;
		autoClickJumps = Math.max(1, Math.min(10, other.autoClickJumps));
		autoClickShield = other.autoClickShield;
		autoClickCooldown = other.autoClickCooldown;
		autoClickContainers = other.autoClickContainers;
		autoClickMobs = other.autoClickMobs;
		autoTool = other.autoTool;
		autoToolBlocks = other.autoToolBlocks;
		autoToolFight = other.autoToolFight;
		autoToolWeapons = other.autoToolWeapons;
		autoToolWeapon = oneOf(other.autoToolWeapon, AUTO_TOOL_WEAPONS);
		autoToolLeaves = oneOf(other.autoToolLeaves, AUTO_TOOL_LEAVES);
		autoToolCobweb = oneOf(other.autoToolCobweb, AUTO_TOOL_COBWEB);
		autoToolBamboo = oneOf(other.autoToolBamboo, AUTO_TOOL_BAMBOO);
		autoToolGourds = oneOf(other.autoToolGourds, AUTO_TOOL_GOURDS);
		autoToolMooshroom = oneOf(other.autoToolMooshroom, AUTO_TOOL_MOOSHROOM);
		autoToolShears = other.autoToolShears;
		autoToolMilk = other.autoToolMilk;
		autoToolFish = other.autoToolFish;
		autoToolBrush = other.autoToolBrush;
		autoToolFeed = other.autoToolFeed;
		autoRefill = other.autoRefill;
		autoRefillHotbar = other.autoRefillHotbar;
		holdInScreens = other.holdInScreens;
		holdUseFast = other.holdUseFast;
		toolWarning = other.toolWarning;
		toolWarningPercent = Math.max(1, Math.min(50, other.toolWarningPercent));
		toolWarningSound = dev.slash3rss.slashclient.hud.Sounds.valid(other.toolWarningSound, dev.slash3rss.slashclient.hud.Sounds.NOTICE);
		compactHearts = other.compactHearts;
		foodPreview = other.foodPreview;
		foodTooltip = other.foodTooltip;
		foodSaturation = other.foodSaturation;
		foodExhaustion = other.foodExhaustion;
		foodHealth = other.foodHealth;
		foodDebug = other.foodDebug;
		skyDump = other.skyDump;
		mouseTweaks = other.mouseTweaks;
		craftFit = other.craftFit;
		quickCraft = other.quickCraft;
		quickCraftAlt = other.quickCraftAlt;
		quickCraftCtrl = other.quickCraftCtrl;
		quickCraftDrop = other.quickCraftDrop;
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
		blockBreakBar = other.blockBreakBar;
		fpsColored = other.fpsColored;
		effectIcons = other.effectIcons;
		fpsGood = Math.max(10, Math.min(240, other.fpsGood));
		fpsBad = Math.max(5, Math.min(240, other.fpsBad));
		pingGood = Math.max(10, Math.min(1000, other.pingGood));
		pingBad = Math.max(10, Math.min(1000, other.pingBad));
		memoryGood = Math.max(5, Math.min(100, other.memoryGood));
		memoryBad = Math.max(5, Math.min(100, other.memoryBad));
		cpuGood = Math.max(5, Math.min(100, other.cpuGood));
		cpuBad = Math.max(5, Math.min(100, other.cpuBad));
		gpuGood = Math.max(5, Math.min(100, other.gpuGood));
		gpuBad = Math.max(5, Math.min(100, other.gpuBad));
		speedDecimals = Math.max(0, Math.min(3, other.speedDecimals));
		coordsOneLine = other.coordsOneLine;
		coordsY = other.coordsY;
		armorHorizontal = other.armorHorizontal;
		armorHand = other.armorHand;
		armorDurability = oneOf(other.armorDurability, ARMOR_DURABILITY);
		durabilityFormat = oneOf(other.durabilityFormat, DURABILITY_FORMATS);
		durabilityBar = other.durabilityBar;
		durabilityWarn = Math.max(0, Math.min(50, other.durabilityWarn));
		keystrokesPressed = other.keystrokesPressed;
		keystrokesMouse = other.keystrokesMouse;
		keystrokesCps = other.keystrokesCps;
		keystrokesSpace = other.keystrokesSpace;
		targetBar = other.targetBar;
		targetDistance = other.targetDistance;
		itemsArrows = other.itemsArrows;
		itemsPearls = other.itemsPearls;
		itemsTotems = other.itemsTotems;
		itemsGapples = other.itemsGapples;
		itemsXp = other.itemsXp;
		itemsFireworks = other.itemsFireworks;
		itemsPotions = other.itemsPotions;
		itemsHeld = other.itemsHeld;
		itemsCustom = other.itemsCustom;
		clockDate = other.clockDate;
		daytimeDay = other.daytimeDay;
		daytimeWarn = other.daytimeWarn;
		biomeColored = other.biomeColored;
		biomeId = other.biomeId;
		lightSplit = other.lightSplit;
		skyWeatherTime = other.skyWeatherTime;
		sessionWholeGame = other.sessionWholeGame;
		fpsGraphMinMax = other.fpsGraphMinMax;
		elytraRockets = other.elytraRockets;
		elytraWarn = other.elytraWarn;
		lightWarn = other.lightWarn;
		tpsGood = other.tpsGood;
		tpsBad = other.tpsBad;
		fpsGraphSamples = other.fpsGraphSamples;
		compassTarget = other.compassTarget;
		compassTargetName = other.compassTargetName;
		compassDegrees = other.compassDegrees;
		friendsRows = Math.max(1, Math.min(15, other.friendsRows));
		inventoryHotbar = other.inventoryHotbar;
		chatStack = other.chatStack;
		chatCopy = other.chatCopy;
		chatCoords = other.chatCoords;
		chatCopyFormat = oneOf(other.chatCopyFormat, ChatExtras.COPY_FORMATS);
		chatCopyTime = oneOf(other.chatCopyTime, ChatExtras.COPY_TIMES);
		chatCopyNoSender = other.chatCopyNoSender;
		chatCopyNotice = oneOf(other.chatCopyNotice, ChatExtras.COPY_NOTICES);
		chatSearch = other.chatSearch;
		chatLongHistory = other.chatLongHistory;
		chatHistoryLines = Math.max(100, Math.min(16000, other.chatHistoryLines));
		chatKeep = other.chatKeep;
		chatScaleExtra = Math.max(1f, Math.min(ChatLook.MAX, other.chatScaleExtra));
		timeChanger = other.timeChanger;
		fixedTime = other.fixedTime;
		freelook = other.freelook;
		lookLock = other.lookLock;
		lookLockOnReturn = other.lookLockOnReturn;
		vncMouse = other.vncMouse;
		vncMouseEdge = other.vncMouseEdge;
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
		enchantColors = other.enchantColors;
		inventorySearch = other.inventorySearch;
		slotLock = other.slotLock;
		toasts = other.toasts;
		discordStatus = other.discordStatus;
		toastMessages = other.toastMessages;
		// switched off before there was a switch for each: both off
		toastOnline = other.toastOnline && other.friendPlayingToasts;
		toastPlaying = other.toastPlaying && other.friendPlayingToasts;
		friendPlayingToasts = true;
		toastLive = other.toastLive;
		toastInvites = other.toastInvites;
		toastCommunities = other.toastCommunities;
		toastAchievements = other.toastAchievements;
		toastErrors = other.toastErrors;
		toastOther = other.toastOther;
		toastSound = dev.slash3rss.slashclient.hud.Sounds.valid(other.toastSound, dev.slash3rss.slashclient.hud.Sounds.NOTICE);
		toastVolume = Math.max(0, Math.min(100, other.toastVolume));
		toastDnd = other.toastDnd;
		serverFriends = other.serverFriends;
		liveNametags = other.liveNametags;
		nametagPing = other.nametagPing;
		twitchChat = other.twitchChat == null ? new dev.slash3rss.slashclient.hud.streams.StreamChatSettings() : other.twitchChat.copy();
		kickChat = other.kickChat == null ? new dev.slash3rss.slashclient.hud.streams.StreamChatSettings() : other.kickChat.copy();
		spotify = other.spotify == null ? new dev.slash3rss.slashclient.hud.nowplaying.NowPlayingSettings() : other.spotify.copy();
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
