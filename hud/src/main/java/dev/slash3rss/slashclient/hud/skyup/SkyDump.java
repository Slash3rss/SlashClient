// SkyUp's tasks are played on 26.3: the GUI dump is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.mojang.serialization.JsonOps;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.ChatFormatting;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.ComponentSerialization;
import net.minecraft.network.chat.Style;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemLore;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;

/**
 * A dump of the open chest-like GUI (F7 while it is open): every item's name and lore as text, with
 * its colours and as the server sent it (JSON), into config/slashclient-skyup/zrzuty. Made to show
 * what SkyUp's GUIs (the island tasks) hold, so the task tracker can be checked against them.
 */
public final class SkyDump {
	private SkyDump() {}

	public static KeyMapping key;
	static final Path DIR = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("zrzuty");

	/** A key on a container screen: F7 dumps it; true when it was ours. */
	public static boolean key(AbstractContainerScreen<?> screen, net.minecraft.client.input.KeyEvent e) {
		if (key == null || !key.matches(e) || SlashHud.config == null || !SlashHud.config.skyDump) return false;
		dump(Minecraft.getInstance(), screen);
		return true;
	}

	static void dump(Minecraft mc, AbstractContainerScreen<?> screen) {
		try {
			String title = screen.getTitle().getString();
			String time = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH-mm-ss"));
			Path file = DIR.resolve(time + " " + safe(title) + ".txt");
			Files.createDirectories(DIR);
			Files.writeString(file, text(mc, screen, title));
			Path latest = DIR.resolve("ostatni.txt");
			Files.writeString(latest, Files.readString(file));
			Component link = Component.literal(file.getFileName().toString()).withStyle(s -> s.withUnderlined(true).withColor(ChatFormatting.AQUA)
				.withClickEvent(new ClickEvent.OpenFile(DIR)));
			Compat.chat(mc).addClientSystemMessage(Component.translatable("slashclient-hud.skyDump.saved", link));
		} catch (Exception e) {
			Compat.chat(mc).addClientSystemMessage(Component.translatable("slashclient-hud.skyDump.failed", dev.slash3rss.slashclient.hud.ErrorText.of(e)));
		}
	}

	/** The dump itself: a few lines about where, then each item of the GUI (the player's own inventory left out). */
	static String text(Minecraft mc, AbstractContainerScreen<?> screen, String title) {
		StringBuilder out = new StringBuilder();
		out.append("# SlashClient – zrzut GUI\n");
		out.append("# Tytuł: ").append(title).append('\n');
		out.append("# Tytuł (kolory): ").append(colored(screen.getTitle())).append('\n');
		out.append("# Serwer: ").append(mc.getCurrentServer() == null ? "-" : mc.getCurrentServer().ip).append('\n');
		out.append("# Czas: ").append(LocalDateTime.now()).append('\n');
		out.append("# Okno: ").append(screen.getClass().getSimpleName()).append(", sloty: ").append(screen.getMenu().slots.size()).append('\n');
		out.append("# Tablica (scoreboard):\n");
		for (String line : SkyCounters.sidebar(mc)) out.append("#   | ").append(line).append('\n');
		out.append('\n');
		// the player's own inventory: its items too (fish with their weight and size in the lore)
		// (read from the player, not the screen: the creative inventory's slots are its tabs')
		boolean own = screen instanceof net.minecraft.client.gui.screens.inventory.InventoryScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen;
		List<String> labels = new ArrayList<>();
		List<ItemStack> stacks = new ArrayList<>();
		if (own && mc.player != null) {
			Inventory inv = mc.player.getInventory();
			for (int i = 0; i < inv.getContainerSize(); i++) {
				labels.add("Ekwipunek " + i);
				stacks.add(inv.getItem(i));
			}
		} else {
			for (Slot slot : screen.getMenu().slots) {
				if (slot.container instanceof Inventory) continue;
				labels.add("Slot " + slot.index);
				stacks.add(slot.getItem());
			}
		}
		for (int n = 0; n < stacks.size(); n++) {
			ItemStack stack = stacks.get(n);
			if (stack.isEmpty()) continue;
			out.append("## ").append(labels.get(n)).append(" · ").append(BuiltInRegistries.ITEM.getKey(stack.getItem())).append(" ×").append(stack.getCount()).append('\n');
			out.append("Nazwa: ").append(stack.getHoverName().getString()).append('\n');
			out.append("Nazwa (kolory): ").append(colored(stack.getHoverName())).append('\n');
			List<Component> lore = lore(stack);
			List<String> plain = new ArrayList<>();
			if (!lore.isEmpty()) {
				out.append("Opis:\n");
				for (Component line : lore) {
					plain.add(line.getString());
					out.append("  | ").append(line.getString()).append('\n');
				}
				out.append("Opis (kolory):\n");
				for (Component line : lore) out.append("  | ").append(colored(line)).append('\n');
			}
			// what else the server set on the item: its model (custom_model_data, item_model), its own data, enchantments, a head's owner…
			List<String> data = components(mc, stack);
			if (!data.isEmpty()) {
				out.append("Dane:\n");
				for (String line : data) out.append("  ").append(line).append('\n');
			}
			SkyTaskParser.Task task = SkyTaskParser.parse(title, stack.getHoverName().getString(), plain);
			out.append("Zadanie: ").append(task == null ? "nie" : summary(task)).append('\n');
			out.append("JSON nazwy: ").append(json(mc, stack.getHoverName())).append('\n');
			if (!lore.isEmpty()) {
				out.append("JSON opisu:\n");
				for (Component line : lore) out.append("  ").append(json(mc, line)).append('\n');
			}
			out.append('\n');
		}
		return out.toString();
	}

