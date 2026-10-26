package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;


/**
 * Things that take work off the hands: holding a mouse button with a key, the autoclicker, the
 * best tool for the block, a new stack in the hand when it runs out, and a warning before a tool
 * breaks. The automatic ones are off until switched on, and the first time that happens the
 * player is told that many servers treat them as cheats.
 */
public final class Assist {
	private Assist() {}

	static KeyMapping holdAttackKey, holdUseKey, autoClickKey;

	private static boolean holdAttack, holdUse;
	/** A block was being dug over a screen last tick (see `holdOverScreen`). */
	private static boolean dugOverScreen;
	/**
	 * The autoclicker's key: in the "toggle" mode it starts and stops the clicking (armed); in the
	 * "hold" mode it pauses the clicking while the buttons are held (paused) and lets it go on.
	 */
	private static boolean armed, paused;
	private static long nextLeft, nextRight;
	/** Clicks made, for the tests. */
	static int leftClicks, rightClicks;
	/** The slot the player had before auto tool picked another (-1 = none). */
	private static int toolFrom = -1;
	/** Tools auto tool brought from the backpack ({backpack slot, hotbar slot}), newest last, to put back in reverse. */
	private static final java.util.ArrayDeque<int[]> swaps = new java.util.ArrayDeque<>();
	private static int idleTicks;
	/** When auto tool last took a weapon for a hit (ms): between hits the fight goes on, so the hand does not go back yet. */
	private static long weaponAt;
	private static final long FIGHT_MS = 1500;
	/** What was in the hand last tick, to see a stack run out. */
	private static ItemStack lastHand = ItemStack.EMPTY;
	private static int lastSlot = -1;
	/** The tool last warned about, so the warning comes once (and once more when nearly gone). */
	private static ItemStack warnedFor = ItemStack.EMPTY;
	private static int warnedLevel;

	private static HudConfig cfg() {
		return SlashHud.config;
	}

	static void register(KeyMapping.Category category) {
		holdAttackKey = net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.holdAttack", InputConstants.UNKNOWN.getValue(), category));
		holdUseKey = net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.holdUse", InputConstants.UNKNOWN.getValue(), category));
		autoClickKey = net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.autoClick", InputConstants.UNKNOWN.getValue(), category));
	}

	// ---------- the warning before the first automatic helper ----------

	/** Switches a risky helper on, after the player has read (once) that servers may ban for it. */
	public static void enableRisky(Runnable enable) {
		if (cfg().assistWarned) {
			enable.run();
			return;
		}
		Minecraft mc = Minecraft.getInstance();
		var back = Compat.screen(mc);
		mc.setScreenAndShow(new ConfirmScreen(ok -> {
			if (ok) {
				cfg().assistWarned = true;
				enable.run();
				cfg().save();
			}
			mc.setScreenAndShow(back instanceof HudEditScreen ? new HudEditScreen() : back);
		}, Component.translatable("slashclient-hud.assist.warning.title"), Component.translatable("slashclient-hud.assist.warning")));
	}

	// ---------- every tick ----------

	static void tick(Minecraft mc) {
		Player player = mc.player;
		while (holdAttackKey.consumeClick()) pressed(mc, holdAttackKey);
		while (holdUseKey.consumeClick()) pressed(mc, holdUseKey);
		while (autoClickKey.consumeClick()) pressed(mc, autoClickKey);
		if (player == null || mc.level == null) {
			holdAttack = holdUse = armed = dugOverScreen = false;
			lastHand = ItemStack.EMPTY;
			toolFrom = -1;
			swaps.clear();
			return;
		}
		boolean inGame = Compat.screen(mc) == null;
		// a held button stays down while the key's toggle is on, in the game and (see `holdOverScreen`) with
		// the inventory or the pause menu open
		if (holdAttack && inGame) mc.options.keyAttack.setDown(true);
		if (holdUse && inGame) mc.options.keyUse.setDown(true);
		holdOverScreen(mc, player, inGame);

		if (cfg().autoClicker && inGame && (holdMode() ? !paused : armed)) autoClick(mc, player);
		// also while the held button digs under the inventory or the pause menu
		if (cfg().autoTool && (inGame || dugOverScreen)) autoTool(mc, player);
		if (cfg().autoRefill) refill(mc, player);
		if (cfg().toolWarning) warn(mc, player);
	}

	/** Screens over which a held button goes on: the player's own inventory and the pause menu, ours or the game's (not a chest or a server's window). */
	static boolean holdsOver(net.minecraft.client.gui.screens.Screen screen) {
		return screen instanceof net.minecraft.client.gui.screens.inventory.InventoryScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.CreativeModeInventoryScreen
			|| screen instanceof net.minecraft.client.gui.screens.PauseScreen
			|| screen instanceof dev.slash3rss.slashclient.hud.ui.SlashPauseScreen;
	}

