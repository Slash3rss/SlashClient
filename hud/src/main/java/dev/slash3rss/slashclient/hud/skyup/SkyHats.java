// SkyUp's jobs and their hats are played on 26.3: the hat's contents are read there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.ChatFormatting;
import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtOps;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.MutableComponent;
import net.minecraft.world.item.ItemStack;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SkyUp's "Kapelusz pracusia" holds the job hats put into it, but its tooltip only says which one is worn. The
 * server keeps a copy of each hat in the item's data (kjobs:universal_hat_data_items: per job, the hat as the
 * server saves items, "v2-26.3-" and the gzipped item in base64); this reads them and adds to the tooltip each
 * hat inside, how many are joined in it and how much of its XP is left. The hat worn wears the outer hat itself
 * (its copy inside keeps the wear from when it was put in), so its wear is the outer hat's. It is the same item in
 * the wardrobe (/garderoba), so the lines are there too. A single job hat gets one line: the XP it has left.
 */
public final class SkyHats {
	private SkyHats() {}

	private static final String ITEMS = "kjobs:universal_hat_data_items", CURRENT = "kjobs:universal_hat_data_current_job";

	/** A hat inside: its job, the hat, its name, the XP used and in all, how many hats it joins, its XP bonus, worn or not. */
	public record Hat(int job, ItemStack stack, String name, int used, int max, int stacks, double multiplier, boolean active) {
		int left() {
			return Math.max(0, max - used);
		}
	}

	private static final Map<String, ItemStack> decoded = new HashMap<>();

	public static void register() {
		net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback.EVENT.register((stack, context, flag, lines) -> {
			if (SlashHud.config != null && SlashHud.config.skyHats) add(stack, lines);
		});
	}

	private static CompoundTag bukkit(ItemStack s) {
		var data = s.get(DataComponents.CUSTOM_DATA);
		return data == null ? null : data.copyTag().getCompoundOrEmpty("PublicBukkitValues");
	}

	/** The hats inside a universal hat, by job; empty for anything else. */
	public static List<Hat> inside(ItemStack hat) {
		CompoundTag b = bukkit(hat);
		if (b == null || !b.contains(ITEMS)) return List.of();
		int current = b.getIntOr(CURRENT, 0);
		List<Hat> out = new ArrayList<>();
		try {
			for (var e : JsonParser.parseString(b.getStringOr(ITEMS, "{}")).getAsJsonObject().entrySet()) {
				int job = Integer.parseInt(e.getKey());
				JsonElement v = e.getValue();
				ItemStack s = v.isJsonPrimitive() ? decode(v.getAsString()) : ItemStack.EMPTY;
				if (s.isEmpty()) continue;
				CompoundTag ib = bukkit(s);
				boolean active = job == current;
				int max = s.getMaxDamage();
				int used = active ? hat.getDamageValue() : s.getDamageValue();
				out.add(new Hat(job, s, s.getHoverName().getString(), used, max,
					ib == null ? 1 : ib.getIntOr("kjobs:hat_stacks", 1), ib == null ? 1 : ib.getDoubleOr("kjobs:hat_exp_multiplier", 1), active));
			}
		} catch (RuntimeException e) {
			SlashHud.LOG.debug("SlashClient: hat's contents: {}", e.toString());
		}
		out.sort(Comparator.comparingInt(Hat::job));
		return out;
	}

	/** One hat as the server keeps it: "v2-26.3-" and the gzipped item (its NBT) in base64. */
	static ItemStack decode(String saved) {
		ItemStack hit = decoded.get(saved);
		if (hit != null) return hit;
		Minecraft mc = Minecraft.getInstance();
		if (mc.level == null) return ItemStack.EMPTY;
		ItemStack s = ItemStack.EMPTY;
		try {
			int dash = saved.indexOf('-', saved.indexOf('-') + 1);
			byte[] raw = Base64.getDecoder().decode(saved.substring(dash + 1).trim());
			CompoundTag tag = NbtIo.readCompressed(new ByteArrayInputStream(raw), NbtAccounter.unlimitedHeap());
			s = ItemStack.CODEC.parse(mc.level.registryAccess().createSerializationContext(NbtOps.INSTANCE), tag).result().orElse(ItemStack.EMPTY);
		} catch (Exception e) {
			SlashHud.LOG.debug("SlashClient: a hat inside: {}", e.toString());
		}
		if (decoded.size() > 256) decoded.clear();
		decoded.put(saved, s);
		return s;
	}

