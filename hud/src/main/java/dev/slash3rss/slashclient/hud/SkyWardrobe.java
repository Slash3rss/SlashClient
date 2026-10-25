// SkyUp's wardrobe is played on 26.3: the module is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonElement;
import com.mojang.serialization.JsonOps;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * What the player wears in SkyUp's cosmetic wardrobe, read from its window (the only place it can be
 * changed): its five places (helmet, chestplate, leggings, boots and the work cap), each worn when it
 * holds an item instead of the red glass pane, whether the wardrobe is switched on
 * ("Kosmetyczna garderoba » Włączona") and whether the player sees it on themselves ("Widzenie własnej
 * garderoby » Włączone"). Saved, so it shows from the next join on without opening the window again.
 */
public final class SkyWardrobe {
	private SkyWardrobe() {}

	/** What was read last: the worn items (as the game saves items), the two switches (null: not seen yet). */
	static final class Saved {
		List<JsonElement> worn = new ArrayList<>();
		Boolean on, seen;
	}

	static final Path FILE = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("garderoba.json");
	private static final Gson GSON = new GsonBuilder().setPrettyPrinting().create();
	private static Saved saved;
	/** The worn items made from the saved ones (once the game can read them). */
	private static List<ItemStack> worn;
	private static int tick;

	static Saved saved() {
		if (saved == null) {
			try {
				if (Files.exists(FILE)) saved = GSON.fromJson(Files.readString(FILE), Saved.class);
			} catch (Exception e) {
				SlashHud.LOG.warn("SlashClient: SkyUp wardrobe: {}", e.toString());
			}
			if (saved == null) saved = new Saved();
			if (saved.worn == null) saved.worn = new ArrayList<>();
		}
		return saved;
	}

	private static void save() {
		try {
			Files.createDirectories(FILE.getParent());
			Files.writeString(FILE, GSON.toJson(saved()));
		} catch (Exception e) {
			SlashHud.LOG.warn("SlashClient: SkyUp wardrobe: {}", e.toString());
		}
	}

	static void tick(Minecraft mc) {
		if (!SkyTasks.onSkyUp(mc) || !(Compat.screen(mc) instanceof AbstractContainerScreen<?> screen)) return;
		// the items come after the window: read a few times a second
		if (++tick % 5 != 0) return;
		List<ItemStack> items = new ArrayList<>();
		for (Slot slot : screen.getMenu().slots) if (!(slot.container instanceof Inventory)) items.add(slot.getItem());
		read(mc, items);
	}

	/** "▪ Kosmetyczna garderoba » Włączona", "▪  LPM » Zdejmij": what is left of the » and what is right of it. */
	private static final Pattern LINE = Pattern.compile("^[▪\\s]*(.+?)\\s*»\\s*(.+?)\\s*$");

	private static String plain(String s) {
		return SkyTaskParser.plain(s).strip();
	}

	/** The wardrobe's places, in the order shown. */
	private static final List<String> PLACES = List.of("kosmetyczny hełm", "kosmetyczna zbroja", "kosmetyczne spodnie", "kosmetyczne buty", "czapka pracownicza");

	/** An open window's items: when it is the wardrobe, what is worn and the switches are taken from it; false when it is not. */
	static boolean read(Minecraft mc, List<ItemStack> items) {
		boolean wardrobe = false;
		Boolean on = null, seen = null;
		ItemStack[] places = new ItemStack[PLACES.size()];
		for (ItemStack stack : items) {
			if (stack.isEmpty()) continue;
			int place = PLACES.indexOf(name(stack).toLowerCase(Locale.ROOT));
			// an empty place shows the red pane
			if (place >= 0 && !SkyCase.itemId(stack).endsWith("glass_pane")) places[place] = stack.copyWithCount(1);
			for (Component line : SkyDump.lore(stack)) {
				Matcher m = LINE.matcher(plain(line.getString()));
				if (!m.matches()) continue;
				String left = m.group(1).toLowerCase(Locale.ROOT), right = m.group(2).toLowerCase(Locale.ROOT);
				if (left.equals("kosmetyczna garderoba")) {
					wardrobe = true;
					on = right.startsWith("włącz");
				} else if (left.equals("widzenie własnej garderoby")) seen = right.startsWith("włącz");
			}
		}
		List<ItemStack> now = new ArrayList<>();
		for (ItemStack stack : places) if (stack != null) now.add(stack);
		if (!wardrobe || mc.level == null) return false;
		var ops = mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE);
		List<JsonElement> json = new ArrayList<>();
		for (ItemStack stack : now) ItemStack.CODEC.encodeStart(ops, stack).result().ifPresent(json::add);
		Saved s = saved();
		if (!json.equals(s.worn) || on != s.on || seen != null && seen != s.seen) {
			s.worn = json;
			s.on = on;
			if (seen != null) s.seen = seen;
			worn = now;
			save();
		}
		return true;
	}

	/** The worn items, made from the saved ones the first time they are asked for in a world. */
	static List<ItemStack> worn(Minecraft mc) {
		if (worn == null && mc.level != null) {
			var ops = mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE);
			List<ItemStack> out = new ArrayList<>();
			for (JsonElement j : saved().worn) ItemStack.CODEC.parse(ops, j).result().ifPresent(out::add);
			worn = out;
		}
		return worn == null ? List.of() : worn;
	}

	/** "» Kosmetyczna zbroja «" without its marks. */
	static String name(ItemStack stack) {
		return plain(stack.getHoverName().getString()).replaceAll("^[»\\s]+|[«\\s]+$", "");
	}

	// ---------- on the HUD ----------

	public static final class Module implements HudModule {
		private static final int LINE_H = 10, ITEM_H = 17;

		public String id() {
			return "skywardrobe";
		}

		@Override
		public boolean visible(Minecraft mc) {
			return SkyTasks.onSkyUp(mc) && saved().on != null;
		}

		/** What is shown: the real wardrobe, or in the editor before it was read, a made-up one. */
		private record Shown(List<ItemStack> items, Boolean on, Boolean seen) {}

		private Shown shown(Minecraft mc) {
			if (visible(mc)) return new Shown(worn(mc), saved().on, saved().seen);
			ItemStack chest = new ItemStack(Items.DIAMOND_CHESTPLATE), legs = new ItemStack(Items.DIAMOND_LEGGINGS);
			chest.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME, Component.literal("» Kosmetyczna zbroja «"));
			legs.set(net.minecraft.core.component.DataComponents.CUSTOM_NAME, Component.literal("» Kosmetyczne spodnie «"));
			return new Shown(List.of(chest, legs), true, true);
		}

		private static List<Component> lines(Shown s) {
			HudConfig cfg = SlashHud.config;
			List<Component> out = new ArrayList<>();
			out.add(Component.translatable("slashclient-hud.skyWardrobe.title"));
			if (cfg.skyWardrobeStatus) {
				out.add(Component.translatable(Boolean.TRUE.equals(s.on) ? "slashclient-hud.skyWardrobe.on" : "slashclient-hud.skyWardrobe.off"));
				if (s.seen != null) out.add(Component.translatable(s.seen ? "slashclient-hud.skyWardrobe.seen" : "slashclient-hud.skyWardrobe.unseen"));
			}
			if (s.items.isEmpty()) out.add(Component.translatable("slashclient-hud.skyWardrobe.none"));
			return out;
		}

		public int width(Minecraft mc) {
			Shown s = shown(mc);
			int w = 70;
			for (Component c : lines(s)) w = Math.max(w, mc.font.width(c));
			if (SlashHud.config.skyWardrobeNames) for (ItemStack it : s.items) w = Math.max(w, 18 + mc.font.width(name(it)));
			else w = Math.max(w, s.items.size() * ITEM_H);
			return w + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			Shown s = shown(mc);
			int items = s.items.isEmpty() ? 0 : SlashHud.config.skyWardrobeNames ? s.items.size() * ITEM_H : ITEM_H;
			return lines(s).size() * LINE_H - 1 + items + Modules.PAD * 2;
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			Shown s = shown(mc);
			int left = x + Modules.PAD, row = y + Modules.PAD, i = 0;
			for (Component c : lines(s)) {
				// the title in SkyUp's aqua; "on" green, "off" grey
				int color = i == 0 ? 0xFF55FFFF : c.getString().equals(Component.translatable("slashclient-hud.skyWardrobe.none").getString()) ? 0xFF9CA3AF
					: (i == 1 && Boolean.TRUE.equals(s.on)) || (i == 2 && Boolean.TRUE.equals(s.seen)) ? 0xFF55FF55 : 0xFFAAAAAA;
				Modules.text(g, mc, c, left, row, color);
				row += LINE_H;
				i++;
			}
			if (SlashHud.config.skyWardrobeNames) {
				for (ItemStack it : s.items) {
					g.item(it, left, row);
					Modules.text(g, mc, Component.literal(name(it)), left + 18, row + 4, 0xFFE5E7EB);
					row += ITEM_H;
				}
			} else {
				for (ItemStack it : s.items) {
					g.item(it, left, row);
					left += ITEM_H;
				}
			}
		}
	}

	// ---------- for the in-game tests ----------

	static String debug(Minecraft mc) {
		StringBuilder out = new StringBuilder("on " + saved().on + " seen " + saved().seen + " worn");
		for (ItemStack it : worn(mc)) out.append(" ").append(name(it));
		return out.toString();
	}

	static void resetForTest() {
		saved = new Saved();
		worn = null;
	}

	/** As after a restart: read again from the file. */
	static void reloadForTest() {
		saved = null;
		worn = null;
	}
}
//#endif