	/**
	 * With the inventory or the pause menu open the game neither digs nor uses the item in hand (it
	 * only does that with no screen), so a farm left running would stop the moment the player looks
	 * into the backpack. Here the button held by its key does the same as in the game: digs the block
	 * under the crosshair and uses the item again whenever the game would. The keys themselves stay
	 * up, so closing the screen leaves nothing stuck. A paused game (the pause menu in singleplayer)
	 * is left alone.
	 */
	private static void holdOverScreen(Minecraft mc, Player player, boolean inGame) {
		boolean on = !inGame && cfg().holdInScreens && mc.gameMode != null && !mc.isPaused() && holdsOver(Compat.screen(mc));
		var game = (dev.slash3rss.slashclient.hud.mixin.MinecraftAccessor) mc;
		if (on && holdUse && game.slashclient$rightClickDelay() == 0 && !player.isUsingItem()) game.slashclient$startUseItem();
		if (on && holdAttack) {
			// the game keeps attacks off while a screen is open (a click on it must not hit); the held key goes on digging
			int miss = mc.missTime;
			mc.missTime = 0;
			game.slashclient$continueAttack(true);
			mc.missTime = miss;
			dugOverScreen = true;
		} else if (dugOverScreen) {
			// let go over the screen: the cracks stop (in the game the game itself does that)
			if (!inGame && mc.gameMode != null) mc.gameMode.stopDestroyBlock();
			dugOverScreen = false;
		}
	}

	/** One of the helpers' keys pressed, in the game or over a window (see `attach`). */
	private static void pressed(Minecraft mc, KeyMapping key) {
		if (key == holdAttackKey) holdAttack = toggle(mc, holdAttack, "slashclient-hud.assist.holdAttack", mc.options.keyAttack);
		else if (key == holdUseKey) holdUse = toggle(mc, holdUse, "slashclient-hud.assist.holdUse", mc.options.keyUse);
		else if (key == autoClickKey) {
			if (!cfg().autoClicker) {
				Compat.overlay(mc, Component.translatable("slashclient-hud.assist.autoClick.disabled"));
				return;
			}
			boolean on;
			if (holdMode()) on = !(paused = !paused);
			else on = armed = !armed;
			Compat.overlay(mc, Component.translatable(on ? "slashclient-hud.assist.autoClick.on" : "slashclient-hud.assist.autoClick.off"));
		}
	}

