package dev.slash3rss.slashclient.hud;

import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
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

/** All HUD modules, in the order the editor lists them. */
public final class Modules {
	static final int PAD = 3;
	static HudConfig cfg;

	private Modules() {}

	static List<HudModule> all() {
		return List.of(new Fps(), new Ping(), new Cps(), new Coords(), new Speed(), new Clock(), new MoreModules.Server(), new MoreModules.Players(),
			new MoreModules.Memory(), new MoreModules.Biome(), new MoreModules.DayTime(), new MoreModules.Light(), new MoreModules.Session(),
			new MoreModules.Combo(), new MoreModules.Reach(), new MoreModules.Saturation(), new MoreModules.ItemCounter(), new MoreModules.Target(),
			new Armor(), new Effects(), new Keystrokes());
	}

	static void text(GuiGraphicsExtractor g, Minecraft mc, String s, int x, int y, int color) {
		g.text(mc.font, s, x, y, color, cfg.textShadow);
	}

	static void text(GuiGraphicsExtractor g, Minecraft mc, Component s, int x, int y, int color) {
		g.text(mc.font, s, x, y, color, cfg.textShadow);
	}

	/** Green when good, yellow, then red: for ping, FPS and durability. */
	static int grade(double value, double good, double bad) {
		double t = Math.max(0, Math.min(1, (value - good) / (bad - good)));
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

		int color(Minecraft mc) {
			return cfg.textColor;
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

	static final class Fps extends TextModule {
		public String id() {
			return "fps";
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.fps", mc.getFps());
		}
	}

	static final class Ping extends TextModule {
		public String id() {
			return "ping";
		}

		private int latency(Minecraft mc) {
			if (mc.player == null || mc.getConnection() == null) return -1;
			PlayerInfo info = mc.getConnection().getPlayerInfo(mc.player.getUUID());
			return info == null ? -1 : info.getLatency();
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
		int color(Minecraft mc) {
			return grade(Math.max(0, latency(mc)), 60, 250);
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

		private String[] lines(Minecraft mc) {
			if (mc.player == null) return new String[] { "XYZ: 128 64 -256", "N" };
			var p = mc.player;
			String facing = Component.translatable("slashclient-hud.dir." + p.getDirection().getName()).getString();
			return new String[] { "XYZ: " + p.getBlockX() + " " + p.getBlockY() + " " + p.getBlockZ(), facing };
		}

		public int width(Minecraft mc) {
			int w = 0;
			for (String s : lines(mc)) w = Math.max(w, mc.font.width(s));
			return w + PAD * 2;
		}

		public int height(Minecraft mc) {
			return mc.font.lineHeight * 2 + 1 + PAD * 2 - 1;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			String[] l = lines(mc);
			text(g, mc, l[0], x + PAD, y + PAD, cfg.textColor);
			text(g, mc, l[1], x + PAD, y + PAD + mc.font.lineHeight + 1, 0xFFAAAAAA);
		}
	}

	static final class Speed extends TextModule {
		public String id() {
			return "speed";
		}

		Component content(Minecraft mc) {
			return Component.translatable("slashclient-hud.speed", String.format("%.1f", speed));
		}
	}

	static final class Clock extends TextModule {
		private static final DateTimeFormatter FORMAT = DateTimeFormatter.ofPattern("HH:mm");

		public String id() {
			return "clock";
		}

		Component content(Minecraft mc) {
			return Component.literal(LocalTime.now().format(FORMAT));
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
				if (!s.isEmpty() && (slot != EquipmentSlot.MAINHAND || s.isDamageableItem())) out.add(s);
			}
			return out;
		}

		private static List<ItemStack> sample() {
			return List.of(new ItemStack(Items.DIAMOND_HELMET), new ItemStack(Items.DIAMOND_CHESTPLATE), new ItemStack(Items.IRON_LEGGINGS), new ItemStack(Items.DIAMOND_BOOTS));
		}

		private static String label(ItemStack s) {
			if (!s.isDamageableItem()) return s.getCount() > 1 ? String.valueOf(s.getCount()) : "";
			return String.valueOf(s.getMaxDamage() - s.getDamageValue());
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !items(mc).isEmpty();
		}

		private int width(Minecraft mc, List<ItemStack> list) {
			int w = 0;
			for (ItemStack s : list) w = Math.max(w, mc.font.width(label(s)));
			return 16 + 4 + w + PAD * 2;
		}

		public int width(Minecraft mc) {
			List<ItemStack> list = items(mc);
			return width(mc, list.isEmpty() ? sample() : list);
		}

		public int height(Minecraft mc) {
			int n = Math.max(1, items(mc).isEmpty() ? sample().size() : items(mc).size());
			return n * 17 - 1 + PAD * 2;
		}

		private void drawList(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<ItemStack> list) {
			int row = y + PAD;
			for (ItemStack s : list) {
				g.item(s, x + PAD, row);
				int color = s.isDamageableItem() ? grade(s.getDamageValue(), 0, s.getMaxDamage()) : cfg.textColor;
				text(g, mc, label(s), x + PAD + 20, row + 4, color);
				row += 17;
			}
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			drawList(g, mc, x, y, items(mc));
		}

		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			List<ItemStack> list = items(mc);
			drawList(g, mc, x, y, list.isEmpty() ? sample() : list);
		}
	}

	// ---------- potion effects with time left ----------

	static final class Effects implements HudModule {
		public String id() {
			return "effects";
		}

		private List<Component[]> rows(Minecraft mc, boolean preview) {
			List<Component[]> out = new ArrayList<>();
			if (mc.player != null && mc.level != null) {
				float tickrate = mc.level.tickRateManager().tickrate();
				for (MobEffectInstance e : mc.player.getActiveEffects()) {
					Component name = Component.translatable(e.getDescriptionId());
					if (e.getAmplifier() > 0) name = Component.empty().append(name).append(" ").append(Component.translatable("enchantment.level." + (e.getAmplifier() + 1)));
					out.add(new Component[] { name, MobEffectUtil.formatDuration(e, 1.0f, tickrate) });
				}
			}
			if (out.isEmpty() && preview) {
				out.add(new Component[] { Component.empty().append(Component.translatable("effect.minecraft.speed")).append(" II"), Component.literal("1:30") });
				out.add(new Component[] { Component.translatable("effect.minecraft.fire_resistance"), Component.literal("7:45") });
			}
			return out;
		}

		@Override
		public boolean visible(Minecraft mc) {
			return !rows(mc, false).isEmpty();
		}

		private int width(Minecraft mc, List<Component[]> rows) {
			int w = 0;
			for (Component[] r : rows) w = Math.max(w, mc.font.width(r[0]) + 6 + mc.font.width(r[1]));
			return w + PAD * 2;
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
			for (Component[] r : rows) {
				text(g, mc, r[0], x + PAD, row, cfg.textColor);
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
			return KEY * 3 + GAP * 3 + 10;
		}

		private void key(GuiGraphicsExtractor g, Minecraft mc, int x, int y, int w, int h, KeyMapping k, String label, String sub) {
			boolean down = k.isDown();
			g.fill(x, y, x + w, y + h, down ? 0xC0FFFFFF : 0x80000000);
			int color = down ? 0xFF000000 : cfg.textColor;
			int ty = y + (h - mc.font.lineHeight) / 2 + 1 - (sub == null ? 0 : 4);
			g.text(mc.font, label, x + (w - mc.font.width(label)) / 2, ty, color, !down && cfg.textShadow);
			if (sub != null) g.text(mc.font, sub, x + (w - mc.font.width(sub)) / 2, ty + 9, down ? 0xFF333333 : 0xFFAAAAAA, false);
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
			key(g, mc, x, my, half, KEY, o.keyAttack, "LMB", CLICKS.left() + " CPS");
			key(g, mc, x + half + GAP, my, width(mc) - half - GAP, KEY, o.keyUse, "RMB", CLICKS.right() + " CPS");
			int sy = my + KEY + GAP;
			boolean jump = o.keyJump.isDown();
			g.fill(x, sy, x + width(mc), sy + 10, jump ? 0xC0FFFFFF : 0x80000000);
			g.fill(x + width(mc) / 2 - 12, sy + 4, x + width(mc) / 2 + 12, sy + 6, jump ? 0xFF000000 : cfg.textColor);
		}
	}
}
