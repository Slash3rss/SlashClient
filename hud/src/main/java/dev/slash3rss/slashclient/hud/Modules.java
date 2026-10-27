package dev.slash3rss.slashclient.hud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.multiplayer.PlayerInfo;
import net.minecraft.network.chat.Component;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffectUtil;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.inventory.InventoryModule;
import dev.slash3rss.slashclient.hud.map.Minimap;
import dev.slash3rss.slashclient.hud.skyup.DungeonMap;
//#if MC >= 26.3
import dev.slash3rss.slashclient.hud.skyup.SkyCase;
import dev.slash3rss.slashclient.hud.skyup.SkyFish;
import dev.slash3rss.slashclient.hud.skyup.SkyTasks;
import dev.slash3rss.slashclient.hud.skyup.SkyWardrobe;
import dev.slash3rss.slashclient.hud.skyup.SkyXp;
//#endif

/** All HUD modules, in the order the editor lists them. */
public final class Modules {
	public static final int PAD = 3;
	static HudConfig cfg;

	private Modules() {}

	static List<HudModule> all() {
		List<HudModule> out = new ArrayList<>(List.of(new Fps(), new Ping(), new Cps(), new Coords(), new Speed(), new Clock(), new MoreModules.Server(), new MoreModules.Players(),
			new MoreModules.Memory(), new MoreModules.Cpu(), new MoreModules.Gpu(), new MoreModules.Biome(), new MoreModules.DayTime(), new MoreModules.Light(), new MoreModules.Session(),
			new MoreModules.Combo(), new MoreModules.Reach(), new MoreModules.Movement(), new MoreModules.Saturation(), new MoreModules.ItemCounter(), new MoreModules.Target(), new Extras.AttackIndicator(),
			new Armor(), new Effects(), new Keystrokes(), new Sprint()));
		out.addAll(ExtraModules.all());
		// where the player would be in the other dimension (Overworld / Nether)
		out.add(new NetherCoords());
		// SkyUp.pl's dungeons: shown only inside one
		out.add(new DungeonMap());
		// the ground around, from above (no entities)
		out.add(new Minimap());
		//#if MC >= 26.3
		// SkyUp's island tasks being tracked
		out.add(new SkyTasks.Module());
		// and SkyUp's fish, this session and for good
		out.add(new SkyFish.Module());
		// and what SkyUp's cases gave
		out.add(new SkyCase.Module());
		// and what is worn in SkyUp's cosmetic wardrobe
		out.add(new SkyWardrobe.Module());
		// and the bottling countdown of SkyUp's XP calculator, while it runs
		out.add(new SkyXp.Module());
		//#endif
		// a Twitch and a Kick channel's live chat
		out.addAll(StreamChatModule.all());
		// what plays on this computer (Spotify, a browser, another player)
		out.add(new NowPlayingModule());
		// the backpack's 27 slots
		out.add(new InventoryModule());
		// the game's own parts, moved in the editor like the modules
		out.addAll(GameParts.ALL);
		// the chat first: under every module, which stay draggable over its big box
		out.add(0, GameParts.CHAT);
		return List.copyOf(out);
	}

	/** The module being drawn: its own text colour and shadow stand in for the HUD-wide ones. */
	static HudConfig.Placement drawing;

	/** A key's (or a part's) box, with the corners the module being drawn has. */
	static void box(GuiGraphicsExtractor g, int x, int y, int w, int h, int color) {
		int r = drawing == null ? 0 : drawing.radius(cfg);
		if (r > 0) dev.slash3rss.slashclient.hud.ui.Ui.round(g, x, y, w, h, r, color);
		else g.fill(x, y, x + w, y + h, color);
	}

	/** The text colour of the module being drawn (its own, or the HUD-wide one): for its plain text, not its accents. */
	public static int textColor() {
		return drawing != null ? drawing.textColor(cfg) : cfg.textColor;
	}

	public static boolean shadow() {
		return drawing != null ? drawing.shadow(cfg) : cfg.textShadow;
	}

