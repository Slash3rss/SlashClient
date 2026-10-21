package dev.slash3rss.slashclient.hud;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import dev.slash3rss.slashclient.hud.social.Social;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.CameraType;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.input.MouseButtonEvent;
import net.minecraft.client.renderer.RenderPipelines;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Picking SlashClient cosmetics in the game: one slot at a time (cape, wings, elytra, trail,
 * aura, pet, hat, top, kill effect, suit, shield, weapon, shoes, hands, face, ears, back item, tail, ring, movement effect,
 * spray, prop), the player's figure (for a spray its picture on a block) beside the panel trying on the item under
 * the mouse (turned to show its back for what is worn there, running for a trail, turned by
 * dragging it; for kill effects in a world the real player, from behind). Choices go to the SlashClient
 * server through the launcher, for the Minecraft account being played when it is linked to the
 * SlashClient account (each can have a set of its own), else for the whole account.
 */
public class CosmeticsScreen extends Screen {
	private static final String[] SLOTS = {"cape", "wings", "elytra", "trail", "aura", "pet", "hat", "top", "kill", "suit", "shield", "weapon", "shoes", "hands", "face", "ears", "back", "tail", "ring", "move", "spray", "prop"};
	/** Particles and pets have no picture of ours: an item that looks like them stands in. */
	private static final Map<String, Item> ITEMS = Map.ofEntries(
		Map.entry("hearts", Items.POPPY), Map.entry("sparks", Items.GLOWSTONE_DUST), Map.entry("snow", Items.SNOWBALL),
		Map.entry("notes", Items.NOTE_BLOCK), Map.entry("flames", Items.BLAZE_POWDER),
		Map.entry("enchant", Items.ENCHANTED_BOOK), Map.entry("portal", Items.ENDER_PEARL), Map.entry("cherry", Items.CHERRY_SAPLING),
		Map.entry("souls", Items.SOUL_LANTERN), Map.entry("royal", Items.TOTEM_OF_UNDYING),
		Map.entry("allay", Items.ALLAY_SPAWN_EGG), Map.entry("vex", Items.VEX_SPAWN_EGG), Map.entry("bat", Items.BAT_SPAWN_EGG),
		Map.entry("parrot", Items.PARROT_SPAWN_EGG), Map.entry("bee", Items.BEE_SPAWN_EGG),
		Map.entry("clouds", Items.FEATHER), Map.entry("stars", Items.FIREWORK_ROCKET), Map.entry("bubbles", Items.HEART_OF_THE_SEA),
		Map.entry("emerald", Items.EMERALD), Map.entry("soulfire", Items.SOUL_TORCH),
		Map.entry("glow", Items.GLOW_INK_SAC), Map.entry("magic", Items.EXPERIENCE_BOTTLE), Map.entry("amber", Items.HONEYCOMB),
		Map.entry("sculk", Items.SCULK_CATALYST),
		Map.entry("blaze", Items.BLAZE_SPAWN_EGG), Map.entry("phantom", Items.PHANTOM_SPAWN_EGG),
		Map.entry("crits", Items.IRON_SWORD), Map.entry("witch", Items.WITCH_SPAWN_EGG), Map.entry("ink", Items.INK_SAC),
		Map.entry("ash", Items.BASALT),
		Map.entry("spores", Items.SPORE_BLOSSOM), Map.entry("nautilus", Items.NAUTILUS_SHELL), Map.entry("tears", Items.CRYING_OBSIDIAN),
		//#if MC >= 1.21.5
		Map.entry("fireflies", Items.FIREFLY_BUSH),
		//#endif
		Map.entry("axolotl", Items.AXOLOTL_SPAWN_EGG), Map.entry("frog", Items.FROG_SPAWN_EGG), Map.entry("fox", Items.FOX_SPAWN_EGG), Map.entry("cat", Items.CAT_SPAWN_EGG),
		// kill effects
		Map.entry("lightning", Items.TRIDENT), Map.entry("blood", Items.REDSTONE), Map.entry("heartburst", Items.ROSE_BUSH),
		Map.entry("firework", Items.FIREWORK_STAR), Map.entry("soulrise", Items.SOUL_CAMPFIRE), Map.entry("enderpoof", Items.ENDER_EYE),
		Map.entry("confetti", Items.PAPER), Map.entry("blast", Items.TNT), Map.entry("shatter", Items.BLUE_ICE),
		Map.entry("coins", Items.GOLD_NUGGET), Map.entry("ghost", Items.GHAST_TEAR), Map.entry("flamering", Items.FIRE_CHARGE),
		// movement effects (rings have pictures of their own)
		Map.entry("move_steps", Items.LEATHER_BOOTS), Map.entry("move_jump", Items.SLIME_BALL), Map.entry("move_landing", Items.ANVIL),
		Map.entry("move_arrows", Items.SPECTRAL_ARROW), Map.entry("move_sprint", Items.SUGAR), Map.entry("move_bubbles", Items.PUFFERFISH),
		Map.entry("move_petals", Items.PINK_PETALS));
	private static final int TILE_W = 32, TILE_H = 40, GAP = 4;

	/**
	 * `hint`: how to earn an item that only an achievement gives ("" for the rest); `price`: what it
	 * costs in the shop, in Sparks (0: not sold there; servers before 0.9.22 sell nothing).
	 */
	private record Entry(String id, String slot, String name, String rank, boolean available, String hint, int price) {
		Entry(String id, String slot, String name, String rank, boolean available, String hint) {
			this(id, slot, name, rank, available, hint, 0);
		}

		Entry(String id, String slot, String name, String rank, boolean available) {
			this(id, slot, name, rank, available, "", 0);
		}

		/** In the shop and not ours yet: a click offers to buy it. */
		boolean forSale() {
			return price > 0 && !available;
		}
	}
	private record Hit(int x, int y, int w, int h, Runnable action) {}

	private final Screen parent;
	private final List<Hit> hits = new ArrayList<>();
	private volatile List<Entry> items = List.of();
	/** What is worn now, slot → id. */
	private final Map<String, String> worn = new HashMap<>();
	/** The played Minecraft account, when linked to the SlashClient account (uuid without dashes), and its name. */
	private volatile String character, characterName;
	private volatile boolean ownSet;
	/** null while loading; "" when ready; else what went wrong (a translation key). */
	private volatile String status;
	private volatile boolean busy;
	private String slot = "cape";
	/** The item grid scrolls when a slot has more items than fit (in pixels), and where it is on screen. */
	private int scroll, maxScroll, gridTop, gridBottom;
	private final dev.slash3rss.slashclient.hud.ui.Scrollbar bar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
	/**
	 * The slot tabs wrap to rows; when there are more rows than leave room for the items, only some
	 * show and they scroll (by rows, with the wheel over them or their bar): which row is first, how
	 * many there are, how many show, where they are on screen, and the slot last kept in view.
	 */
	private int tabScroll, tabRows, tabShown, tabTop, tabBottom;
	private String tabFor;
	private final dev.slash3rss.slashclient.hud.ui.Scrollbar tabBar = new dev.slash3rss.slashclient.hud.ui.Scrollbar();
	private static final int TAB_ROW = 19;
	/** The player's figure on the left, and where it is on screen. */
	private dev.slash3rss.slashclient.hud.ui.SkinPreview figure;
	private int fx, fy, fw, fh;
	/** The figure's turn by dragging it (degrees), and whether it is being dragged now. */
	private float dragTurn;
	private boolean turning;
	/** On the suits' tab the figure slowly turns round by itself (degrees so far), so all of the suit shows; and when it last moved. */
	private float spin;
	private long spinAt;
	/** The item under the mouse in this slot, tried on by the figure ("" the "nothing" tile, null none); `hoverNow` is this frame's. */
	private String tried, hoverNow;
	private CameraType camera;
	private Component tooltip;
	/** A second, dimmer line under the tooltip (a shop item's how to buy it), or null. */
	private Component tooltip2;
	private int tipX, tipY;
	/** The Sparks we have (-1: not known, e.g. signed out or an older server: then no shop shows). */
	private volatile int balance = -1;
	/** The shop item whose "buy it?" box is open, or null; the request for it in flight; what went wrong (a translation key, or null). */
	private Entry buying;
	private volatile boolean buyBusy;
	private volatile String buyError;
	/** For the test (no launcher there): answers a purchase as the server would ({balance, item}), or throws as the bridge does. */
	static volatile java.util.function.Function<String, JsonObject> shopForTest;
	private int px, py, pw, ph;