	/** "29 955": thousands apart, as SkyUp writes them. */
	static String number(int n) {
		return String.format(java.util.Locale.ROOT, "%,d", n).replace(',', ' ');
	}

	private static ChatFormatting colour(int left, int max) {
		float share = max <= 0 ? 0 : (float) left / max;
		return share > 0.5f ? ChatFormatting.GREEN : share > 0.2f ? ChatFormatting.YELLOW : ChatFormatting.RED;
	}

	/** The lines added under the tooltip: a heading and each hat inside (or, for a single job hat, its XP left). */
	public static List<Component> lines(ItemStack stack) {
		CompoundTag b = bukkit(stack);
		if (b != null && b.contains("kjobs:hat_item") && stack.getMaxDamage() > 0) {
			int left = Math.max(0, stack.getMaxDamage() - stack.getDamageValue());
			return List.of(Component.literal("▪ ").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.BOLD)
				.append(Component.translatable("slashclient-hud.skyHats.left").withStyle(s -> s.withColor(ChatFormatting.AQUA).withBold(false)))
				.append(Component.literal(" " + number(left)).withStyle(s -> s.withColor(colour(left, stack.getMaxDamage())).withBold(false)))
				.append(Component.literal(" / " + number(stack.getMaxDamage()) + " xp").withStyle(s -> s.withColor(ChatFormatting.GRAY).withBold(false))));
		}
		List<Hat> hats = inside(stack);
		if (hats.isEmpty()) return List.of();
		List<Component> out = new ArrayList<>();
		out.add(Component.literal("‌"));
		out.add(Component.literal("▪ ").withStyle(ChatFormatting.DARK_GRAY, ChatFormatting.BOLD)
			.append(Component.translatable("slashclient-hud.skyHats.inside").withStyle(s -> s.withColor(ChatFormatting.AQUA).withBold(false))));
		for (Hat h : hats) {
			ChatFormatting color = colour(h.left(), h.max());
			MutableComponent line = Component.literal("  ").append(Component.literal(h.name()).withStyle(h.active() ? ChatFormatting.GOLD : ChatFormatting.YELLOW));
			// "Kask Górnika x30": the name already says how many are joined
			if (h.stacks() > 1 && !h.name().trim().endsWith("x" + h.stacks())) line.append(Component.literal(" ×" + h.stacks()).withStyle(ChatFormatting.GRAY));
			line.append(Component.literal(" · ").withStyle(ChatFormatting.DARK_GRAY));
			line.append(Component.literal(number(h.left())).withStyle(color));
			line.append(Component.literal(" / " + number(h.max()) + " xp").withStyle(ChatFormatting.GRAY));
			if (h.active()) line.append(Component.literal(" ").append(Component.translatable("slashclient-hud.skyHats.worn")).withStyle(ChatFormatting.AQUA));
			out.add(line);
		}
		return out;
	}

	private static void add(ItemStack stack, List<Component> lines) {
		lines.addAll(lines(stack));
	}

	/** For the test: the lines a universal hat gets, as plain text, one per line. */
	public static String linesForTest(ItemStack stack) {
		StringBuilder out = new StringBuilder();
		for (Component c : lines(stack)) out.append(c.getString().replace("‌", "")).append('\n');
		return out.toString().trim();
	}

	/** For the test: a hat as the server keeps it inside the universal hat. */
	public static String encodeForTest(ItemStack hat) throws java.io.IOException {
		Minecraft mc = Minecraft.getInstance();
		var tag = (CompoundTag) ItemStack.CODEC.encodeStart(mc.level.registryAccess().createSerializationContext(NbtOps.INSTANCE), hat).getOrThrow();
		tag.putInt("DataVersion", 5023);
		var bytes = new java.io.ByteArrayOutputStream();
		NbtIo.writeCompressed(tag, bytes);
		return "v2-26.3-" + Base64.getEncoder().encodeToString(bytes.toByteArray());
	}
}
//#endif