	/**
	 * The keys work over inventories and server windows too (game keys do not reach the game while
	 * one is open): a button held to open a case can be let go with its key in the case's window.
	 * The key is taken (the window does not see it).
	 */
	static void attach(Minecraft mc, net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> screen) {
		KeyMapping[] keys = { holdAttackKey, holdUseKey, autoClickKey };
		//#if MC >= 1.21.9
		net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> {
			for (KeyMapping k : keys) if (!k.isUnbound() && k.matches(e)) {
				pressed(mc, k);
				return false;
			}
			return true;
		});
		net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, e) -> {
			for (KeyMapping k : keys) if (!k.isUnbound() && k.matchesMouse(e)) {
				pressed(mc, k);
				return false;
			}
			return true;
		});
		//#else
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, key, scancode, mods) -> {
		//$ 	for (KeyMapping k : keys) if (!k.isUnbound() && k.matches(key, scancode)) {
		//$ 		pressed(mc, k);
		//$ 		return false;
		//$ 	}
		//$ 	return true;
		//$ });
		//$ net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, x, y, button) -> {
		//$ 	for (KeyMapping k : keys) if (!k.isUnbound() && k.matchesMouse(button)) {
		//$ 		pressed(mc, k);
		//$ 		return false;
		//$ 	}
		//$ 	return true;
		//$ });
		//#endif
	}

	/** Whether a key's toggle is on (for the tests). */
	static boolean holding(boolean attack) {
		return attack ? holdAttack : holdUse;
	}

	/** Switches a key's toggle as its key would (for the tests). */
	static void hold(boolean attack, boolean on) {
		Minecraft mc = Minecraft.getInstance();
		if (holding(attack) != on) pressed(mc, attack ? holdAttackKey : holdUseKey);
	}

	private static boolean toggle(Minecraft mc, boolean on, String key, KeyMapping button) {
		on = !on;
		if (!on) button.setDown(false);
		Compat.overlay(mc, Component.translatable(key + (on ? ".on" : ".off")));
		return on;
	}

	// ---------- autoclicker ----------

	/** "Hold" (the default, as other mods do): it clicks while the player holds the mouse button. */
	static boolean holdMode() {
		return !"toggle".equals(cfg().autoClickMode);
	}

	/** Milliseconds between two clicks at this many a second. */
	private static long interval(int cps) {
		return Math.round(1000.0 / Math.max(1, Math.min(20, cps)));
	}

	private static void autoClick(Minecraft mc, Player player) {
		long now = System.currentTimeMillis();
		boolean hold = holdMode();
		// held: while the player holds the button (no click from the game itself on an entity or the air,
		// the button held only digs); toggle: on their own while armed
		if (cfg().autoClickLeft && (!hold || mc.options.keyAttack.isDown())) {
			HitResult hit = mc.hitResult;
			Entity aimed = hit instanceof EntityHitResult e ? e.getEntity() : null;
			// never at a player: it is for mobs, farms and blocks
			boolean atPlayer = aimed instanceof Player;
			boolean onMob = aimed instanceof LivingEntity living && living.isAlive() && !atPlayer;
			// a block being dug with the button held is left alone: clicking would restart the digging
			boolean digging = mc.options.keyAttack.isDown() && hit != null && hit.getType() == HitResult.Type.BLOCK;
			boolean want = !atPlayer && (cfg().autoClickMobs ? onMob : !digging);
			if (want && now >= nextLeft) {
				click(mc.options.keyAttack);
				leftClicks++;
				nextLeft = now + interval(cfg().autoClickCps);
			}
		}
		if (cfg().autoClickRight && (!hold || mc.options.keyUse.isDown()) && now >= nextRight) {
			click(mc.options.keyUse);
			rightClicks++;
			nextRight = now + interval(cfg().autoClickRightCps);
		}
	}

	private static void click(KeyMapping key) {
		// counted on the keystrokes and the CPS module as a click by hand would be
		Modules.CLICKS.clicked(key == Minecraft.getInstance().options.keyAttack);
		KeyMapping.click(net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.getBoundKeyOf(key));
	}

	// ---------- auto tool ----------

	private static void autoTool(Minecraft mc, Player player) {
		Inventory inv = player.getInventory();
		// under a screen the key stays up while the held button digs (holdOverScreen)
		boolean digging = cfg().autoToolBlocks && (mc.options.keyAttack.isDown() || dugOverScreen) && mc.hitResult instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK;
		if (!digging) {
			// in a fight: the weapon stays in the hand between hits
			if (System.currentTimeMillis() - weaponAt < FIGHT_MS) return;
			// a moment after digging stops, the hand goes back to what it held
			if (toolFrom >= 0 && ++idleTicks > 4) {
				if (cfg().autoToolRestore) {
					// the tools from the backpack go back where they were, the last one first (and what they replaced comes back)
					while (!swaps.isEmpty() && mc.gameMode != null) {
						int[] sw = swaps.removeLast();
						Compat.swapIntoHotbar(mc, player, sw[0], sw[1]);
					}
					inv.setSelectedSlot(toolFrom);
				}
				toolFrom = -1;
				swaps.clear();
			}
			return;
		}
		idleTicks = 0;
		BlockState state = mc.level.getBlockState(((BlockHitResult) mc.hitResult).getBlockPos());
		if (state.isAir()) return;
		take(mc, player, bestSlot(inv, state));
	}

	/**
	 * Auto tool right before a hit on a mob (Minecraft.startAttack): the weapon that hits hardest goes
	 * into the hand first, so the very first hit is made with it (the game tells the server the held
	 * item before the hit).
	 */
	public static void beforeAttack(Minecraft mc) {
		if (!cfg().autoTool || !cfg().autoToolWeapons || mc.player == null || !(mc.hitResult instanceof EntityHitResult hit) || !(hit.getEntity() instanceof LivingEntity)) return;
		Player player = mc.player;
		weaponAt = System.currentTimeMillis();
		idleTicks = 0;
		take(mc, player, bestWeapon(player.getInventory()));
	}

	/**
	 * Auto tool right before a right click on a mob: the item its interaction takes into the hand first
	 * (each switched on in the card): shears for a sheep ready for them (a mooshroom, a snow golem, a
	 * bogged), a bucket to milk a cow or a goat, a bowl for a mooshroom's stew, a water bucket to scoop
	 * up a fish, an axolotl or a tadpole, a brush for an armadillo, and the food an animal eats.
	 */
	public static void beforeUse(Minecraft mc) {
		if (!cfg().autoTool || mc.player == null || !(mc.hitResult instanceof EntityHitResult hit)) return;
		int slot = slotFor(mc.player.getInventory(), hit.getEntity());
		if (slot < 0) return;
		weaponAt = System.currentTimeMillis();
		idleTicks = 0;
		take(mc, mc.player, slot);
	}

	/** The slot with what a right click on this mob needs (the hand's first, then the hotbar, then the backpack); -1 for none. */
	static int slotFor(Inventory inv, net.minecraft.world.entity.Entity mob) {
		java.util.function.Predicate<ItemStack> wanted = wanted(mob);
		if (wanted == null) return -1;
		if (wanted.test(inv.getItem(inv.getSelectedSlot()))) return inv.getSelectedSlot();
		for (int i = 0; i < 36; i++) if (!inv.getItem(i).isEmpty() && wanted.test(inv.getItem(i))) return i;
		return -1;
	}

	/** What a right click on this mob takes, or null when auto tool leaves it be. */
	private static java.util.function.Predicate<ItemStack> wanted(net.minecraft.world.entity.Entity mob) {
		HudConfig c = cfg();
		// the mob's id ("cow"): the same in every version of the game
		String type = net.minecraft.core.registries.BuiltInRegistries.ENTITY_TYPE.getKey(mob.getType()).getPath();
		boolean adult = !(mob instanceof LivingEntity l) || !l.isBaby();
		if (c.autoToolShears && mob instanceof net.minecraft.world.entity.Shearable s && s.readyForShearing())
			return st -> st.getItem() instanceof net.minecraft.world.item.ShearsItem;
		if (c.autoToolMilk && adult && type.equals("mooshroom")) return st -> st.is(net.minecraft.world.item.Items.BOWL) || st.is(net.minecraft.world.item.Items.BUCKET);
		if (c.autoToolMilk && adult && (type.equals("cow") || type.equals("goat"))) return st -> st.is(net.minecraft.world.item.Items.BUCKET);
		if (c.autoToolFish && mob.isAlive() && FISH.contains(type)) return st -> st.is(net.minecraft.world.item.Items.WATER_BUCKET);
		if (c.autoToolBrush && type.equals("armadillo")) return st -> st.is(net.minecraft.world.item.Items.BRUSH);
		// feeding: not the mobs a right click rides or that belong to someone (it would feed them instead)
		if (c.autoToolFeed && mob instanceof net.minecraft.world.entity.animal.Animal animal && !(mob instanceof net.minecraft.world.entity.OwnableEntity) && !RIDDEN.contains(type))
			return animal::isFood;
		return null;
	}

	/** The mobs a water bucket scoops up. */
	private static final java.util.Set<String> FISH = java.util.Set.of("cod", "salmon", "tropical_fish", "pufferfish", "axolotl", "tadpole");
	/** Ridden with a right click (fed only by hand). */
	private static final java.util.Set<String> RIDDEN = java.util.Set.of("pig", "strider", "camel");

	/** The slot `best` into the hand: chosen on the hotbar, or brought there from the backpack; what was held is remembered. */
	private static void take(Minecraft mc, Player player, int best) {
		Inventory inv = player.getInventory();
		if (best == inv.getSelectedSlot()) return;
		if (toolFrom < 0) toolFrom = inv.getSelectedSlot();
		if (best < Inventory.getSelectionSize()) {
			inv.setSelectedSlot(best);
			return;
		}
		// the best tool is in the backpack: onto the hotbar (an empty slot, else the one in hand); again for every
		// block that needs another one (items picked up meanwhile may have filled the empty hotbar slots)
		if (mc.gameMode == null || swaps.size() >= 9) return;
		int to = inv.getSelectedSlot();
		for (int i = 0; i < Inventory.getSelectionSize(); i++) if (inv.getItem(i).isEmpty()) {
			to = i;
			break;
		}
		Compat.swapIntoHotbar(mc, player, best, to);
		swaps.addLast(new int[] { best, to });
		inv.setSelectedSlot(to);
	}

	/** The slot (hotbar 0-8, backpack 9-35) with the stack that breaks the block best; the hand's when nothing beats it. */
	static int bestSlot(Inventory inv, BlockState state) {
		int best = inv.getSelectedSlot();
		float bestSpeed = speed(inv.getItem(best), state);
		// the hotbar first: a tool there is used as it is, the backpack only when it has a better one
		for (int i = 0; i < 36; i++) {
			float s = speed(inv.getItem(i), state);
			if (s > bestSpeed + 0.01f) {
				best = i;
				bestSpeed = s;
			}
		}
		return best;
	}

	/** The slot (hotbar 0-8, backpack 9-35) with the weapon that hits hardest; the hand's when nothing beats it. */
	static int bestWeapon(Inventory inv) {
		int best = inv.getSelectedSlot();
		double bestDamage = damage(inv.getItem(best));
		for (int i = 0; i < 36; i++) {
			double d = damage(inv.getItem(i));
			if (d > bestDamage + 0.01) {
				best = i;
				bestDamage = d;
			}
		}
		return best;
	}

	/** The attack damage a stack adds in the main hand (a sword 6, an axe 8, a fist 0). */
	static double damage(ItemStack stack) {
		if (stack.isEmpty()) return 0;
		double[] sum = { 0 };
		//#if MC >= 1.21
		stack.forEachModifier(net.minecraft.world.entity.EquipmentSlot.MAINHAND, (attribute, modifier) -> {
			if (attribute.value() == net.minecraft.world.entity.ai.attributes.Attributes.ATTACK_DAMAGE.value()
				&& modifier.operation() == net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADD_VALUE) sum[0] += modifier.amount();
		});
		//#else
		//$ for (var e : stack.getAttributeModifiers(net.minecraft.world.entity.EquipmentSlot.MAINHAND).entries())
		//$ 	if (e.getKey() == net.minecraft.world.entity.ai.attributes.Attributes.ATTACK_DAMAGE
		//$ 		&& e.getValue().getOperation() == net.minecraft.world.entity.ai.attributes.AttributeModifier.Operation.ADDITION) sum[0] += e.getValue().getAmount();
		//#endif
		return sum[0];
	}

	/**
	 * How fast a stack breaks the block. A worn tool counts like any other: auto tool does not keep it
	 * from breaking (the low durability warning says when it is close).
	 */
	static float speed(ItemStack stack, BlockState state) {
		if (stack.isEmpty()) return 1f;
		float s = stack.getDestroySpeed(state);
		// a tool that gets the drop beats a faster one that does not
		if (state.requiresCorrectToolForDrops() && stack.isCorrectToolForDrops(state)) s += 100f;
		return s;
	}

	// ---------- a new stack in the hand ----------

	private static void refill(Minecraft mc, Player player) {
		Inventory inv = player.getInventory();
		int slot = inv.getSelectedSlot();
		ItemStack hand = inv.getItem(slot);
		if (slot == lastSlot && hand.isEmpty() && !lastHand.isEmpty() && Compat.screen(mc) == null && mc.gameMode != null) {
			// the same thing from the backpack (the very same kind first, then the same item)
			int from = -1;
			for (int i = Inventory.getSelectionSize(); i < 36 && from < 0; i++) if (ItemStack.isSameItemSameComponents(inv.getItem(i), lastHand)) from = i;
			for (int i = Inventory.getSelectionSize(); i < 36 && from < 0; i++) if (!inv.getItem(i).isEmpty() && inv.getItem(i).is(lastHand.getItem())) from = i;
			if (from >= 0) Compat.swapIntoHotbar(mc, player, from, slot);
		}
		lastSlot = slot;
		lastHand = hand.copy();
	}

	// ---------- a tool about to break ----------

	private static void warn(Minecraft mc, Player player) {
		ItemStack hand = player.getMainHandItem();
		if (!hand.isDamageableItem()) return;
		int left = hand.getMaxDamage() - hand.getDamageValue();
		int at = Math.max(3, Math.round(hand.getMaxDamage() * cfg().toolWarningPercent / 100f));
		boolean same = ItemStack.isSameItem(hand, warnedFor) && warnedFor.getMaxDamage() == hand.getMaxDamage();
		if (left > at) {
			if (same) warnedLevel = 0;
			return;
		}
		// twice: when it gets low, and once more right before the end
		int level = left <= 3 ? 2 : 1;
		if (same && warnedLevel >= level) return;
		warnedFor = hand.copy();
		warnedLevel = level;
		Compat.overlay(mc, Component.translatable("slashclient-hud.assist.toolWarning.left", hand.getHoverName(), left).withStyle(s -> s.withColor(level == 2 ? 0xFF5555 : 0xFFAA00)));
		mc.getSoundManager().play(SimpleSoundInstance.forUI(SoundEvents.NOTE_BLOCK_PLING.value(), level == 2 ? 0.6f : 0.9f, 0.8f));
	}

	/** For the test. */
	public static boolean armed() {
		return armed;
	}

	/** The toggle mode's key pressed, or let go (for the tests); not paused in the hold mode either. */
	public static void arm(boolean on) {
		armed = on;
		paused = false;
	}
}
