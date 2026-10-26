// SkyUp's wardrobe is played on 26.3: the module is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.ItemLore;

import java.util.ArrayList;
import java.util.List;
import dev.slash3rss.slashclient.hud.SlashHud;

/** For the game test of SkyUp's wardrobe (GameSkyWardrobe): its window as SkyUp sends it, and what the module read. */
public final class SkyWardrobeTestHooks {
	private SkyWardrobeTestHooks() {}

	/** On "SkyUp", nothing read yet, the module on. */
	public static void reset() {
		SkyTasks.testWorld = true;
		SkyWardrobe.resetForTest();
		SlashHud.config.placement("skywardrobe").enabled = true;
	}

	/**
	 * The wardrobe window (as in the owner's GUI dumps): the two switches, an accessory not worn, the
	 * helmet and boots empty, and the chestplate (and the leggings, when `legs`) worn.
	 */
	public static void open(boolean on, boolean seen, boolean legs) {
		var mc = Minecraft.getInstance();
		var chest = new SimpleContainer(54);
		chest.setItem(8, item("minecraft:player_head", "Przełącz wyświetlanie", "▪ Widzenie własnej garderoby » " + (seen ? "Włączone" : "Wyłączone"), "▪ LPM  » " + (seen ? "Wyłącz" : "Włącz")));
		chest.setItem(19, item("minecraft:paper", "Elfie uszy", "▪  LPM » Załóż"));
		chest.setItem(13, item("minecraft:red_stained_glass_pane", "Kosmetyczny hełm", "▪ SHIFT +  LPM w EQ » Załóż"));
		// the chestplate with a look of SkyUp's resource pack: another model and custom model data
		ItemStack worn = item("minecraft:diamond_chestplate", "Kosmetyczna zbroja", "▪ SHIFT +  LPM w EQ » Załóż", "▪  LPM » Zdejmij");
		worn.set(DataComponents.ITEM_MODEL, net.minecraft.resources.Identifier.withDefaultNamespace("netherite_chestplate"));
		worn.set(DataComponents.CUSTOM_MODEL_DATA, new net.minecraft.world.item.component.CustomModelData(List.of(7f), List.of(), List.of("skyup"), List.of()));
		chest.setItem(22, worn);
		chest.setItem(31, legs ? item("minecraft:diamond_leggings", "Kosmetyczne spodnie", "▪ SHIFT +  LPM w EQ » Załóż", "▪  LPM » Zdejmij")
			: item("minecraft:red_stained_glass_pane", "Kosmetyczne spodnie", "▪ SHIFT +  LPM w EQ » Załóż"));
		chest.setItem(40, item("minecraft:red_stained_glass_pane", "Kosmetyczne buty", "▪ SHIFT +  LPM w EQ » Załóż"));
		chest.setItem(45, item("minecraft:paper", "Szablon", "▪  LPM » Zapisz szablon", "▪  PPM » Wczytaj szablon"));
		chest.setItem(49, item("minecraft:paper", "Kosmetyczna garderoba", "▪ Kosmetyczna garderoba » " + (on ? "Włączona" : "Wyłączona"), "▪ LPM  » " + (on ? "Wyłącz" : "Włącz")));
		chest.setItem(52, item("minecraft:red_stained_glass_pane", "Czapka pracownicza", "▪  LPM w EQ » Załóż"));
		var menu = ChestMenu.sixRows(1000, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), Component.literal("")));
	}

	private static ItemStack item(String id, String name, String... lore) {
		ItemStack stack = new ItemStack(SkyCase.item(id));
		stack.set(DataComponents.CUSTOM_NAME, Component.literal("» " + name + " «"));
		List<Component> lines = new ArrayList<>();
		lines.add(Component.empty());
		for (String l : lore) lines.add(Component.literal(l));
		stack.set(DataComponents.LORE, new ItemLore(lines));
		return stack;
	}

	public static String read() {
		return SkyWardrobe.debug(Minecraft.getInstance());
	}

	/** Read again from the saved file (as after a restart). */
	public static void reload() {
		SkyWardrobe.reloadForTest();
	}

	/** The first worn item's model and custom model data, as shown. */
	public static String look() {
		var worn = SkyWardrobe.worn(Minecraft.getInstance());
		if (worn.isEmpty()) return "none";
		ItemStack first = worn.get(0);
		var data = first.get(DataComponents.CUSTOM_MODEL_DATA);
		return first.get(DataComponents.ITEM_MODEL) + "|" + (data == null ? "none" : data.getFloat(0) + "," + data.getString(0));
	}

	public static boolean visible() {
		return new SkyWardrobe.Module().visible(Minecraft.getInstance());
	}
}
//#endif
