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
 * aura, pet, hat, top, kill effect), the player's figure beside the panel trying on the item under
 * the mouse (turned to show its back for what is worn there, running for a trail, turned by
 * dragging it; for kill effects in a world the real player, from behind). Choices go to the SlashClient
 * server through the launcher, for the Minecraft account being played when it is linked to the
 * SlashClient account (each can have a set of its own), else for the whole account.
 */
public class CosmeticsScreen extends Screen {
	private static final String[] SLOTS = {"cape", "wings", "elytra", "trail", "aura", "pet", "hat", "top", "kill"};
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
		Map.entry("axolotl", Items.AXOLOTL_SPAWN_EGG), Map.entry("frog", Items.FROG_SPAWN_EGG), Map.entry("fox", Items.FOX_SPAWN_EGG),
		// kill effects
		Map.entry("lightning", Items.TRIDENT), Map.entry("blood", Items.REDSTONE), Map.entry("heartburst", Items.ROSE_BUSH),
		Map.entry("firework", Items.FIREWORK_STAR), Map.entry("soulrise", Items.SOUL_CAMPFIRE), Map.entry("enderpoof", Items.ENDER_EYE),
		Map.entry("confetti", Items.PAPER), Map.entry("blast", Items.TNT), Map.entry("shatter", Items.BLUE_ICE),
		Map.entry("coins", Items.GOLD_NUGGET), Map.entry("ghost", Items.GHAST_TEAR), Map.entry("flamering", Items.FIRE_CHARGE));
	private static final int TILE_W = 32, TILE_H = 40, GAP = 4;

	/** `hint`: how to earn an item that only an achievement gives ("" for the rest). */
	private record Entry(String id, String slot, String name, String rank, boolean available, String hint) {
		Entry(String id, String slot, String name, String rank, boolean available) {
			this(id, slot, name, rank, available, "");
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
	/** The player's figure on the left, and where it is on screen. */
	private dev.slash3rss.slashclient.hud.ui.SkinPreview figure;
	private int fx, fy, fw, fh;
	/** The figure's turn by dragging it (degrees), and whether it is being dragged now. */
	private float dragTurn;
	private boolean turning;
	/** The item under the mouse in this slot, tried on by the figure ("" the "nothing" tile, null none); `hoverNow` is this frame's. */
	private String tried, hoverNow;
	private CameraType camera;
	private Component tooltip;
	private int tipX, tipY;
	private int px, py, pw, ph;

	public CosmeticsScreen(Screen parent) {
		super(Component.translatable("slashclient-hud.cosmetics"));
		this.parent = parent;
	}

	/** For the screenshot test (no launcher there): every item this mod knows, a few locked, some worn. */
	static CosmeticsScreen sample(String slot) {
		CosmeticsScreen screen = new CosmeticsScreen(null);
		List<Entry> list = new ArrayList<>();
		for (String id : Cosmetics.CAPES) list.add(new Entry(id, "cape", id, id.startsWith("staff_") ? id.substring(6) : "", !id.equals("staff_partner") && !id.equals("streak30"),
			id.equals("streak30") ? "Osiągnięcie „Seria 30 dni”: Graj co najmniej 10 minut dziennie przez 30 dni z rzędu." : ""));
		for (String id : Cosmetics.WINGS) list.add(new Entry(id, "wings", id, "", !id.equals("phoenix")));
		for (String id : Cosmetics.ELYTRAS) list.add(new Entry(id, "elytra", id, "", true));
		for (String id : Cosmetics.TRAILS) list.add(new Entry(id, "trail", id, "", true));
		for (String id : Cosmetics.AURAS) list.add(new Entry(id, "aura", id, id.equals("royal") ? "admin" : "", true));
		for (String id : Cosmetics.PETS) list.add(new Entry(id, "pet", id, "", true));
		for (String id : Clothing.HATS) list.add(new Entry(id, "hat", id, "", true));
		for (String id : Clothing.TOPS) list.add(new Entry(id, "top", id, "", true));
		for (String id : KillEffects.IDS) list.add(new Entry(id, "kill", id, "", true));
		screen.items = List.copyOf(list);
		screen.worn.putAll(Map.of("cape", "aurora", "wings", "angel", "pet", "allay", "hat", "tophat", "top", "scarf", "kill", "firework"));
		screen.character = "test";
		screen.characterName = "Slash3rss";
		screen.ownSet = true;
		screen.status = "";
		screen.slot = slot;
		screen.camera = CameraType.FIRST_PERSON;
		return screen;
	}

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

	/** How the figure stands for a slot: its back for what is worn there, its side for a trail (degrees). */
	private static float turnFor(String slot) {
		return switch (slot) {
			case "cape", "wings", "elytra" -> 180;
			case "trail" -> -90;
			default -> 0;
		};
	}

	private void pick(String s) {
		if (s.equals(slot)) return;
		slot = s;
		scroll = 0;
		dragTurn = 0;
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
				List<Entry> list = new ArrayList<>();
				boolean polish = minecraft.options.languageCode.startsWith("pl");
				for (JsonElement e : catalog.getAsJsonArray("items")) {
					JsonObject o = e.getAsJsonObject();
					// newer cosmetics than this version has pictures for stay out of the menu
					if (!Cosmetics.knows(o.get("slot").getAsString(), o.get("id").getAsString())) continue;
					String hint = polish ? "hint" : "hintEn";
					list.add(new Entry(o.get("id").getAsString(), o.get("slot").getAsString(), o.get("name").getAsString(),
						o.has("rank") && !o.get("rank").isJsonNull() ? o.get("rank").getAsString() : "", o.get("available").getAsBoolean(),
						o.has(hint) && !o.get(hint).isJsonNull() ? o.get(hint).getAsString() : ""));
				}
				items = List.copyOf(list);
				applyMe(me);
				status = "";
			} catch (Exception e) {
				status = e.getMessage() != null && e.getMessage().contains("401") ? "slashclient-hud.cosmetics.signIn" : "slashclient-hud.cosmetics.error";
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
		bar.hide();
		tried = hoverNow;
		hoverNow = null;
		boolean world = minecraft.level != null;
		// kill effects play in the world, around the real player seen from behind; else the camera stays as it was
		if (world && camera != null) {
			CameraType want = slot.equals("kill") ? CameraType.THIRD_PERSON_BACK : camera;
			if (minecraft.options.getCameraType() != want) minecraft.options.setCameraType(want);
		}
		// your figure, wearing what you pick and trying on what is under the mouse
		fw = 0;
		if (px - 12 >= 64 && !(world && slot.equals("kill"))) {
			if (figure == null) {
				figure = new dev.slash3rss.slashclient.hud.ui.SkinPreview(minecraft);
				figure.look.turnTo(turnFor(slot));
			}
			// as tall as fits, but narrow enough that open wings (about a box width to each side) stay between the screen's edge and the panel
			fh = Math.min(height - 40, Math.min(240, px - 24));
			fw = fh / 2;
			fx = (px - 12 - fw) / 2;
			fy = (height - fh) / 2;
			Map<String, String> set;
			synchronized (worn) {
				set = new HashMap<>(worn);
			}
			if (tried != null) set.put(slot, tried);
			// wings take the cape's place: on the cape's tab the cape shows; running, they would hide the trail
			if (slot.equals("cape") || slot.equals("trail")) set.remove("wings");
			var look = figure.look;
			look.wearing = set;
			look.turn = turnFor(slot) + dragTurn;
			look.running = slot.equals("trail");
			look.elytra = slot.equals("elytra");
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
		// the slots, as small tabs
		int tx = x;
		for (String s : SLOTS) {
			Component label = Ui.tr("slashclient-hud.cosmetics.slot." + s);
			int w = Ui.width(label) + 14;
			if (tx + w > px + pw - 12) {
				tx = x;
				y += 19;
			}
			boolean on = s.equals(slot);
			Ui.button(g, "cos:slot:" + s, tx, y, w, 15, null, label, on, mx, my);
			if (worn.containsKey(s)) g.fill(tx + w - 4, y + 2, tx + w - 2, y + 4, 0xFF4ADE80);
			hits.add(new Hit(tx, y, w, 15, () -> pick(s)));
			tx += w + 4;
		}
		y += 23;
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
		for (int i = 0; i < shown.size(); i++) {
			Entry e = shown.get(i);
			int ix = x + (i % perRow) * (TILE_W + GAP), iy = y + (i / perRow) * (TILE_H + GAP) - scroll;
			if (iy + TILE_H < gridTop || iy > gridBottom) continue;
			tile(g, mx, my, ix, iy, e, (e == null ? "" : e.id()).equals(current));
		}
		Ui.end();
		g.disableScissor();
		// where in the list we are; taken with the mouse it scrolls too
		bar.draw(g, px + pw - 8, gridTop, gridBottom - gridTop, scroll, maxScroll, mx, my);
		Ui.end();
		if (tooltip != null) {
			int w = Ui.width(tooltip) + 12;
			int tx2 = Math.max(4, Math.min(width - w - 4, tipX - w / 2));
			Ui.round(g, tx2, tipY - 15, w, 15, 4, 0xF0111622);
			Ui.roundOutline(g, tx2, tipY - 15, w, 15, 4, 0x403B82F6);
			Ui.draw(g, tooltip, tx2 + 6, tipY - 11, Ui.TEXT);
		}
	}

	private void tile(GuiGraphicsExtractor g, int mx, int my, int x, int y, Entry e, boolean selected) {
		boolean over = Ui.inside(mx, my, x, y, TILE_W, TILE_H) && my >= gridTop && my < gridBottom;
		boolean locked = e != null && !e.available();
		float t = Ui.hover("cos:" + slot + ":" + (e == null ? "" : e.id()), over && !locked);
		Ui.round(g, x, y, TILE_W, TILE_H, 5, Ui.blend(Ui.CARD, Ui.CARD_HOVER, t));
		Ui.roundOutline(g, x, y, TILE_W, TILE_H, 5, selected ? Ui.ACCENT_LIGHT : Ui.blend(Ui.BORDER, 0x883B82F6, t));
		int alpha = locked ? 0x60FFFFFF : 0xFFFFFFFF;
		if (e == null) Ui.icon(g, "close", x + (TILE_W - 12) / 2, y + (TILE_H - 12) / 2, 12, Ui.MUTED);
		else switch (e.slot()) {
			case "cape" -> {
				// the cape's front (10×16 at 1,1 of the 64×32 layout, our textures are 4×), an animated one's first frame
				String tex = Cosmetics.ANIMATED.containsKey(e.id()) ? e.id() + "_" + (System.currentTimeMillis() / 120) % Cosmetics.ANIMATED.get(e.id()) : e.id();
				g.blit(RenderPipelines.GUI_TEXTURED, Cosmetics.textureId("cape", tex), x + (TILE_W - 18) / 2, y + (TILE_H - 29) / 2, 4, 4, 18, 29, 40, 64, 256, 128, alpha);
			}
			case "wings", "elytra" ->
				// the back of one wing
				g.blit(RenderPipelines.GUI_TEXTURED, Cosmetics.textureId(e.slot(), e.id()), x + (TILE_W - 18) / 2, y + (TILE_H - 30) / 2, 136, 8, 18, 30, 48, 80, 256, 128, alpha);
			case "hat", "top" ->
				// a view of it from the front, a little from above
				g.blit(RenderPipelines.GUI_TEXTURED, Clothing.icon(e.id()), x + (TILE_W - 26) / 2, y + (TILE_H - 26) / 2, 0, 0, 26, 26, 64, 64, 64, 64, alpha);
			default -> {
				// our own pets have a picture of their own
				if (OurPets.IDS.contains(e.id())) g.blit(RenderPipelines.GUI_TEXTURED, OurPets.icon(e.id()), x + (TILE_W - 24) / 2, y + (TILE_H - 24) / 2, 0, 0, 24, 24, 64, 64, 64, 64, alpha);
				Item item = ITEMS.get(e.id());
				if (item != null) Ui.icon(g, item, "m-appearance", x + (TILE_W - 16) / 2, y + (TILE_H - 16) / 2);
			}
		}
		// earned with an achievement: a lock (the tooltip says how); given by an admin or a rank: a cross
		if (locked) Ui.icon(g, e.hint().isEmpty() ? "close" : "lock", x + TILE_W - 10, y + 3, 7, 0xFFFACC15);
		else if (e != null && !e.rank().isEmpty()) g.fill(x + TILE_W - 7, y + 3, x + TILE_W - 3, y + 7, switch (e.rank()) {
			case "admin" -> 0xFFEF4444;
			case "support" -> 0xFF38BDF8;
			case "friend" -> 0xFF22C55E;
			case "friend_pink" -> 0xFFEC4899;
			default -> 0xFFFACC15;
		});
		// tried on by the figure (kill effects are not worn)
		if (over && !locked && !slot.equals("kill")) hoverNow = e == null ? "" : e.id();
		if (over) {
			tooltip = e == null ? Ui.tr("slashclient-hud.cosmetics.nothing")
				: locked && !e.hint().isEmpty() ? Ui.fit(Ui.text(e.hint()), width - 20)
				: locked ? Ui.tr(e.rank().isEmpty() ? "slashclient-hud.cosmetics.exclusive" : "slashclient-hud.cosmetics.rankOnly", e.name(), Ui.tr("slashclient-hud.rank." + e.rank()))
				: Ui.text(e.name());
			tipX = x + TILE_W / 2;
			tipY = y - 2;
		}
		// only the part of it that shows takes clicks (the grid scrolls under the slot tabs)
		int top = Math.max(y, gridTop), bottom = Math.min(y + TILE_H, gridBottom);
		if (!locked && bottom > top) hits.add(new Hit(x, top, TILE_W, bottom - top, () -> wear(e)));
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
		if (e.button() == 0 && bar.press(e.x(), e.y())) {
			scroll = Math.round(bar.drag(e.y()));
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
		if (e.button() == 0 && fw > 0 && e.x() < px - 6) {
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
		minecraft.setScreenAndShow(parent);
	}
}