	public CosmeticsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.cosmetics"));
		this.parent = parent;
	}

	/** For the screenshot test (no launcher there): every item this mod knows, a few locked, some worn. */
	static CosmeticsScreen sample(String slot) {
		CosmeticsScreen screen = new CosmeticsScreen(null);
		List<Entry> list = new ArrayList<>();
		for (String id : Cosmetics.CAPES) list.add(new Entry(id, "cape", id, id.startsWith("staff_") ? id.substring(6) : "", !id.equals("staff_partner") && !id.equals("streak30") && !id.equals("skyup_noc"),
			id.equals("streak30") ? "Osiągnięcie „Seria 30 dni”: Graj co najmniej 10 minut dziennie przez 30 dni z rzędu."
				// a SkyUp.pl cape: earned with time on that server (the server's words)
				: id.equals("skyup_noc") ? "Osiągnięcie „Nocna zmiana”: Spędź 50 godzin na SkyUp.pl. Liczy się czas od wprowadzenia tych osiągnięć." : ""));
		for (String id : Cosmetics.WINGS) list.add(new Entry(id, "wings", id, "", !id.equals("phoenix")));
		for (String id : Cosmetics.ELYTRAS) list.add(new Entry(id, "elytra", id, "", true));
		for (String id : Cosmetics.TRAILS) list.add(new Entry(id, "trail", id, "", true));
		for (String id : Cosmetics.AURAS) list.add(new Entry(id, "aura", id, id.equals("royal") ? "admin" : "", true));
		for (String id : Cosmetics.PETS) list.add(new Entry(id, "pet", id, "", true));
		for (String id : Clothing.HATS) list.add(new Entry(id, "hat", id, "", true));
		for (String id : Clothing.TOPS) list.add(new Entry(id, "top", id, "", true));
		for (String id : KillEffects.IDS) list.add(new Entry(id, "kill", id, "", true));
		for (String id : Suits.IDS) list.add(new Entry(id, "suit", id, "", true));
		for (String id : HeldSkins.SHIELDS) list.add(new Entry(id, "shield", id, "", true));
		for (String id : HeldSkins.WEAPONS) list.add(new Entry(id, "weapon", id, "", true));
		for (String id : Clothing.SHOES) list.add(new Entry(id, "shoes", id, "", true));
		for (String id : Clothing.HANDS) list.add(new Entry(id, "hands", id, "", true));
		for (String id : Clothing.FACE) list.add(new Entry(id, "face", id, "", true));
		for (String id : Clothing.EARS) list.add(new Entry(id, "ears", id, "", true));
		for (String id : Gear.BACKS) list.add(new Entry(id, "back", id, "", true));
		for (String id : Gear.TAILS) list.add(new Entry(id, "tail", id, "", true));
		for (String id : RingEffects.IDS) list.add(new Entry(id, "ring", id, "", true));
		for (String id : MoveEffects.IDS) list.add(new Entry(id, "move", id, "", true));
		for (String id : Sprays.IDS) list.add(new Entry(id, "spray", id, "", true));
		for (String id : Props.IDS) list.add(new Entry(id, "prop", id, "", true));
		screen.items = List.copyOf(list);
		screen.worn.putAll(Map.of("cape", "aurora", "wings", "angel", "pet", "allay", "hat", "tophat", "top", "scarf", "kill", "firework", "shield", "shield_dragon", "weapon", "sword_katana",
			"shoes", "sneakers_red", "hands", "wristwatch"));
		if (slot.equals("back") || slot.equals("tail")) screen.worn.putAll(Map.of("back", "backpack", "tail", "foxtail"));
		screen.worn.putAll(Map.of("ring", "ring_runes", "move", "move_landing", "spray", "spray_heart"));
		screen.character = "test";
		screen.characterName = "Slash3rss";
		screen.ownSet = true;
		screen.status = "";
		screen.slot = slot;
		screen.camera = CameraType.FIRST_PERSON;
		return screen;
	}

	/** For the shop's test: the sample with the shop's items at their prices (`owned` already bought) and this many Sparks. */
	static CosmeticsScreen sampleShop(String slot, int balance, Map<String, Integer> prices, java.util.Set<String> owned) {
		CosmeticsScreen screen = sample(slot);
		List<Entry> list = new ArrayList<>();
		for (Entry e : screen.items) {
			Integer price = prices.get(e.id());
			list.add(price == null ? e : new Entry(e.id(), e.slot(), SAMPLE_NAMES.getOrDefault(e.id(), e.id()), "", owned.contains(e.id()), "", price));
		}
		screen.items = List.copyOf(list);
		screen.balance = balance;
		return screen;
	}
	private static final Map<String, String> SAMPLE_NAMES = Map.of("emberstar", "Iskra", "obsidian", "Obsydian", "coral", "Rafa koralowa", "thunder", "Grom",
		"regal", "Purpura", "cosmos", "Kosmos", "emberwings", "Iskrzące", "sapphire", "Szafirowe", "obsidianwings", "Obsydianowe");

	@Override
	protected void init() {
		pw = Math.min(width - 24, 6 * (TILE_W + GAP) - GAP + 24);
		ph = Math.min(height - 24, 250);
		// the panel on the right: the player stays visible on the left
		px = width - pw - 12;
		py = (height - ph) / 2;
		if (camera == null) {
			camera = minecraft.options.getCameraType();
			load();
		}
	}

	/** How the figure stands for a slot: its back for what is worn there, its side for a trail, half way for a tail (degrees). */
	private static float turnFor(String slot) {
		return switch (slot) {
			case "cape", "wings", "elytra", "back" -> 180;
			case "trail" -> -90;
			// the shield on the left arm and the weapon in the right hand, each turned a little towards the viewer
			case "shield" -> -35;
			case "weapon" -> 35;
			case "tail" -> 130;
			// a movement effect from the side and a little in front (footprints and streaks stay in view)
			case "move" -> -60;
			// a prop from its side, a little from the front: the wheel ahead, the grips in the hands
			case "prop" -> 55;
			default -> 0;
		};
	}

	private void pick(String s) {
		if (s.equals(slot)) return;
		slot = s;
		scroll = 0;
		dragTurn = 0;
		spin = 0;
		tried = null;
		if (figure != null) figure.look.turnTo(turnFor(s));
	}

	/** For the test: the figure dragged to this turn (degrees from how the slot shows it). */
	void dragFigure(float degrees) {
		dragTurn = degrees;
	}

	/** For the test: the figure's box on screen (GUI pixels: x, y, width, height; width 0 when not shown) and its turn by hand so far. */
	float[] figureForTest() {
		return new float[] {fx, fy, fw, fh, dragTurn};
	}

	/** For the test: another slot, as a click on its tab. */
	void select(String s) {
		pick(s);
	}

	/** For the test: the "buy it?" box of a shop item, as a click on its tile (false when it is not for sale). */
	boolean offerForTest(String id) {
		for (Entry e : items) if (e.id().equals(id) && e.forSale()) {
			offer(e);
			return true;
		}
		return false;
	}

	/** For the test: where an item's tile was last drawn (GUI pixels: x, y), or null. */
	int[] tileForTest(String id) {
		return tileAt.get(id);
	}
	private final Map<String, int[]> tileAt = new java.util.concurrent.ConcurrentHashMap<>();

	/** For the test: "Buy" in the open box, as a click on it. */
	void confirmForTest() {
		if (buying != null) buy(buying);
	}

	/** For the test: the Sparks shown, whether the box is open, and whether an item is ours now: "balance|open|owned". */
	String shopForTest(String id) {
		boolean owned = items.stream().anyMatch(e -> e.id().equals(id) && e.available());
		return balance + "|" + (buying != null) + "|" + owned + "|" + worn.getOrDefault(slot, "");
	}

	/** For the test: as if the server said this is worn in a slot (null takes it off). */
	void wornForTest(String s, String id) {
		synchronized (worn) {
			if (id == null) worn.remove(s);
			else worn.put(s, id);
		}
	}

	private UUID self() {
		return minecraft.getGameProfile().id();
	}

	/** The catalog and what is worn, from the server; the network is never on the game's thread. */
	private void load() {
		if (!Social.available()) {
			status = "slashclient-hud.cosmetics.noLauncher";
			return;
		}
		status = null;
		Thread.ofVirtual().start(() -> {
			try {
				JsonObject catalog = Social.api("GET", "/v1/cosmetics", null);
				JsonObject me = Social.api("GET", "/v1/me", null);
				applyCatalog(catalog);
				applyMe(me);
				status = "";
			} catch (Exception e) {
				status = e.getMessage() != null && e.getMessage().contains("401") ? "slashclient-hud.cosmetics.signIn" : "slashclient-hud.cosmetics.error";
			}
		});
	}

	/** The items (only those this version has pictures for) and the Sparks we have. */
	private void applyCatalog(JsonObject catalog) {
		List<Entry> list = new ArrayList<>();
		boolean polish = minecraft.options.languageCode.startsWith("pl");
		for (JsonElement e : catalog.getAsJsonArray("items")) {
			JsonObject o = e.getAsJsonObject();
			// newer cosmetics than this version has pictures for stay out of the menu
			if (!Cosmetics.knows(o.get("slot").getAsString(), o.get("id").getAsString())) continue;
			String hint = polish ? "hint" : "hintEn";
			list.add(new Entry(o.get("id").getAsString(), o.get("slot").getAsString(), o.get("name").getAsString(),
				// the supporters' items show as a rank's ("only for Supporter")
				o.has("rank") && !o.get("rank").isJsonNull() ? o.get("rank").getAsString() : o.has("supporter") ? "supporter" : "", o.get("available").getAsBoolean(),
				o.has(hint) && !o.get(hint).isJsonNull() ? o.get(hint).getAsString() : "",
				o.has("price") && o.get("price").isJsonPrimitive() ? o.get("price").getAsInt() : 0));
		}
		items = List.copyOf(list);
		JsonObject wallet = catalog.has("wallet") && catalog.get("wallet").isJsonObject() ? catalog.getAsJsonObject("wallet") : null;
		balance = wallet != null && wallet.has("balance") ? wallet.get("balance").getAsInt() : -1;
	}

	/** The catalog asked again without "Loading…" (an achievement may have given an item meanwhile). */
	private void refreshCatalog() {
		if (!Social.bridged() || !"".equals(status)) return;
		Thread.ofVirtual().start(() -> {
			try {
				applyCatalog(Social.api("GET", "/v1/cosmetics", null));
			} catch (Exception e) {
				// what shows stays as it was
			}
		});
	}

	/** The Sparks balance changed (the server's 'wallet' event): the open menu shows it, and asks the catalog again. */
	public static void walletChanged(int balance) {
		net.minecraft.client.Minecraft mc = net.minecraft.client.Minecraft.getInstance();
		mc.execute(() -> {
			if (Compat.screen(mc) instanceof CosmeticsScreen c && c.balance != balance) {
				c.balance = balance;
				if (!c.buyBusy) c.refreshCatalog();
			}
		});
	}

	// ---------- the shop ----------

	/** The "buy it?" box for a shop item. */
	private void offer(Entry e) {
		if (buyBusy) return;
		buying = e;
		buyError = null;
	}

	/**
	 * Buys the item for Sparks (off the game's thread), then it is ours: the catalog anew, a toast,
	 * and it is worn at once, as a click on it would.
	 */
	private void buy(Entry e) {
		if (buyBusy || balance < e.price()) return;
		buyBusy = true;
		buyError = null;
		String wornSlot = slot;
		Thread.ofVirtual().start(() -> {
			try {
				var test = shopForTest;
				JsonObject res = test != null ? test.apply(e.id()) : Social.api("POST", "/v1/shop/" + e.id() + "/buy", new JsonObject());
				if (res.has("balance")) balance = res.get("balance").getAsInt();
				// ours now, at once; the catalog anew says so too
				List<Entry> list = new ArrayList<>();
				for (Entry x : items) list.add(x.id().equals(e.id()) && x.slot().equals(e.slot()) ? new Entry(x.id(), x.slot(), x.name(), x.rank(), true, x.hint(), x.price()) : x);
				items = List.copyOf(list);
				if (test == null) {
					try {
						applyCatalog(Social.api("GET", "/v1/cosmetics", null));
					} catch (Exception ignored) {
						// the item is shown as ours already
					}
				}
				Social.toast(Component.translatable("slashclient-hud.cosmetics.buy.done", e.name()).getString(),
					Component.translatable("slashclient-hud.cosmetics.buy.worn").getString(), "check");
				minecraft.execute(() -> {
					buying = null;
					buyBusy = false;
					if (test != null) wornForTest(wornSlot, e.id());
					else wear(e);
				});
			} catch (Exception ex) {
				String msg = ex.getMessage() == null ? "" : ex.getMessage();
				buyError = msg.contains("not_enough_sparks") ? "slashclient-hud.cosmetics.buy.notEnough"
					: msg.contains("not_for_sale") || msg.contains("not_found") ? "slashclient-hud.cosmetics.buy.notForSale"
					: msg.contains("\"owned\"") ? "slashclient-hud.cosmetics.buy.owned"
					: msg.contains("unauthorized") || msg.contains("401") ? "slashclient-hud.cosmetics.signIn"
					: "slashclient-hud.cosmetics.buy.failed";
				buyBusy = false;
				// someone else's purchase (another game, the website) or a stale price: what the server says now
				if (shopForTest == null) refreshCatalog();
			}
		});
	}

	/** Reads what is worn: the played account's own set, or the whole account's. */
	private void applyMe(JsonObject me) {
		String mine = self().toString().replace("-", "");
		character = null;
		ownSet = false;
		if (me.has("minecraft")) for (JsonElement e : me.getAsJsonArray("minecraft")) {
			JsonObject m = e.getAsJsonObject();
			if (!mine.equals(m.get("uuid").getAsString())) continue;
			character = mine;
			characterName = m.get("name").getAsString();
			ownSet = m.has("loadout") && m.get("loadout").isJsonObject();
		}
		Map<String, String> now = wornIn(me, self());
		synchronized (worn) {
			worn.clear();
			worn.putAll(now);
		}
		// at once on our own player, without waiting for the next lookup
		minecraft.execute(() -> {
			Cosmetics.setAll(self(), now);
			if (minecraft.player != null) Cosmetics.setAll(minecraft.player.getUUID(), now);
		});
	}

	/** What `self` wears, from the account (/v1/me): its own set when it has one, else the account's. */
	static Map<String, String> wornIn(JsonObject me, UUID self) {
		String mine = self.toString().replace("-", "");
		JsonObject set = null;
		if (me.has("minecraft")) for (JsonElement e : me.getAsJsonArray("minecraft")) {
			JsonObject m = e.getAsJsonObject();
			if (mine.equals(m.get("uuid").getAsString()) && m.has("loadout") && m.get("loadout").isJsonObject()) set = m.getAsJsonObject("loadout");
		}
		Map<String, String> now = new HashMap<>();
		if (set == null) {
			if (me.has("loadout") && me.get("loadout").isJsonObject()) set = me.getAsJsonObject("loadout");
			if (me.has("cape") && !me.get("cape").getAsString().isEmpty()) now.put("cape", me.get("cape").getAsString());
		}
		if (set != null) set.entrySet().forEach(e -> now.put(e.getKey(), e.getValue().getAsString()));
		return now;
	}

	/** Out of the game (the main menu), what we wear, asked once: the preview there shows it. */
	public static void loadOwn(net.minecraft.client.Minecraft mc) {
		if (ownLoaded || !Social.available()) return;
		ownLoaded = true;
		UUID self = mc.getGameProfile().id();
		Thread.ofVirtual().start(() -> {
			try {
				Map<String, String> now = wornIn(Social.api("GET", "/v1/me", null), self);
				mc.execute(() -> Cosmetics.setAll(self, now));
			} catch (Exception e) {
				ownLoaded = false;
			}
		});
	}
	private static volatile boolean ownLoaded;

	/** After a game the own set is asked again (it may have changed in the game's menu). */
	static void forgetOwn() {
		ownLoaded = false;
	}

	private void wear(Entry item) {
		if (busy || status == null || !status.isEmpty()) return;
		String id = item == null ? "" : item.id();
		// a kill effect shows what it looks like at once
		if (slot.equals("kill") && !id.isEmpty()) KillEffects.preview(minecraft, id);
		JsonObject body = new JsonObject();
		if (character != null) body.addProperty("character", character);
		if (slot.equals("cape")) body.addProperty("cape", id);
		else {
			JsonObject l = new JsonObject();
			l.addProperty(slot, id);
			body.add("loadout", l);
		}
		send(body);
	}

	private void send(JsonObject body) {
		busy = true;
		Thread.ofVirtual().start(() -> {
			try {
				applyMe(Social.api("POST", "/v1/me", body));
			} catch (Exception e) {
				minecraft.execute(() -> Compat.overlay(minecraft, Component.translatable("slashclient-hud.cosmetics.error")));
			} finally {
				busy = false;
			}
		});
	}

	@Override
	public void extractRenderState(GuiGraphicsExtractor g, int mx, int my, float delta) {
		//#if MC < 1.20.2
		//$ extractBackground(g, mx, my, delta);
		//#endif
		super.extractRenderState(g, mx, my, delta);
		hits.clear();
		tooltip = null;
		tooltip2 = null;
		bar.hide();
		tabBar.hide();
		// while the "buy it?" box is open the figure wears what is being bought
		tried = buying != null ? buying.id() : hoverNow;
		hoverNow = null;
		boolean world = minecraft.level != null;
		// kill effects play in the world, around the real player seen from behind; else the camera stays as it was
		if (world && camera != null) {
			CameraType want = slot.equals("kill") ? CameraType.THIRD_PERSON_BACK : camera;
			if (minecraft.options.getCameraType() != want) minecraft.options.setCameraType(want);
		}
		// your figure, wearing what you pick and trying on what is under the mouse
		fw = 0;
		// a spray: its picture on a block, big, instead of the figure
		if (slot.equals("spray") && px - 12 >= 64) SprayPreview.draw(g, 0, 0, px - 12, height, tried != null ? tried : worn.get("spray"));
		else if (px - 12 >= 64 && !(world && slot.equals("kill"))) {
			if (figure == null) {
				figure = new dev.slash3rss.slashclient.hud.ui.SkinPreview(minecraft);
				figure.look.turnTo(turnFor(slot));
			}
			// as tall as fits, but narrow enough that open wings (about a box width to each side) stay between the screen's edge and the panel
			fh = Math.min(height - 40, Math.min(240, px - 24));
			fw = fh / 2;
			fx = (px - 12 - fw) / 2;
			fy = (height - fh) / 2;
			if (slot.equals("prop")) {
				// the prop reaches out to the figure's side: a smaller figure, moved over so both fit beside the panel
				fh = fh * 3 / 4;
				fw = fh / 2;
				fx = Math.max(8, (px - 12 - fw) / 2 - Math.round(0.35f * fh / 2.125f));
				fy = (height - fh) / 2;
			}
			Map<String, String> set;
			synchronized (worn) {
				set = new HashMap<>(worn);
			}
			if (tried != null) set.put(slot, tried);
			// wings take the cape's place: on the cape's tab the cape shows; running, they would hide the trail;
			// a back item takes the place of both: on their tabs they show
			if (slot.equals("cape") || slot.equals("trail")) set.remove("wings");
			if (slot.equals("cape") || slot.equals("wings")) set.remove("back");
			var look = figure.look;
			look.wearing = set;
			// a suit turns round slowly while nobody drags it (about 12 seconds a round)
			long now = System.nanoTime();
			if (slot.equals("suit") && !turning && spinAt != 0) spin += Math.min(0.1f, (now - spinAt) / 1e9f) * 30;
			spinAt = now;
			look.turn = turnFor(slot) + dragTurn + spin;
			// a tail swings with the steps: the figure runs on its tab too
			look.running = slot.equals("trail") || slot.equals("tail") || slot.equals("move") && dev.slash3rss.slashclient.hud.ui.FigureMoves.runs(set.get("move"));
			look.moveDemo = slot.equals("move");
			look.elytra = slot.equals("elytra");
			look.held = HeldSkins.SLOTS.contains(slot);
			look.pushing = slot.equals("prop");
			// while it is turned by hand the head does not chase the mouse
			figure.draw(g, fx, fy, fw, fh, turning ? fx + fw / 2 : mx, turning ? fy : my);
		}
		Ui.panel(g, px, py, pw, ph);
		Ui.begin("cosmetics", px, py, pw, ph);
		int x = px + 12, y = py + 10;
		Ui.draw(g, Ui.trBold("slashclient-hud.cosmetics"), x, y, Ui.TEXT);
		int cw = 16;
		Ui.button(g, "cos:close", px + pw - cw - 8, y - 4, cw, 15, "close", Component.empty(), false, mx, my);
		hits.add(new Hit(px + pw - cw - 8, y - 4, cw, 15, this::onClose));
		// the Sparks we have, in gold beside the close button (servers before 0.9.22 and signed out: none)
		int sparks = balance;
		if (sparks >= 0 && "".equals(status)) {
			Component amount = Ui.bold(Sparks.format(sparks));
			int aw = Ui.width(amount), bx = px + pw - cw - 8 - 8 - aw - 11, bw = aw + 11 + 8;
			Ui.round(g, bx - 4, y - 4, bw, 15, 4, 0x26FACC15);
			Ui.roundOutline(g, bx - 4, y - 4, bw, 15, 4, 0x40FACC15);
			Sparks.icon(g, bx, y - 1, 8);
			Ui.draw(g, amount, bx + 11, y, Sparks.GOLD);
			if (Ui.inside(mx, my, bx - 4, y - 4, bw, 15)) {
				tooltip = Ui.tr("slashclient-hud.cosmetics.balance", Sparks.name());
				tipX = bx - 4 + bw / 2;
				tipY = y + 30;
			}
		}
		y += 13;
		Component owner = character != null
			? Ui.tr(ownSet ? "slashclient-hud.cosmetics.character" : "slashclient-hud.cosmetics.characterShared", characterName)
			: Ui.tr("slashclient-hud.cosmetics.account");
		int sharedW = 0;
		if (character != null && ownSet && "".equals(status)) {
			// back to the whole account's set, on the same line
			Component shared = Ui.tr("slashclient-hud.cosmetics.useAccount");
			sharedW = Ui.width(shared) + 14;
			int bx = px + pw - sharedW - 8, by = y - 3;
			Ui.button(g, "cos:shared", bx, by, sharedW, 13, null, shared, false, mx, my);
			hits.add(new Hit(bx, by, sharedW, 13, () -> {
				JsonObject body = new JsonObject();
				body.addProperty("character", character);
				body.addProperty("own", false);
				send(body);
			}));
		}
		Ui.draw(g, Ui.fit(owner, pw - 28 - sharedW), x, y, Ui.MUTED);
		y += 14;
		if (status == null || !status.isEmpty()) {
			Ui.wrapped(g, Ui.tr(status == null ? "slashclient-hud.cosmetics.loading" : status), x, y + 10, pw - 24, Ui.TEXT_2);
			Ui.end();
			return;
		}
		// the slots, as small tabs wrapped to rows; when they would leave less than two rows of items,
		// as many rows show as fit and the rest scroll to (the picked slot's row always in view)
		int[] tabRow = new int[SLOTS.length], tabX = new int[SLOTS.length], tabW = new int[SLOTS.length];
		int right = px + pw - 12;
		for (int pass = 0; pass < 2; pass++) {
			int tx = x, row = 0;
			for (int i = 0; i < SLOTS.length; i++) {
				int w = Ui.width(Ui.tr("slashclient-hud.cosmetics.slot." + SLOTS[i])) + 14;
				if (tx + w > right && tx > x) {
					tx = x;
					row++;
				}
				tabRow[i] = row;
				tabX[i] = tx;
				tabW[i] = w;
				tx += w + 4;
			}
			tabRows = row + 1;
			int room = py + ph - 8 - y - 2 * (TILE_H + GAP) - 23;
			tabShown = Math.max(1, Math.min(tabRows, (room + 4) / TAB_ROW));
			// rows that scroll leave room on the right for their bar
			if (tabShown >= tabRows || right < px + pw - 12) break;
			right = px + pw - 20;
		}
		int maxTabScroll = tabRows - tabShown;
		if (!slot.equals(tabFor)) {
			// a newly picked slot (also by the test, or when the screen opens): its row in view
			tabFor = slot;
			int at = tabRow[Math.max(0, java.util.Arrays.asList(SLOTS).indexOf(slot))];
			if (at < tabScroll) tabScroll = at;
			else if (at >= tabScroll + tabShown) tabScroll = at - tabShown + 1;
		}
		tabScroll = Math.max(0, Math.min(maxTabScroll, tabScroll));
		tabTop = y;
		tabBottom = y + tabShown * TAB_ROW - 4;
		for (int i = 0; i < SLOTS.length; i++) {
			int row = tabRow[i] - tabScroll;
			if (row < 0 || row >= tabShown) continue;
			String s = SLOTS[i];
			int tx = tabX[i], ty = y + row * TAB_ROW, w = tabW[i];
			Ui.button(g, "cos:slot:" + s, tx, ty, w, 15, null, Ui.tr("slashclient-hud.cosmetics.slot." + s), s.equals(slot), mx, my);
			if (worn.containsKey(s)) g.fill(tx + w - 4, ty + 2, tx + w - 2, ty + 4, 0xFF4ADE80);
			hits.add(new Hit(tx, ty, w, 15, () -> pick(s)));
		}
		tabBar.draw(g, px + pw - 10, tabTop, tabBottom - tabTop, tabScroll * TAB_ROW, maxTabScroll * TAB_ROW, mx, my);
		y += tabShown * TAB_ROW + 4;
		// kill effects: a button that plays the one worn, beside the player (in a world only: they are the game's particles)
		if (slot.equals("kill")) {
			String kill = worn.get("kill");
			Component label = Ui.tr("slashclient-hud.cosmetics.preview");
			int bw = Ui.width(label) + 24;
			Ui.button(g, "cos:preview", x, y - 4, bw, 15, "play", label, false, mx, my);
			if (world && kill != null) hits.add(new Hit(x, y - 4, bw, 15, () -> KillEffects.preview(minecraft, kill)));
			Ui.draw(g, Ui.fit(Ui.tr(world ? "slashclient-hud.cosmetics.killHint" : "slashclient-hud.cosmetics.killWorld"), pw - 36 - bw), x + bw + 6, y, Ui.MUTED);
			y += 17;
		}
		// shields and weapons: whether other players' skins show too (off by default, for fair PvP), and what that means
		if (HeldSkins.SLOTS.contains(slot)) {
			boolean on = SlashHud.config.heldSkinsOthers;
			Ui.toggle(g, "cos:heldOthers", x, y - 3, on);
			Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.cosmetics.heldOthers"), pw - 54), x + 26, y - 2, Ui.TEXT_2);
			hits.add(new Hit(x, y - 5, pw - 24, 14, () -> {
				SlashHud.config.heldSkinsOthers = !SlashHud.config.heldSkinsOthers;
				SlashHud.config.save();
			}));
			y = Ui.wrapped(g, Ui.tr("slashclient-hud.cosmetics.heldHint"), x, y + 12, pw - 24, Ui.MUTED) + 4;
		}
		// what goes with what on the back: a back item takes the place of the cape and the wings
		String note = slot.equals("back") ? "slashclient-hud.cosmetics.backHint"
			: slot.equals("tail") ? "slashclient-hud.cosmetics.tailHint"
			: (slot.equals("cape") || slot.equals("wings")) && worn.containsKey("back") ? "slashclient-hud.cosmetics.backTaken" : null;
		if (note != null) {
			y = Ui.wrapped(g, Ui.tr(note), x, y - 4, pw - 24, Ui.MUTED) + 4;
		}
		// movement effects: when they play
		if (slot.equals("move")) {
			Ui.draw(g, Ui.fit(Ui.tr("slashclient-hud.cosmetics.moveHint"), pw - 24), x, y - 2, Ui.MUTED);
			y += 13;
		}
		// sprays: which key sprays, and a way to set it
		if (slot.equals("spray")) {
			Component label = Ui.tr("slashclient-hud.cosmetics.sprayKey");
			int bw = Ui.width(label) + 24;
			Ui.button(g, "cos:sprayKey", x, y - 4, bw, 15, "gear", label, false, mx, my);
			hits.add(new Hit(x, y - 4, bw, 15, () -> minecraft.setScreenAndShow(new KeybindsScreen(this))));
			Ui.draw(g, Ui.fit(SprayPreview.keyHint(), pw - 36 - bw), x + bw + 6, y, Ui.MUTED);
			y += 17;
		}
		// the items of this slot, "nothing" first
		List<Entry> shown = new ArrayList<>();
		shown.add(null);
		for (Entry e : items) if (e.slot().equals(slot)) shown.add(e);
		int perRow = Math.max(1, (pw - 24 + GAP) / (TILE_W + GAP));
		String current = worn.getOrDefault(slot, "");
		// all of them, scrolled with the mouse wheel when they do not fit
		gridTop = y;
		gridBottom = py + ph - 8;
		int rows = (shown.size() + perRow - 1) / perRow;
		maxScroll = Math.max(0, rows * (TILE_H + GAP) - GAP - (gridBottom - gridTop));
		scroll = Math.max(0, Math.min(maxScroll, scroll));
		g.enableScissor(px, gridTop - 3, px + pw, gridBottom);
		Ui.beginClip("cosmetics grid", px, gridTop - 3, pw, gridBottom - gridTop + 3);
		tileAt.clear();
		for (int i = 0; i < shown.size(); i++) {
			Entry e = shown.get(i);
			int ix = x + (i % perRow) * (TILE_W + GAP), iy = y + (i / perRow) * (TILE_H + GAP) - scroll;
			if (iy + TILE_H < gridTop || iy > gridBottom) continue;
			tile(g, mx, my, ix, iy, e, (e == null ? "" : e.id()).equals(current));
			tileAt.put(e == null ? "" : e.id(), new int[] {ix, iy});
		}
		Ui.end();
		g.disableScissor();
		// where in the list we are; taken with the mouse it scrolls too
		bar.draw(g, px + pw - 8, gridTop, gridBottom - gridTop, scroll, maxScroll, mx, my);
		Ui.end();
		if (buying != null) {
			// the "buy it?" box: everything else waits until it is answered
			tooltip = null;
			hits.clear();
			offerBox(g, mx, my);
		}
		if (tooltip != null) {
			int w = Math.max(Ui.width(tooltip), tooltip2 == null ? 0 : Ui.width(tooltip2)) + 12, h = tooltip2 == null ? 15 : 26;
			int tx2 = Math.max(4, Math.min(width - w - 4, tipX - w / 2));
			Ui.round(g, tx2, tipY - h, w, h, 4, 0xF0111622);
			Ui.roundOutline(g, tx2, tipY - h, w, h, 4, 0x403B82F6);
			Ui.draw(g, tooltip, tx2 + 6, tipY - h + 4, Ui.TEXT);
			if (tooltip2 != null) Ui.draw(g, tooltip2, tx2 + 6, tipY - h + 15, Ui.MUTED);
		}
	}

	/**
	 * Over the panel: the item's picture, "Buy {name} for {price}?", what we have and what is left
	 * (or how many are missing: then Buy cannot be pressed), Buy and Cancel.
	 */
	private void offerBox(GuiGraphicsExtractor g, int mx, int my) {
		Entry e = buying;
		int have = balance;
		boolean enough = have >= e.price();
		g.fill(px, py, px + pw, py + ph, 0x90000000);
		int bw = Math.min(pw - 16, 200), x = px + (pw - bw) / 2, inner = bw - 24 - TILE_W - 10;
		Component title = Ui.trBold("slashclient-hud.cosmetics.buy.title", e.name(), Sparks.format(e.price()));
		List<net.minecraft.util.FormattedCharSequence> lines = minecraft.font.split(title, inner);
		Component error = buyError == null ? null : Ui.tr(buyError, Sparks.genitive());
		Component hint = enough ? null : Ui.tr("slashclient-hud.cosmetics.buy.missingHint", Sparks.genitive());
		int hintLines = hint == null ? 0 : minecraft.font.split(hint, bw - 24).size();
		int textH = lines.size() * 11 + 4 + 12 + 12;
		int bh = 12 + Math.max(TILE_H, textH) + 8 + hintLines * 11 + (hint != null ? 4 : 0) + (error != null ? 13 : 0) + 15 + 12;
		int y = py + Math.max(8, (ph - bh) / 2);
		Ui.round(g, x, y, bw, bh, 6, Ui.PANEL);
		Ui.roundOutline(g, x, y, bw, bh, 6, 0x60FACC15);
		Ui.begin("cosmetics buy", x, y, bw, bh);
		// the item as on its tile, without the lock and the price
		int ix = x + 12, iy = y + 12;
		Ui.round(g, ix, iy, TILE_W, TILE_H, 5, Ui.CARD);
		Ui.roundOutline(g, ix, iy, TILE_W, TILE_H, 5, 0x60FACC15);
		picture(g, ix, iy, e, 0xFFFFFFFF);
		int tx = ix + TILE_W + 10, ty = iy + 1;
		for (var line : lines) {
			g.text(minecraft.font, line, tx, ty, Ui.TEXT, false);
			ty += 11;
		}
		ty += 4;
		amountLine(g, "slashclient-hud.cosmetics.buy.have", have, tx, ty, Ui.TEXT_2);
		ty += 12;
		if (enough) amountLine(g, "slashclient-hud.cosmetics.buy.after", have - e.price(), tx, ty, Ui.MUTED);
		else amountLine(g, "slashclient-hud.cosmetics.buy.missing", e.price() - have, tx, ty, Ui.DANGER);
		int cy = y + 12 + Math.max(TILE_H, textH) + 8;
		if (hint != null) cy = Ui.wrapped(g, hint, x + 12, cy, bw - 24, Ui.MUTED) + 4;
		if (error != null) {
			Ui.draw(g, Ui.fit(error, bw - 24), x + 12, cy, Ui.DANGER);
			cy += 13;
		}
		// Cancel on the left, Buy (gold-bordered, or greyed out without enough Sparks) on the right
		int half = (bw - 24 - 6) / 2;
		Ui.button(g, "cos:buy:cancel", x + 12, cy, half, 15, null, Ui.tr("slashclient-hud.cosmetics.buy.cancel"), false, mx, my);
		hits.add(new Hit(x + 12, cy, half, 15, () -> {
			if (!buyBusy) buying = null;
		}));
		int bx = x + 12 + half + 6;
		Component label = Ui.tr(buyBusy ? "slashclient-hud.cosmetics.buy.busy" : "slashclient-hud.cosmetics.buy.confirm");
		if (enough && !buyBusy) {
			Ui.button(g, "cos:buy:confirm", bx, cy, half, 15, "spark", label, true, mx, my);
			hits.add(new Hit(bx, cy, half, 15, () -> buy(e)));
		} else {
			Ui.round(g, bx, cy, half, 15, 4, Ui.CARD);
			Ui.roundOutline(g, bx, cy, half, 15, 4, Ui.BORDER);
			Ui.centered(g, Ui.fit(label, half - 10), bx + half / 2, cy + 4, Ui.MUTED);
		}
		Ui.end();
		// a click beside the box closes it, as Cancel
		hits.add(0, new Hit(0, 0, width, height, () -> {
			if (!buyBusy) buying = null;
		}));
	}

	/** "You have: ✦ 1 250 Sparks": the label, the spark and the amount. */
	private static void amountLine(GuiGraphicsExtractor g, String key, int amount, int x, int y, int color) {
		Component label = Ui.tr(key, "");
		Ui.draw(g, label, x, y, color);
		int ax = x + Ui.width(label) + 1;
		Sparks.icon(g, ax, y, 8);
		Ui.draw(g, Ui.bold(Sparks.format(amount)), ax + 10, y, color == Ui.DANGER ? Ui.DANGER : Sparks.GOLD);
	}

	private void tile(GuiGraphicsExtractor g, int mx, int my, int x, int y, Entry e, boolean selected) {
		boolean over = Ui.inside(mx, my, x, y, TILE_W, TILE_H) && my >= gridTop && my < gridBottom;
		boolean locked = e != null && !e.available();
		// in the shop: it can be had for Sparks (a click offers to buy it), and is tried on like the rest
		boolean sale = e != null && e.forSale();
		float t = Ui.hover("cos:" + slot + ":" + (e == null ? "" : e.id()), over && (!locked || sale));
		Ui.round(g, x, y, TILE_W, TILE_H, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
		Ui.roundOutline(g, x, y, TILE_W, TILE_H, 5, selected ? Ui.ACCENT_LIGHT : sale ? Ui.blend(0x40FACC15, 0xA0FACC15, t) : Ui.blend(Ui.BORDER, 0x883B82F6, t));
		if (e == null) Ui.icon(g, "close", x + (TILE_W - 12) / 2, y + (TILE_H - 12) / 2, 12, Ui.MUTED);
		else picture(g, x, y, e, sale ? Ui.blend(0x90FFFFFF, 0xFFFFFFFF, t) : locked ? 0x60FFFFFF : 0xFFFFFFFF);
		if (sale) {
			// the price on a dark strip along the bottom: the spark and the number
			Component price = Ui.bold(Sparks.compact(e.price()));
			int w = 8 + 1 + Ui.width(price), sx = x + (TILE_W - w) / 2;
			Ui.round(g, x + 2, y + TILE_H - 11, TILE_W - 4, 9, 3, 0xE00A0D14);
			Sparks.icon(g, sx, y + TILE_H - 10, 7);
			Ui.draw(g, price, sx + 9, y + TILE_H - 10, Sparks.GOLD);
		}
		// earned with an achievement: a lock (the tooltip says how); in the shop: a lock too; given by an admin or a rank: a cross
		if (locked) Ui.icon(g, e.hint().isEmpty() && !sale ? "close" : "lock", x + TILE_W - 10, y + 3, 7, Sparks.GOLD);
		else if (e != null && !e.rank().isEmpty()) g.fill(x + TILE_W - 7, y + 3, x + TILE_W - 3, y + 7, switch (e.rank()) {
			case "admin" -> 0xFFEF4444;
			case "support" -> 0xFF38BDF8;
			case "friend" -> 0xFF22C55E;
			case "friend_pink" -> 0xFFEC4899;
			case "supporter" -> 0xFFF472B6;
			default -> 0xFFFACC15;
		});
		// tried on by the figure (kill effects are not worn)
		if (over && (!locked || sale) && !slot.equals("kill")) hoverNow = e == null ? "" : e.id();
		if (over) {
			tooltip = e == null ? Ui.tr("slashclient-hud.cosmetics.nothing")
				: sale ? Ui.text(e.name() + " · " + Sparks.format(e.price()))
				: locked && !e.hint().isEmpty() ? Ui.fit(Ui.text(e.hint()), width - 20)
				: locked ? Ui.tr(e.rank().isEmpty() ? "slashclient-hud.cosmetics.exclusive" : "slashclient-hud.cosmetics.rankOnly", e.name(), Ui.tr("slashclient-hud.rank." + e.rank()))
				: Ui.text(e.name());
			if (sale) tooltip2 = Ui.tr("slashclient-hud.cosmetics.shopHint", Sparks.name());
			tipX = x + TILE_W / 2;
			tipY = y - 2;
		}
		// only the part of it that shows takes clicks (the grid scrolls under the slot tabs)
		int top = Math.max(y, gridTop), bottom = Math.min(y + TILE_H, gridBottom);
		if (sale && bottom > top) hits.add(new Hit(x, top, TILE_W, bottom - top, () -> offer(e)));
		else if (!locked && bottom > top) hits.add(new Hit(x, top, TILE_W, bottom - top, () -> wear(e)));
	}

	/** The item's picture on a tile at x, y (TILE_W × TILE_H), tinted with `alpha` (white, see-through for what is locked). */
	private void picture(GuiGraphicsExtractor g, int x, int y, Entry e, int alpha) {
		switch (e.slot()) {
			case "cape" -> {
				// the cape's front (10×16 at 1,1 of the 64×32 layout, our textures are 4×), an animated one's first frame
				String tex = Cosmetics.ANIMATED.containsKey(e.id()) ? e.id() + "_" + (System.currentTimeMillis() / 120) % Cosmetics.ANIMATED.get(e.id()) : e.id();
				g.blit(RenderPipelines.GUI_TEXTURED, Cosmetics.textureId("cape", tex), x + (TILE_W - 18) / 2, y + (TILE_H - 29) / 2, 4, 4, 18, 29, 40, 64, 256, 128, alpha);
			}
			case "wings", "elytra" ->
				// the back of one wing
				g.blit(RenderPipelines.GUI_TEXTURED, Cosmetics.textureId(e.slot(), e.id()), x + (TILE_W - 18) / 2, y + (TILE_H - 30) / 2, 136, 8, 18, 30, 48, 80, 256, 128, alpha);
			case "suit" ->
				// the whole suit from the front, a little from above
				g.blit(RenderPipelines.GUI_TEXTURED, Suits.icon(e.id()), x + (TILE_W - 30) / 2, y + (TILE_H - 30) / 2, 0, 0, 30, 30, 64, 64, 64, 64, alpha);
			case "shield" ->
				// the shield's face (12x22 at 1,1 of the game's 64x64 shield layout, ours are 4x)
				g.blit(RenderPipelines.GUI_TEXTURED, Cosmetics.textureId("item/held", e.id()), x + (TILE_W - 18) / 2, y + (TILE_H - 33) / 2, 4, 4, 18, 33, 48, 88, 256, 256, alpha);
			case "weapon" ->
				// the sword's or bow's own picture, larger
				g.blit(RenderPipelines.GUI_TEXTURED, Cosmetics.textureId("item/held", e.id()), x + (TILE_W - 24) / 2, y + (TILE_H - 24) / 2, 0, 0, 24, 24, 16, 16, 16, 16, alpha);
			case "ring" ->
				// the ring itself (the left square of its picture)
				g.blit(RenderPipelines.GUI_TEXTURED, RingEffects.texture(e.id()), x + (TILE_W - 26) / 2, y + (TILE_H - 26) / 2, 0, 0, 26, 26, 64, 64, 128, 64, alpha);
			case "prop" ->
				// the prop seen from its side
				g.blit(RenderPipelines.GUI_TEXTURED, Props.icon(e.id()), x + (TILE_W - 28) / 2, y + (TILE_H - 28) / 2, 0, 0, 28, 28, 64, 64, 64, 64, alpha);
			case "hat", "top", "shoes", "hands", "face", "ears" ->
				// a view of it from the front, a little from above
				g.blit(RenderPipelines.GUI_TEXTURED, Clothing.icon(e.id()), x + (TILE_W - 26) / 2, y + (TILE_H - 26) / 2, 0, 0, 26, 26, 64, 64, 64, 64, alpha);
			case "back", "tail" ->
				// a view of it from behind, a little from above
				g.blit(RenderPipelines.GUI_TEXTURED, Gear.icon(e.id()), x + (TILE_W - 26) / 2, y + (TILE_H - 26) / 2, 0, 0, 26, 26, 64, 64, 64, 64, alpha);
			case "spray" ->
				// the picture itself
				g.blit(RenderPipelines.GUI_TEXTURED, Sprays.texture(e.id()), x + (TILE_W - 28) / 2, y + (TILE_H - 28) / 2, 0, 0, 28, 28, 64, 64, 64, 64, alpha);
			default -> {
				// our own pets have a picture of their own
				if (OurPets.IDS.contains(e.id())) g.blit(RenderPipelines.GUI_TEXTURED, OurPets.icon(e.id()), x + (TILE_W - 24) / 2, y + (TILE_H - 24) / 2, 0, 0, 24, 24, 64, 64, 64, 64, alpha);
				// the leaf auras: three of their leaves, falling
				String leaves = Leaves.variant(e.id());
				if (leaves != null) {
					String[] colours = leaves.equals("gold") ? new String[] {"gold", "gold", "gold"} : new String[] {"red", "gold", "brown"};
					g.blit(RenderPipelines.GUI_TEXTURED, Leaves.picture(colours[0], 2), x + 4, y + 8, 0, 0, 16, 16, 8, 8, 8, 8, alpha);
					g.blit(RenderPipelines.GUI_TEXTURED, Leaves.picture(colours[1], 0), x + 18, y + 6, 0, 0, 10, 10, 8, 8, 8, 8, alpha);
					g.blit(RenderPipelines.GUI_TEXTURED, Leaves.picture(colours[2], 1), x + 16, y + 22, 0, 0, 12, 12, 8, 8, 8, 8, alpha);
				}
				Item item = ITEMS.get(e.id());
				if (item != null) Ui.icon(g, item, "m-appearance", x + (TILE_W - 16) / 2, y + (TILE_H - 16) / 2);
			}
		}
	}

	/** For the test: as if the wheel moved the grid by this many pixels (the next frame keeps it in range). */
	void scrollBy(int pixels) {
		scroll += pixels;
	}

	@Override
	//#if MC >= 1.20.2
	public boolean mouseScrolled(double x, double y, double h, double v) {
	//#else
	//$ public boolean mouseScrolled(double x, double y, double v) {
	//#endif
		if (buying != null) return true;
		// over the slot tabs (when not all their rows show): a row at a time
		if (tabRows > tabShown && x >= px && x < px + pw && y >= tabTop - 2 && y < tabBottom + 2) {
			tabScroll = Math.max(0, Math.min(tabRows - tabShown, tabScroll - (int) Math.signum(v)));
			return true;
		}
		if (maxScroll <= 0) return false;
		scroll = Math.max(0, Math.min(maxScroll, scroll - (int) Math.round(v * (TILE_H + GAP) / 2.0)));
		return true;
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseClicked(MouseButtonEvent e, boolean doubleClick) {
	//#else
	//$ public boolean mouseClicked(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//$ 	boolean doubleClick = false;
	//#endif
		//#if MC >= 1.21.9
		if (super.mouseClicked(e, doubleClick)) return true;
		//#else
		//$ if (super.mouseClicked(e.x(), e.y(), e.button())) return true;
		//#endif
		if (buying == null && e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT && bar.press(e.x(), e.y())) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
		if (buying == null && e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT && tabBar.press(e.x(), e.y())) {
			tabScroll = Math.round(tabBar.drag(e.y()) / TAB_ROW);
			return true;
		}
		for (int i = hits.size() - 1; i >= 0; i--) {
			Hit h = hits.get(i);
			if (Ui.inside(e.x(), e.y(), h.x(), h.y(), h.w(), h.h())) {
				h.action().run();
				return true;
			}
		}
		// the figure turns when dragged with the left button anywhere beside the panel (the figure has that side to itself)
		// by the constant: 26.3 numbers the buttons anew (left 1); the game tests' bare 0 never comes from a real mouse
		if (e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT && fw > 0 && e.x() < px - 6) {
			turning = true;
			return true;
		}
		return false;
	}
	@Override
	//#if MC >= 1.21.9
	public boolean mouseDragged(MouseButtonEvent e, double dx, double dy) {
	//#else
	//$ public boolean mouseDragged(double mouseX, double mouseY, int button, double dx, double dy) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		if (bar.dragging()) {
			scroll = Math.round(bar.drag(e.y()));
			return true;
		}
		if (tabBar.dragging()) {
			tabScroll = Math.round(tabBar.drag(e.y()) / TAB_ROW);
			return true;
		}
		if (turning) {
			dragTurn += (float) dx * 1.6f;
			return true;
		}
		//#if MC >= 1.21.9
		return super.mouseDragged(e, dx, dy);
		//#else
		//$ return super.mouseDragged(e.x(), e.y(), e.button(), dx, dy);
		//#endif
	}

	@Override
	//#if MC >= 1.21.9
	public boolean mouseReleased(MouseButtonEvent e) {
	//#else
	//$ public boolean mouseReleased(double mouseX, double mouseY, int button) {
	//$ 	MouseButtonEvent e = new MouseButtonEvent(mouseX, mouseY, button);
	//#endif
		bar.release();
		tabBar.release();
		turning = false;
		//#if MC >= 1.21.9
		return super.mouseReleased(e);
		//#else
		//$ return super.mouseReleased(e.x(), e.y(), e.button());
		//#endif
	}


	//#if MC >= 1.20.2
	@Override
	//#endif
	public void extractBackground(GuiGraphicsExtractor g, int mx, int my, float delta) {
		if (minecraft.level == null) {
			// opened from the main menu: its panorama, darkened the same way (the figure stands on the left)
			extractPanorama(g, delta);
			g.fill(0, 0, width, height, 0x800A0D14);
			return;
		}
		// the figure stands on the darkened game; for kill effects the real player stays in full view
		g.fill(slot.equals("kill") ? px - 12 : 0, 0, width, height, 0x70000000);
	}

	@Override
	public boolean isPauseScreen() {
		return false;
	}

	@Override
	public void removed() {
		if (camera != null) minecraft.options.setCameraType(camera);
		super.removed();
	}

	@Override
	public void onClose() {
		// Escape on the "buy it?" box closes only the box
		if (buying != null) {
			if (!buyBusy) buying = null;
			return;
		}
		minecraft.setScreenAndShow(parent);
	}
}