	public static void text(GuiGraphicsExtractor g, Minecraft mc, String s, int x, int y, int color) {
		g.text(mc.font, s, x, y, color, shadow());
	}

	public static void text(GuiGraphicsExtractor g, Minecraft mc, Component s, int x, int y, int color) {
		g.text(mc.font, s, x, y, color, shadow());
	}

	/** Green when good, yellow, then red: for ping, FPS and durability. */
	static int grade(double value, double good, double bad) {
		// the two set to the same number: green before it, red from it
		double t = bad == good ? (value < good ? 0 : 1) : Math.max(0, Math.min(1, (value - good) / (bad - good)));
		int r = (int) (t < 0.5 ? 85 + 340 * t : 255);
		int gr = (int) (t < 0.5 ? 255 : 255 - (t - 0.5) * 2 * 170);
		return 0xFF000000 | (r << 16) | (gr << 8) | 85;
	}

	// ---------- clicks per second, counted from frame to frame ----------

	static final class Clicks {
		private final ArrayDeque<Long> left = new ArrayDeque<>();
		private final ArrayDeque<Long> right = new ArrayDeque<>();
		private boolean wasLeft;
		private boolean wasRight;

		void sample(Minecraft mc) {
			long now = System.currentTimeMillis();
			boolean l = mc.options.keyAttack.isDown();
			boolean r = mc.options.keyUse.isDown();
			if (l && !wasLeft) left.add(now);
			if (r && !wasRight) right.add(now);
			wasLeft = l;
			wasRight = r;
			while (!left.isEmpty() && now - left.peekFirst() > 1000) left.pollFirst();
			while (!right.isEmpty() && now - right.peekFirst() > 1000) right.pollFirst();
		}

		/** A click the autoclicker made: no button goes down, but it counts as one. */
		void clicked(boolean onLeft) {
			(onLeft ? left : right).add(System.currentTimeMillis());
		}

		int left() {
			return left.size();
		}

		int right() {
			return right.size();
		}
	}

	static final Clicks CLICKS = new Clicks();

	/** Horizontal speed in blocks per second, measured once per game tick. */
	static double speed;

	// ---------- text modules ----------

	abstract static class TextModule implements HudModule {
		abstract Component content(Minecraft mc);

		public int color(Minecraft mc) {
			return textColor();
		}

		@Override
		public int width(Minecraft mc) {
			return mc.font.width(content(mc)) + PAD * 2;
		}

		@Override
		public int height(Minecraft mc) {
			return mc.font.lineHeight + PAD * 2 - 1;
		}

