// SkyUp's cases are played on 26.3: the case counter is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.core.component.DataComponents;
import net.minecraft.network.chat.Component;
import net.minecraft.world.SimpleContainer;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.ItemStack;

/** For the game test of SkyUp's cases (GameSkyCase): wins from the chat, preview windows as SkyUp sends them, what was counted. */
public final class SkyCaseTestHooks {
	private SkyCaseTestHooks() {}

	/** On "SkyUp", nothing counted, every case with its built-in rewards; the module on, recent wins shown, no toasts (the test asks for one). */
	public static void reset() {
		SkyTasks.testWorld = true;
		SkyCase.resetForTest();
		SlashHud.config.placement("skycase").enabled = true;
		SlashHud.config.skyCaseLayout = "recent";
		SlashHud.config.skyCaseNewDrop = false;
	}

	/** A line in the chat, as the server sends it (through the chat, as any line). */
	public static void chat(String line) {
		Compat.chat(Minecraft.getInstance()).addClientSystemMessage(Component.literal(line));
	}

	/** SkyUp's win line for a reward, with its colour codes ("&6&lSkyCase &8&l» &e&aWygrano: &e<reward>&a!"). */
	public static void win(String reward) {
		chat("§6§lSkyCase §8§l» §e§aWygrano: §e" + reward + "§a!");
	}

	public static String parse(String line) {
		return String.valueOf(SkyCase.parse(line));
	}

	/**
	 * A case's preview as SkyUp sends it: "» SkyCase «" on top, the rewards from the second row
	 * ("item id|name|count"), "» Wyjdź «" below and the page arrows when there are more pages.
	 */
	public static void preview(String title, boolean previous, boolean next, String... rewards) {
		var mc = Minecraft.getInstance();
		var chest = new SimpleContainer(54);
		chest.setItem(4, named("minecraft:player_head", "» SkyCase «", 1));
		for (int i = 0; i < rewards.length && i < 36; i++) {
			String[] r = rewards[i].split("\\|");
			chest.setItem(9 + i, named(r[0], r[1], r.length > 2 ? Integer.parseInt(r[2]) : 1));
		}
		if (previous) chest.setItem(48, named("minecraft:player_head", "» Poprzednia strona «", 1));
		chest.setItem(49, named("minecraft:player_head", "» Wyjdź «", 1));
		if (next) chest.setItem(50, named("minecraft:player_head", "» Następna strona «", 1));
		var menu = ChestMenu.sixRows(1000, mc.player.getInventory(), chest);
		mc.setScreenAndShow(new net.minecraft.client.gui.screens.inventory.ContainerScreen(menu, mc.player.getInventory(), Component.literal(title)));
	}

	private static ItemStack named(String id, String name, int count) {
		var item = SkyCase.item(id);
		var stack = new ItemStack(item, Math.max(1, Math.min(99, count)));
		stack.set(DataComponents.CUSTOM_NAME, Component.literal(name));
		return stack;
	}

	/** No case looked at lately (as after the time a case stays assigned). */
	public static void forget() {
		SkyCase.forgetContextForTest();
	}

	/** Each case won from: "Górniczy: 1/1 {Kask Górnika=1}". */
	public static String counted() {
		return SkyCase.debug();
	}

	public static String pool(String type) {
		return SkyCase.debugPool(type);
	}

	/** A case's rows as the detail window lists them: "name s/l amount share [removed]". */
	public static String rewards(String type, boolean grouped) {
		StringBuilder out = new StringBuilder();
		for (SkyCase.Reward r : SkyCase.rewards(type, grouped)) {
			out.append(r.name()).append(' ').append(r.session()).append('/').append(r.lifetime()).append(' ').append(r.sessionAmount()).append('/').append(r.amount()).append(' ').append(SkyCase.percent(r.share()));
			if (r.removed()) out.append(" removed");
			out.append('\n');
		}
		return out.toString();
	}

	public static String types() {
		return String.join(",", SkyCase.types());
	}

	/** The detail window on a case. */
	public static void screen(String type, boolean grouped) {
		var screen = new SkyCaseScreen(null);
		screen.show(type, grouped);
		Minecraft.getInstance().setScreenAndShow(screen);
	}

	/** The "Nowy drop!" toast on or off. */
	public static void newDropToast(boolean on) {
		SlashHud.config.skyCaseNewDrop = on;
	}

	/** The module's layout ("recent", "top", "summary"). */
	public static void layout(String layout) {
		SlashHud.config.skyCaseLayout = layout;
	}

	/** Rewards summed by item, or each on its own. */
	public static void sum(boolean sum) {
		SlashHud.config.skyCaseSum = sum;
	}

	/** The counts and pools read back from the file, as after a restart. */
	public static void reload() {
		SkyCase.reloadForTest();
	}

	/** On SkyUp, or on another server (where nothing is counted). */
	public static void onSkyUp(boolean on) {
		SkyTasks.testWorld = on;
	}

	public static boolean visible() {
		return new SkyCase.Module().visible(Minecraft.getInstance());
	}
}
//#endif
