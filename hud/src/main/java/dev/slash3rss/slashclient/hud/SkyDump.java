// SkyUp's tasks are played on 26.3: the GUI dump is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

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

/**
 * A dump of the open chest-like GUI (F7 while it is open): every item's name and lore as text, with
 * its colours and as the server sent it (JSON), into config/slashclient-skyup/zrzuty. Made to show
 * what SkyUp's GUIs (the island tasks) hold, so the task tracker can be checked against them.
 */
public final class SkyDump {
	private SkyDump() {}

	static KeyMapping key;
	static final Path DIR = FabricLoader.getInstance().getConfigDir().resolve("slashclient-skyup").resolve("zrzuty");

	/** A key on a container screen: F7 dumps it; true when it was ours. */
	static boolean key(AbstractContainerScreen<?> screen, net.minecraft.client.input.KeyEvent e) {
		if (key == null || !key.matches(e)) return false;
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
			SlashHud.LOG.warn("SlashClient: GUI dump: {}", e.toString());
			Compat.chat(mc).addClientSystemMessage(Component.translatable("slashclient-hud.skyDump.failed", e.toString()));
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
		out.append("# Okno: ").append(screen.getClass().getSimpleName()).append(", sloty: ").append(screen.getMenu().slots.size()).append("\n\n");
		for (Slot slot : screen.getMenu().slots) {
			if (slot.container instanceof Inventory || !slot.hasItem()) continue;
			ItemStack stack = slot.getItem();
			out.append("## Slot ").append(slot.index).append(" · ").append(BuiltInRegistries.ITEM.getKey(stack.getItem())).append(" ×").append(stack.getCount()).append('\n');
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