		@Override
		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			text(g, mc, content(mc), x + PAD, y + PAD, color(mc));
		}
	}

	/** Sprinting and sneaking, and whether the game's toggle mode holds them for you. */
	static final class Sprint extends TextModule {
		public String id() {
			return "sprint";
		}

		Component content(Minecraft mc) {
			if (mc.player == null) return Component.empty();
			boolean toggle = mc.options.toggleSprint().get(), sneakToggle = mc.options.toggleCrouch().get();
			if (mc.player.isShiftKeyDown()) return Component.translatable(sneakToggle ? "slashclient-hud.sprint.sneakToggled" : "slashclient-hud.sprint.sneak");
			if (mc.player.isSprinting() || (toggle && mc.options.keySprint.isDown())) return Component.translatable(toggle ? "slashclient-hud.sprint.toggled" : "slashclient-hud.sprint.on");
			return Component.empty();
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !content(mc).getString().isEmpty();
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			text(g, mc, Component.translatable("slashclient-hud.sprint.toggled"), x + PAD, y + PAD, color(mc));
		}

		@Override
		public int width(Minecraft mc) {
			Component c = content(mc);
			return mc.font.width(c.getString().isEmpty() ? Component.translatable("slashclient-hud.sprint.toggled") : c) + PAD * 2;
		}
	}

	static final class Fps extends TextModule {
		public String id() {
			return "fps";
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.fps", mc.getFps());
		}

		@Override
		public int color(Minecraft mc) {
			// green from the player's number up (60), red at the other and below (20)
			return cfg.fpsColored ? grade(-mc.getFps(), -cfg.fpsGood, -cfg.fpsBad) : textColor();
		}
	}

	static final class Ping extends TextModule {
		public String id() {
			return "ping";
		}

		@Override
		public boolean textColored() {
			return false;
		}

		/** Our own measurement; until its first answer the tab list's number (0 there means unknown). */
		private int latency(Minecraft mc) {
			if (mc.player == null || mc.getConnection() == null) return -1;
			if (Latency.ms() >= 0) return Latency.ms();
			PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
			return info == null || info.getLatency() <= 0 ? -1 : info.getLatency();
		}

		@Override
		public boolean visible(Minecraft mc) {
			// in singleplayer there is no network between you and the world
			return !mc.hasSingleplayerServer() && latency(mc) >= 0;
		}

		Component content(Minecraft mc) {
			int ms = latency(mc);
			return Component.translatable("slashclient-hud.ping", ms < 0 ? 42 : ms);
		}

		@Override
		public int color(Minecraft mc) {
			return grade(Math.max(0, latency(mc)), cfg.pingGood, cfg.pingBad);
		}
	}

	static final class Cps extends TextModule {
		public String id() {
			return "cps";
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.cps", CLICKS.left(), CLICKS.right());
		}
	}

	static final class Coords implements HudModule {
		public String id() {
			return "coords";
		}

		/** The numbers (with the height or without), and the facing when it is on. */
		private String[] lines(Minecraft mc) {
			String xyz, facing = "N";
			if (mc.player == null) xyz = cfg.coordsY ? "XYZ: 128 64 -256" : "XZ: 128 -256";
			else {
				var p = mc.player;
				int d = cfg.coordsDecimals;
				java.util.function.DoubleFunction<String> n = v -> String.format(java.util.Locale.ROOT, "%." + d + "f", v);
				String x = d == 0 ? String.valueOf(p.getBlockX()) : n.apply(p.getX()), y = d == 0 ? String.valueOf(p.getBlockY()) : n.apply(p.getY()),
					z = d == 0 ? String.valueOf(p.getBlockZ()) : n.apply(p.getZ());
				xyz = cfg.coordsY ? "XYZ: " + x + " " + y + " " + z : "XZ: " + x + " " + z;
				facing = Component.translatable("slashclient-hud.dir." + p.getDirection().getName()).getString();
			}
			return cfg.coordsFacing ? new String[] { xyz, facing } : new String[] { xyz };
		}

		/** The facing after the numbers rather than under them. */
		private static boolean oneLine(String[] l) {
			return l.length > 1 && cfg.coordsOneLine;
		}

		public int width(Minecraft mc) {
			String[] l = lines(mc);
			if (oneLine(l)) return mc.font.width(l[0] + "  " + l[1]) + PAD * 2;
			int w = 0;
			for (String s : l) w = Math.max(w, mc.font.width(s));
			return w + PAD * 2;
		}

		public int height(Minecraft mc) {
			String[] l = lines(mc);
			return l.length > 1 && !oneLine(l) ? mc.font.lineHeight * 2 + 1 + PAD * 2 - 1 : mc.font.lineHeight + PAD * 2 - 1;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			String[] l = lines(mc);
			text(g, mc, l[0], x + PAD, y + PAD, textColor());
			if (oneLine(l)) text(g, mc, l[1], x + PAD + mc.font.width(l[0] + "  "), y + PAD, 0xFFAAAAAA);
			else if (l.length > 1) text(g, mc, l[1], x + PAD, y + PAD + mc.font.lineHeight + 1, 0xFFAAAAAA);
		}
	}

	static final class Speed extends TextModule {
		public String id() {
			return "speed";
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.speed", String.format("%." + cfg.speedDecimals + "f", speed));
		}
	}

	static final class Clock extends TextModule {
		private static final DateTimeFormatter H24 = DateTimeFormatter.ofPattern("HH:mm"), H24S = DateTimeFormatter.ofPattern("HH:mm:ss");
		private static final DateTimeFormatter H12 = DateTimeFormatter.ofPattern("h:mm a", java.util.Locale.ENGLISH), H12S = DateTimeFormatter.ofPattern("h:mm:ss a", java.util.Locale.ENGLISH);

		public String id() {
			return "clock";
		}

		Component content(Minecraft mc) {
			DateTimeFormatter f = cfg.clock12h ? (cfg.clockSeconds ? H12S : H12) : (cfg.clockSeconds ? H24S : H24);
			return Component.literal(LocalTime.now().format(f));
		}
	}

	// ---------- armour with durability ----------

	static final class Armor implements HudModule {
		private static final EquipmentSlot[] SLOTS = { EquipmentSlot.HEAD, EquipmentSlot.CHEST, EquipmentSlot.LEGS, EquipmentSlot.FEET, EquipmentSlot.MAINHAND };

		public String id() {
			return "armor";
		}

		private List<ItemStack> items(Minecraft mc) {
			List<ItemStack> out = new ArrayList<>();
			if (mc.player != null) for (EquipmentSlot slot : SLOTS) {
				ItemStack s = mc.player.getItemBySlot(slot);
				// the hand only counts when it holds something that wears out
				if (!s.isEmpty() && (slot != EquipmentSlot.MAINHAND || cfg.armorHand && s.isDamageableItem())) out.add(s);
			}
			return out;
		}

		/**
		 * The biggest the module gets, for the editor: a whole netherite set and a sword, all new
		 * (the longest numbers); empty in the main menu, where items can't be made yet.
		 */
		private static List<ItemStack> sample() {
			List<ItemStack> out = new ArrayList<>();
			for (var item : List.of(Items.NETHERITE_HELMET, Items.NETHERITE_CHESTPLATE, Items.NETHERITE_LEGGINGS, Items.NETHERITE_BOOTS, Items.NETHERITE_SWORD)) {
				ItemStack s = Ui.stack(item);
				if (s != null && (item != Items.NETHERITE_SWORD || cfg.armorHand)) out.add(s);
			}
			return out;
		}

		/** What it shows: in the editor always the full example (so its box is as big as it gets), else what is worn. */
		private List<ItemStack> shown(Minecraft mc) {
			if (Compat.screen(mc) instanceof HudEditScreen) return sample();
			List<ItemStack> list = items(mc);
			return list.isEmpty() ? sample() : list;
		}

		/** What stands by an item: the wear left (a number or a share), or how many there are; nothing with the game's bars. */
		private static String label(ItemStack s) {
			boolean bars = "bar".equals(cfg.armorDurability);
			if (!s.isDamageableItem()) return s.getCount() > 1 && !bars ? String.valueOf(s.getCount()) : "";
			int left = s.getMaxDamage() - s.getDamageValue();
			if (bars) return "";
			return "percent".equals(cfg.armorDurability) ? Math.round(100f * left / s.getMaxDamage()) + "%" : String.valueOf(left);
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !items(mc).isEmpty();
		}

		private static int labelWidth(Minecraft mc, List<ItemStack> list) {
			int w = 0;
			for (ItemStack s : list) w = Math.max(w, mc.font.width(label(s)));
			return w;
		}

		/** Side by side, each item's column: as wide as the item or its widest label. */
		private static int column(int labelWidth) {
			return Math.max(17, labelWidth + 2);
		}

		public int width(Minecraft mc) {
			List<ItemStack> list = shown(mc);
			int w = labelWidth(mc, list);
			if (cfg.armorHorizontal) return Math.max(1, list.size()) * column(w) - 1 + PAD * 2;
			return 16 + (w > 0 ? 4 + w : 0) + PAD * 2;
		}

		public int height(Minecraft mc) {
			List<ItemStack> list = shown(mc);
			if (cfg.armorHorizontal) return 16 + (labelWidth(mc, list) > 0 ? 10 : 0) + PAD * 2;
			return Math.max(1, list.size()) * 17 - 1 + PAD * 2;
		}

		private void drawList(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<ItemStack> list) {
			int col = column(labelWidth(mc, list)), i = 0;
			for (ItemStack s : list) {
				int ix = cfg.armorHorizontal ? x + PAD + i * col + (col - 17) / 2 : x + PAD, iy = cfg.armorHorizontal ? y + PAD : y + PAD + i * 17;
				g.item(s, ix, iy);
				// the game's own wear bar (and count) on the item
				if ("bar".equals(cfg.armorDurability)) dev.slash3rss.slashclient.hud.inventory.ShulkerPreview.decorations(g, mc.font, s, ix, iy);
				String l = label(s);
				int color = s.isDamageableItem() ? grade(s.getDamageValue(), 0, s.getMaxDamage()) : textColor();
				if (!l.isEmpty()) {
					if (cfg.armorHorizontal) text(g, mc, l, x + PAD + i * col + (col - 1 - mc.font.width(l)) / 2, iy + 18, color);
					else text(g, mc, l, x + PAD + 20, iy + 4, color);
				}
				i++;
			}
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawList(g, mc, x, y, items(mc));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawList(g, mc, x, y, shown(mc));
		}
	}

	// ---------- potion effects with time left ----------

	static final class Effects implements HudModule {
		public String id() {
			return "effects";
		}

		/** Each effect's picture, in the order of `rows` (null = none). */
		private final List<net.minecraft.core.Holder<net.minecraft.world.effect.MobEffect>> icons = new ArrayList<>();

		private List<Component[]> rows(Minecraft mc, boolean preview) {
			List<Component[]> out = new ArrayList<>();
			icons.clear();
			if (mc.player != null && mc.level != null) {
				//#if MC >= 1.20.2
				float tickrate = mc.level.tickRateManager().tickrate();
				//#endif
				for (MobEffectInstance e : mc.player.getActiveEffects()) {
					Component name = Component.translatable(e.getDescriptionId());
					if (e.getAmplifier() > 0) name = Component.empty().append(name).append(" ").append(Component.translatable("enchantment.level." + (e.getAmplifier() + 1)));
					//#if MC >= 1.20.2
					out.add(new Component[] { name, MobEffectUtil.formatDuration(e, 1.0f, tickrate) });
					//#else
					//$ out.add(new Component[] { name, MobEffectUtil.formatDuration(e, 1.0f) });
					//#endif
					icons.add(e.getEffect());
				}
			}
			if (out.isEmpty() && preview) {
				out.add(new Component[] { Component.empty().append(Component.translatable("effect.minecraft.speed")).append(" II"), Component.literal("1:30") });
				out.add(new Component[] { Component.translatable("effect.minecraft.fire_resistance"), Component.literal("7:45") });
				icons.add(net.minecraft.world.effect.MobEffects.SPEED);
				icons.add(net.minecraft.world.effect.MobEffects.FIRE_RESISTANCE);
			}
			return out;
		}

		private static int iconRoom() {
			return cfg.effectIcons ? 11 : 0;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !rows(mc, false).isEmpty();
		}

		private int width(Minecraft mc, List<Component[]> rows) {
			int w = 0;
			for (Component[] r : rows) w = Math.max(w, mc.font.width(r[0]) + 6 + mc.font.width(r[1]));
			return w + PAD * 2 + iconRoom();
		}

		public int width(Minecraft mc) {
			return width(mc, rows(mc, true));
		}

		public int height(Minecraft mc) {
			return rows(mc, true).size() * (mc.font.lineHeight + 2) - 3 + PAD * 2;
		}

		private void drawRows(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<Component[]> rows) {
			int w = width(mc, rows);
			int row = y + PAD;
			for (int i = 0; i < rows.size(); i++) {
				Component[] r = rows.get(i);
				if (cfg.effectIcons && i < icons.size())
					//#if MC >= 1.21.2
					g.blitSprite(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, Compat.effectSprite(icons.get(i)), x + PAD, row - 1, 9, 9);
					//#else
					//$ dev.slash3rss.slashclient.hud.compat.Legacy.effect(g, icons.get(i), x + PAD, row - 1, 9);
					//#endif
				text(g, mc, r[0], x + PAD + iconRoom(), row, textColor());
				text(g, mc, r[1], x + w - PAD - mc.font.width(r[1]), row, 0xFFAAAAAA);
				row += mc.font.lineHeight + 2;
			}
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawRows(g, mc, x, y, rows(mc, false));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawRows(g, mc, x, y, rows(mc, true));
		}
	}

	// ---------- keystrokes: movement keys, mouse buttons with CPS, jump ----------

	static final class Keystrokes implements HudModule {
		private static final int KEY = 22;
		private static final int GAP = 2;

		public String id() {
			return "keystrokes";
		}

		public int width(Minecraft mc) {
			return KEY * 3 + GAP * 2;
		}

		public int height(Minecraft mc) {
			return KEY * 2 + GAP + (cfg.keystrokesMouse ? GAP + KEY : 0) + (cfg.keystrokesSpace ? GAP + 10 : 0);
		}

		/** A key's box: while up the module's background (none with it off), while down the chosen colour. */
		private static int fill(boolean down) {
			if (down) return 0xC0000000 | (cfg.keystrokesPressed & 0xFFFFFF);
			if (drawing != null && !drawing.background(cfg)) return 0;
			return Math.round((drawing == null ? 50 : drawing.opacity()) * 2.55f) << 24 | (cfg.backgroundColor & 0xFFFFFF);
		}

		/** Black on a light pressed key, white on a dark one. */
		private static int onPressed() {
			int c = cfg.keystrokesPressed;
			return ((c >> 16 & 0xFF) * 299 + (c >> 8 & 0xFF) * 587 + (c & 0xFF) * 114) / 1000 > 140 ? 0xFF000000 : 0xFFFFFFFF;
		}

		private void key(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h, KeyMapping k, String label, String sub) {
			boolean down = k.isDown();
			int bg = fill(down);
			if (bg >>> 24 != 0) box(g, x, y, w, h, bg);
			int color = down ? onPressed() : textColor();
			int ty = y + (h - mc.font.lineHeight) / 2 + 1 - (sub == null ? 0 : 4);
			g.text(mc.font, label, x + (w - mc.font.width(label)) / 2, ty, color, !down && shadow());
			if (sub != null) g.text(mc.font, sub, x + (w - mc.font.width(sub)) / 2, ty + 9, down ? onPressed() : 0xFFAAAAAA, false);
		}

		private static String name(KeyMapping k) {
			String s = k.getTranslatedKeyMessage().getString();
			return s.length() > 3 ? s.substring(0, 3) : s;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			var o = mc.options;
			int step = KEY + GAP;
			key(g, mc, x + step, y, KEY, KEY, o.keyUp, name(o.keyUp), null);
			key(g, mc, x, y + step, KEY, KEY, o.keyLeft, name(o.keyLeft), null);
			key(g, mc, x + step, y + step, KEY, KEY, o.keyDown, name(o.keyDown), null);
			key(g, mc, x + step * 2, y + step, KEY, KEY, o.keyRight, name(o.keyRight), null);
			int half = (width(mc) - GAP) / 2;
			int my = y + step * 2;
			if (cfg.keystrokesMouse) {
				key(g, mc, x, my, half, KEY, o.keyAttack, "LMB", cfg.keystrokesCps ? CLICKS.left() + " CPS" : null);
				key(g, mc, x + half + GAP, my, width(mc) - half - GAP, KEY, o.keyUse, "RMB", cfg.keystrokesCps ? CLICKS.right() + " CPS" : null);
				my += KEY + GAP;
			}
			if (!cfg.keystrokesSpace) return;
			boolean jump = o.keyJump.isDown();
			int bg = fill(jump);
			if (bg >>> 24 != 0) box(g, x, my, width(mc), 10, bg);
			g.fill(x + width(mc) / 2 - 12, my + 4, x + width(mc) / 2 + 12, my + 6, jump ? onPressed() : textColor());
		}
	}
}
