package dev.slash3rss.slashclient.hud.inventory;

import dev.slash3rss.slashclient.hud.mixin.ContainerScreenAccessor;
import dev.slash3rss.slashclient.hud.ui.Ui;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.ShulkerBoxMenu;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.Compat;

/**
 * Sorting with a key (R, or the small button in the window's corner): the open chest, barrel,
 * shulker box or ender chest, or the player's own backpack (the hotbar only when asked for, never
 * the armour or the offhand), by kind (tools and armour, blocks, food, the rest), then name, then
 * count, with half-full stacks of the same item put together first.
 *
 * It is done with the game's ordinary clicks (pick up, put down), the ones a player's hand makes,
 * all at once by default, or one every few dozen milliseconds (the delay in the settings) for servers
 * that kick for fast clicking; never the creative inventory's own way of setting slots. Closing
 * the window stops it. Servers in the settings' list (and Hypixel by default, whose rules forbid
 * sorting mods) are left alone.
 */
public final class InventorySort {
	private InventorySort() {}

	public static KeyMapping key;
	private static final int BUTTON = 10;

	/** A sort under way: the clicks still to come, in groups that each end with nothing in hand. */
	private static final class Job {
		final AbstractContainerScreen<?> screen;
		final int containerId;
		final List<Slot> region;
		final ArrayDeque<int[]> clicks = new ArrayDeque<>();
		/** What the region should hold when the click of that number has been made (the end of a group). */
		final java.util.Map<Integer, Stack[]> expected = new java.util.HashMap<>();
		int made, replans;
		long nextAt;

		Job(AbstractContainerScreen<?> screen, List<Slot> region) {
			this.screen = screen;
			this.containerId = screen.getMenu().containerId;
			this.region = region;
		}
	}

	private static Job job;
	/** For the test: how the last sort ended ("done 12", "nothing", "off", "closed", "busy"…). */
	public static String last = "";

	private static boolean on() {
		return SlashHud.config != null && SlashHud.config.inventorySort;
	}

	// ---------- where it may sort ----------

	/** The servers sorting stays off on: the settings' list ("hypixel.net, example.pl"), each with its subdomains. */
	public static boolean blockedOn(String address, String list) {
		if (address == null || address.isBlank() || list == null) return false;
		String host = address.strip().toLowerCase(Locale.ROOT).replaceAll(":\\d+$", "").replaceAll("\\.+$", "");
		for (String raw : list.split("[,;\\s]+")) {
			String e = raw.strip().toLowerCase(Locale.ROOT).replaceAll(":\\d+$", "").replaceAll("^\\*?\\.", "");
			if (!e.isEmpty() && (host.equals(e) || host.endsWith("." + e))) return true;
		}
		return false;
	}

	/** The server this game is on, when sorting is switched off there (singleplayer never is). */
	static boolean blockedHere(Minecraft mc) {
		var server = mc.getCurrentServer();
		return server != null && !mc.isLocalServer() && blockedOn(server.ip, SlashHud.config.sortOffServers);
	}

	/** The windows sorted: chests (also barrels and ender chests: the same window), shulker boxes, the player's own. */
	private static boolean sortable(AbstractContainerScreen<?> screen) {
		if (screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen) return false;
		AbstractContainerMenu menu = screen.getMenu();
		return menu instanceof ChestMenu || menu instanceof ShulkerBoxMenu || menu instanceof InventoryMenu;
	}

	/** The backpack's slots (and the hotbar's, unlocked ones only, when asked for), in reading order. */
	private static List<Slot> playerRegion(AbstractContainerMenu menu) {
		List<Slot> out = new ArrayList<>();
		boolean hotbar = SlashHud.config.sortHotbar;
		for (Slot s : menu.slots) {
			if (!(s.container instanceof Inventory)) continue;
			int i = s.getContainerSlot();
			if (i >= 9 && i < 36) out.add(s);
		}
		if (hotbar) for (Slot s : menu.slots) {
			if (s.container instanceof Inventory && s.getContainerSlot() < 9 && !SlotLock.locked(s.getContainerSlot())) out.add(s);
		}
		return out;
	}

	private static List<Slot> containerRegion(AbstractContainerMenu menu) {
		List<Slot> out = new ArrayList<>();
		for (Slot s : menu.slots) if (!(s.container instanceof Inventory)) out.add(s);
		return out;
	}

	// ---------- the screen ----------