	static List<Component> lore(ItemStack stack) {
		ItemLore lore = stack.get(DataComponents.LORE);
		return lore == null ? List.of() : lore.lines();
	}

	/** What the parser made of it, to check by eye. */
	private static String summary(SkyTaskParser.Task t) {
		StringBuilder s = new StringBuilder("„").append(t.name).append("”");
		for (SkyTaskParser.Section sec : t.sections) {
			s.append(" | ").append(sec.header).append(sec.inventory() ? " (ekwipunek)" : "").append(":");
			for (SkyTaskParser.Req r : sec.items) {
				s.append(" [").append(r.thing).append(" ").append(r.current < 0 ? "?" : r.current).append("/").append(r.required < 0 ? "?" : r.required);
				if (!r.unit.isEmpty()) s.append(" ").append(r.unit);
				s.append("]");
			}
		}
		if (!t.rewards.isEmpty()) s.append(" | nagrody: ").append(String.join("; ", t.rewards));
		if (t.takesItems) s.append(" | zabiera przedmioty");
		return s.toString();
	}

	/** The text with a <#RRGGBB> mark where the colour changes (and <b>, <i> where bold or italic starts). */
	static String colored(Component c) {
		StringBuilder out = new StringBuilder();
		String[] last = { "" };
		c.visit((Style style, String text) -> {
			String mark = (style.getColor() == null ? "" : "<#" + String.format("%06X", style.getColor().getValue() & 0xFFFFFF) + ">")
				+ (style.isBold() ? "<b>" : "") + (style.isItalic() ? "<i>" : "");
			if (!mark.equals(last[0]) && !text.isEmpty()) {
				out.append(mark.isEmpty() ? "<reset>" : mark);
				last[0] = mark;
			}
			out.append(text);
			return Optional.empty();
		}, Style.EMPTY);
		return out.toString();
	}

	/**
	 * The item's components the server set (all but its name and lore, shown above), as JSON where they
	 * have a form for it: "minecraft:custom_model_data: {floats:[1001.0]}", "minecraft:custom_data: {…}".
	 */
	static List<String> components(Minecraft mc, ItemStack stack) {
		List<String> out = new ArrayList<>();
		var ops = mc.level != null ? mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE) : JsonOps.INSTANCE;
		var split = stack.getComponentsPatch().split();
		for (var c : split.added()) {
			var type = c.type();
			if (type == DataComponents.CUSTOM_NAME || type == DataComponents.LORE) continue;
			out.add(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type) + ": " + value(type, c.value(), ops));
		}
		// what the server took away from the item's usual ones
		for (var type : split.removed()) out.add(BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type) + ": (usunięte)");
		return out;
	}

	@SuppressWarnings("unchecked")
	private static <T> String value(net.minecraft.core.component.DataComponentType<T> type, Object value, com.mojang.serialization.DynamicOps<com.google.gson.JsonElement> ops) {
		String text;
		try {
			var codec = type.codec();
			text = codec == null ? String.valueOf(value) : codec.encodeStart(ops, (T) value).result().map(Object::toString).orElse(String.valueOf(value));
		} catch (Exception ex) {
			text = String.valueOf(value);
		}
		// a head's texture is a long base64: kept whole, it is what tells two heads apart
		return text.length() > 4000 ? text.substring(0, 4000) + "…" : text;
	}

	private static String json(Minecraft mc, Component c) {
		try {
			var ops = mc.level != null ? mc.level.registryAccess().createSerializationContext(JsonOps.INSTANCE) : JsonOps.INSTANCE;
			return ComponentSerialization.CODEC.encodeStart(ops, c).result().map(Object::toString).orElse("?");
		} catch (Exception e) {
			return "? " + e;
		}
	}

	private static String safe(String title) {
		String s = title.replaceAll("§.", "").replaceAll("[^\\p{L}\\p{N} _.-]", "").strip();
		return s.isEmpty() ? "gui" : s.length() > 40 ? s.substring(0, 40) : s;
	}
}
//#endif