	/** On every inventory window: the key, the buttons, the clicks going out, and stopping when it closes. */
	public static void attach(Minecraft mc, AbstractContainerScreen<?> screen) {
		if (!sortable(screen)) return;
		//#if MC >= 1.21.9
		net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> {
			if (key == null || key.isUnbound() || !key.matches(e) || InventorySearch.focused()) return true;
			return !press(mc, screen, hovered(screen));
		});
		net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, e) -> {
			if (e.button() == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT) {
				Boolean into = moveButtonAt(screen, e.x(), e.y());
				if (into != null) return !move(mc, screen, into);
				Boolean player = buttonAt(screen, e.x(), e.y());
				if (player != null) return !start(mc, screen, player);
			}
			if (key == null || key.isUnbound() || !key.matchesMouse(e)) return true;
			return !press(mc, screen, hovered(screen));
		});
		//#else
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, k, scancode, mods) -> {
		//$ 	if (key == null || key.isUnbound() || !key.matches(k, scancode) || InventorySearch.focused()) return true;
		//$ 	return !press(mc, screen, hovered(screen));
		//$ });
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, x, y, button) -> {
		//$ 	if (button == com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT) {
		//$ 		Boolean into = moveButtonAt(screen, x, y);
		//$ 		if (into != null) return !move(mc, screen, into);
		//$ 		Boolean player = buttonAt(screen, x, y);
		//$ 		if (player != null) return !start(mc, screen, player);
		//$ 	}
		//$ 	if (key == null || key.isUnbound() || !key.matchesMouse(button)) return true;
		//$ 	return !press(mc, screen, hovered(screen));
		//$ });
		//#endif
		// the buttons under the item tooltips; the clicks every frame
		ContainerLayer.under(screen, (g, mx, my) -> {
			drawButtons(screen, g, mx, my);
			drawMoveButtons(screen, g, mx, my);
		});
		net.fabricmc.fabric.api.client.screen.v1.ScreenEvents.afterExtract(screen).register((s, g, mx, my, delta) -> pump(mc));
		net.fabricmc.fabric.api.client.screen.v1.ScreenEvents.remove(screen).register(s -> {
			if (job != null && job.screen == screen) stop("closed");
		});
	}

	private static Slot hovered(AbstractContainerScreen<?> screen) {
		return ((ContainerScreenAccessor) screen).slashclient$hoveredSlot();
	}

	/** The key: the part of the window under the mouse (the player's own over their slots, else the chest). */
	private static boolean press(Minecraft mc, AbstractContainerScreen<?> screen, Slot over) {
		if (!on()) return false;
		boolean player = screen.getMenu() instanceof InventoryMenu || over != null && over.container instanceof Inventory;
		start(mc, screen, player);
		return true;
	}

	/** The buttons: one by the chest's title, one by "Inventory" (the player's own); null when the point is on neither. */
	private static Boolean buttonAt(AbstractContainerScreen<?> screen, double x, double y) {
		if (!on() || !SlashHud.config.sortButton) return null;
		int[][] at = buttons(screen);
		for (int i = 0; i < at.length; i++) if (Ui.inside(x, y, at[i][0], at[i][1], BUTTON, BUTTON)) return at[i][2] == 1;
		return null;
	}

	/** Where the buttons are: {x, y, 1 for the player's part}. */
	private static int[][] buttons(AbstractContainerScreen<?> screen) {
		ContainerScreenAccessor a = (ContainerScreenAccessor) screen;
		int right = a.slashclient$leftPos() + a.slashclient$imageWidth() - 7 - BUTTON;
		// the "Inventory" line sits 94 pixels above the window's bottom in all of these windows
		int[] player = { right, a.slashclient$topPos() + a.slashclient$imageHeight() - 96, 1 };
		if (screen.getMenu() instanceof InventoryMenu) return new int[][] { player };
		return new int[][] { { right, a.slashclient$topPos() + 4, 0 }, player };
	}

	private static void drawButtons(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g, int mx, int my) {
		if (!on() || !SlashHud.config.sortButton) return;
		boolean blocked = blockedHere(Minecraft.getInstance());
		for (int[] b : buttons(screen)) {
			boolean over = Ui.inside(mx, my, b[0], b[1], BUTTON, BUTTON);
			boolean busy = job != null && job.screen == screen && (job.region.get(0).container instanceof Inventory) == (b[2] == 1);
			Ui.round(g, b[0], b[1], BUTTON, BUTTON, 2, busy ? 0xE01D4ED8 : over ? 0xE0374151 : 0xC0111622);
			Ui.icon(g, "m-sort", b[0] + 2, b[1] + 2, 6, blocked ? Ui.MUTED : busy || over ? 0xFFFFFFFF : 0xFFB4BCC8);
		}
	}

	// ---------- all of it in, all of it out ----------

	private static boolean moveOn(AbstractContainerScreen<?> screen) {
		AbstractContainerMenu menu = screen.getMenu();
		return SlashHud.config != null && SlashHud.config.chestMove && (menu instanceof ChestMenu || menu instanceof ShulkerBoxMenu);
	}

	/** The arrows, left of the sort buttons: {x, y, 1 into the chest (by "Inventory"), 0 out of it (by the chest's title)}. */
	private static int[][] moveButtons(AbstractContainerScreen<?> screen) {
		ContainerScreenAccessor a = (ContainerScreenAccessor) screen;
		// next to the sort button when it is there, else where it would be
		int right = a.slashclient$leftPos() + a.slashclient$imageWidth() - 7 - BUTTON - (on() && SlashHud.config.sortButton ? BUTTON + 2 : 0);
		return new int[][] { { right, a.slashclient$topPos() + 4, 0 }, { right, a.slashclient$topPos() + a.slashclient$imageHeight() - 96, 1 } };
	}

	/** Which arrow is at this point: true the one putting all into the chest, false the one taking all out; null neither. */
	private static Boolean moveButtonAt(AbstractContainerScreen<?> screen, double x, double y) {
		if (!moveOn(screen)) return null;
		for (int[] b : moveButtons(screen)) if (Ui.inside(x, y, b[0], b[1], BUTTON, BUTTON)) return b[2] == 1;
		return null;
	}

	private static void drawMoveButtons(AbstractContainerScreen<?> screen, GuiGraphicsExtractor g, int mx, int my) {
		if (!moveOn(screen)) return;
		boolean blocked = blockedHere(Minecraft.getInstance());
		for (int[] b : moveButtons(screen)) {
			boolean over = Ui.inside(mx, my, b[0], b[1], BUTTON, BUTTON);
			Ui.round(g, b[0], b[1], BUTTON, BUTTON, 2, over ? 0xE0374151 : 0xC0111622);
			// up from the inventory into the chest, down from the chest into the inventory
			Ui.icon(g, b[2] == 1 ? "arrow-up" : "arrow-down", b[0] + 2, b[1] + 2, 6, blocked ? Ui.MUTED : over ? 0xFFFFFFFF : 0xFFB4BCC8);
		}
	}

	/** The slots moved by "all of it": the chest's, or the inventory's (the hotbar's unlocked ones only when asked for). */
	static List<Slot> moveFrom(AbstractContainerMenu menu, boolean intoChest) {
		if (!intoChest) return containerRegion(menu);
		List<Slot> out = new ArrayList<>();
		for (Slot s : menu.slots) {
			if (!(s.container instanceof Inventory)) continue;
			int i = s.getContainerSlot();
			if (i >= 9 && i < 36 || i < 9 && SlashHud.config.chestMoveHotbar && !SlotLock.locked(i)) out.add(s);
		}
		return out;
	}

	/**
	 * All that fits from the inventory into the chest (or back): each slot shift-clicked, as the
	 * player's hand would, so what does not fit stays where it was. True when the click was ours.
	 */
	static boolean move(Minecraft mc, AbstractContainerScreen<?> screen, boolean intoChest) {
		if (mc.player == null || mc.gameMode == null) return false;
		if (blockedHere(mc)) {
			Compat.overlay(mc, Component.translatable("slashclient-hud.sort.blocked"));
			return true;
		}
		AbstractContainerMenu menu = screen.getMenu();
		if (mc.player.containerMenu != menu || !menu.getCarried().isEmpty() || job != null) return true;
		int clicks = 0;
		for (Slot s : moveFrom(menu, intoChest)) {
			if (!s.hasItem() || !s.mayPickup(mc.player)) continue;
			Compat.containerClick(mc, mc.player, menu.containerId, s.index, 0, Compat.Click.QUICK_MOVE);
			clicks++;
		}
		last = "moved " + clicks;
		return true;
	}

	// ---------- running ----------

	/** Starts sorting one part of the window; true when it was ours to handle (even when it found nothing to do). */
	public static boolean start(Minecraft mc, AbstractContainerScreen<?> screen, boolean player) {
		if (!on() || mc.player == null || mc.gameMode == null || !sortable(screen)) return false;
		if (blockedHere(mc)) {
			last = "off";
			Compat.overlay(mc, Component.translatable("slashclient-hud.sort.blocked"));
			return true;
		}
		if (job != null) {
			last = "busy";
			return true;
		}
		AbstractContainerMenu menu = screen.getMenu();
		// the game would drop clicks for a window that is not the one the player has open
		if (mc.player.containerMenu != menu) {
			last = "not open";
			return true;
		}
		if (!menu.getCarried().isEmpty()) {
			last = "carrying";
			return true;
		}
		List<Slot> region = player ? playerRegion(menu) : containerRegion(menu);
		if (region.isEmpty()) return true;
		Job j = new Job(screen, region);
		plan(j);
		if (j.clicks.isEmpty()) {
			last = "nothing";
			return true;
		}
		j.nextAt = System.nanoTime();
		job = j;
		last = "running";
		pump(mc);
		return true;
	}

	private static void stop(String why) {
		if (job != null && why.equals("done")) last = "done " + job.made;
		else last = why;
		job = null;
	}

	/** The next clicks when their time has come (every frame of the window, and every tick). */
	public static void pump(Minecraft mc) {
		// the key pressed in the world (no window) means nothing: its presses are not kept for later
		if (key != null && Compat.screen(mc) == null) while (key.consumeClick()) {}
		Job j = job;
		if (j == null) return;
		if (Compat.screen(mc) != j.screen || mc.player == null || mc.gameMode == null || mc.player.containerMenu != j.screen.getMenu() || j.screen.getMenu().containerId != j.containerId) {
			stop("closed");
			return;
		}
		long delay = Math.max(0, Math.min(500, SlashHud.config.sortDelay)) * 1_000_000L;
		// with no delay every click at once, in one tick (as other sorting mods do); with a delay one at a time
		for (int n = 0; n < 4000 && !j.clicks.isEmpty() && System.nanoTime() >= j.nextAt; n++) {
			int[] c = j.clicks.poll();
			Compat.containerClick(mc, mc.player, j.containerId, c[0], 0, Compat.Click.PICKUP);
			j.made++;
			j.nextAt = delay == 0 ? j.nextAt : System.nanoTime() + delay;
			Stack[] want = j.expected.remove(j.made);
			// the end of a group: the window should look as planned; if the server put something back, plan again from what is there
			if (want != null && !matches(j, want)) {
				SlashHud.LOG.info("SlashClient: sorting: the window differs from the plan after click {} (carrying: {}), planning again", j.made, !j.screen.getMenu().getCarried().isEmpty());
				if (++j.replans > 3 || !j.screen.getMenu().getCarried().isEmpty()) {
					stop("failed");
					return;
				}
				j.clicks.clear();
				j.expected.clear();
				plan(j);
				if (j.clicks.isEmpty()) break;
			}
			if (delay > 0) break;
		}
		if (j.clicks.isEmpty()) stop("done");
	}

	private static boolean matches(Job j, Stack[] want) {
		for (int i = 0; i < want.length; i++) {
			ItemStack s = j.region.get(i).getItem();
			Stack w = want[i];
			if (w == null ? !s.isEmpty() : s.isEmpty() || s.getCount() != w.count || !ItemStack.isSameItemSameComponents(s, w.item)) return false;
		}
		return true;
	}

	// ---------- the plan ----------

	/** One slot as planned: what kind of item and how many (the stack itself is only a sample of the kind). */
	static final class Stack {
		final ItemStack item;
		int count;
		final int max;

		Stack(ItemStack item, int count, int max) {
			this.item = item;
			this.count = count;
			this.max = max;
		}

		boolean sameKind(Stack o) {
			return o != null && ItemStack.isSameItemSameComponents(item, o.item);
		}

		Stack copy() {
			return new Stack(item, count, max);
		}
	}

	/** Clicks on positions of the region, played out on a copy of it, as the game would play them. */
	private static final class Sim {
		final Stack[] slots;
		Stack hand;
		final List<Integer> clicks = new ArrayList<>();
		final List<Integer> groupEnds = new ArrayList<>();
		final List<Stack[]> groupStates = new ArrayList<>();

		Sim(Stack[] slots) {
			this.slots = slots;
		}

		/** A left click with the mouse: pick up, put down, add to the same, or swap. */
		void click(int i) {
			clicks.add(i);
			Stack s = slots[i];
			if (hand == null) {
				hand = s;
				slots[i] = null;
			} else if (s == null) {
				int put = Math.min(hand.count, hand.max);
				slots[i] = new Stack(hand.item, put, hand.max);
				hand.count -= put;
				if (hand.count == 0) hand = null;
			} else if (s.sameKind(hand)) {
				int put = Math.min(hand.count, s.max - s.count);
				s.count += put;
				hand.count -= put;
				if (hand.count == 0) hand = null;
			} else {
				slots[i] = hand;
				hand = s;
			}
		}

		void endGroup() {
			groupEnds.add(clicks.size());
			Stack[] copy = new Stack[slots.length];
			for (int i = 0; i < slots.length; i++) copy[i] = slots[i] == null ? null : slots[i].copy();
			groupStates.add(copy);
		}
	}

	/** Tools, weapons and armour first, then blocks, food, and the rest. */
	static int category(ItemStack s) {
		if (s.isDamageableItem()) return 0;
		if (s.getItem() instanceof BlockItem) return 1;
		//#if MC >= 1.20.5
		if (s.has(net.minecraft.core.component.DataComponents.FOOD)) return 2;
		//#else
		//$ if (s.getItem().isEdible()) return 2;
		//#endif
		return 3;
	}

	private static String id(ItemStack s) {
		return net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(s.getItem()).toString();
	}

	/** The order slots end in: by kind of item, name, id, one kind together (fullest first), empty slots last. */
	static Stack[] target(Stack[] now) {
		List<Stack> stacks = new ArrayList<>();
		List<Stack> kinds = new ArrayList<>();
		for (Stack s : now) {
			if (s == null) continue;
			stacks.add(s);
			if (kinds.stream().noneMatch(k -> k.sameKind(s))) kinds.add(s);
		}
		Comparator<Stack> order = Comparator.<Stack>comparingInt(s -> category(s.item))
			.thenComparing(s -> s.item.getHoverName().getString().toLowerCase(Locale.ROOT))
			.thenComparing(s -> id(s.item))
			.thenComparingInt(s -> {
				for (int k = 0; k < kinds.size(); k++) if (kinds.get(k).sameKind(s)) return k;
				return 0;
			})
			.thenComparing(Comparator.<Stack>comparingInt(s -> s.count).reversed());
		stacks.sort(order);
		Stack[] out = new Stack[now.length];
		for (int i = 0; i < stacks.size(); i++) out[i] = stacks.get(i).copy();
		return out;
	}

	/** The region as it is now, for planning. */
	private static Stack[] read(List<Slot> region) {
		Stack[] out = new Stack[region.size()];
		for (int i = 0; i < out.length; i++) {
			Slot slot = region.get(i);
			ItemStack s = slot.getItem();
			out[i] = s.isEmpty() ? null : new Stack(s.copy(), s.getCount(), Math.min(s.getMaxStackSize(), slot.getMaxStackSize(s)));
		}
		return out;
	}

	/** The clicks that sort the region: half-full stacks of one kind put together, then each slot filled in order. */
	static List<Integer>[] planClicks(Stack[] start) {
		Sim sim = new Sim(start);
		Stack[] s = sim.slots;
		// 1. half-full stacks of the same kind into the first of them
		boolean merged = true;
		while (merged) {
			merged = false;
			for (int a = 0; a < s.length && !merged; a++) {
				if (s[a] == null || s[a].count >= s[a].max) continue;
				for (int b = s.length - 1; b > a; b--) {
					if (s[b] == null || s[b].count >= s[b].max || !s[b].sameKind(s[a])) continue;
					sim.click(b);
					sim.click(a);
					if (sim.hand != null) sim.click(b);
					sim.endGroup();
					merged = true;
					break;
				}
			}
		}
		// 2. each slot in turn gets what belongs there, from further on (what was there goes where that came from)
		Stack[] want = target(s);
		for (int i = 0; i < s.length; i++) {
			if (want[i] == null) break;
			if (same(s[i], want[i])) continue;
			int from = -1;
			for (int j = i + 1; j < s.length; j++) {
				if (same(s[j], want[i])) {
					from = j;
					break;
				}
			}
			if (from < 0) break;
			sim.click(from);
			sim.click(i);
			if (sim.hand != null) sim.click(from);
			sim.endGroup();
		}
		@SuppressWarnings("unchecked")
		List<Integer>[] out = new List[] { sim.clicks, sim.groupEnds };
		lastSim = sim;
		return out;
	}

	private static Sim lastSim;

	private static boolean same(Stack a, Stack b) {
		return a == null ? b == null : b != null && a.count == b.count && a.sameKind(b);
	}

	private static void plan(Job j) {
		planClicks(read(j.region));
		Sim sim = lastSim;
		int base = j.made;
		for (int c : sim.clicks) j.clicks.add(new int[] { j.region.get(c).index });
		for (int g = 0; g < sim.groupEnds.size(); g++) j.expected.put(base + sim.groupEnds.get(g), sim.groupStates.get(g));
	}

	/** Whether a sort is going on (for the test). */
	public static boolean running() {
		return job != null;
	}
}
