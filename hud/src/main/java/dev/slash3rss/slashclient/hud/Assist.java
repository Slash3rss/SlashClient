package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.ConfirmScreen;
import net.minecraft.client.resources.sounds.SimpleSoundInstance;
import net.minecraft.network.chat.Component;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

import java.util.concurrent.ThreadLocalRandom;

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
	/** The autoclicker's key arms it; armed, it clicks (see `tick`). With no key bound it is armed while switched on. */
	private static boolean armed;
	private static long nextLeft, nextRight;
	/** Clicks made, for the tests. */
	static int leftClicks, rightClicks;
	/** The slot the player had before auto tool picked another (-1 = none). */
	private static int toolFrom = -1;
	/** Tools auto tool brought from the backpack ({backpack slot, hotbar slot}), newest last, to put back in reverse. */
	private static final java.util.ArrayDeque<int[]> swaps = new java.util.ArrayDeque<>();
	private static int idleTicks;
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
			holdAttack = holdUse = armed = false;
			lastHand = ItemStack.EMPTY;
			toolFrom = -1;
			swaps.clear();
			return;
		}
		boolean inGame = Compat.screen(mc) == null;
		// a held button stays down while the key's toggle is on (only in the game, not in menus)
		if (holdAttack && inGame) mc.options.keyAttack.setDown(true);
		if (holdUse && inGame) mc.options.keyUse.setDown(true);

		if (cfg().autoClicker && (armed || autoClickKey.isUnbound()) && inGame) autoClick(mc, player);
		if (cfg().autoTool && inGame) autoTool(mc, player);
		if (cfg().autoRefill) refill(mc, player);
		if (cfg().toolWarning) warn(mc, player);
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
			armed = !armed;
			Compat.overlay(mc, Component.translatable(armed ? "slashclient-hud.assist.autoClick.on" : "slashclient-hud.assist.autoClick.off"));
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

	private static boolean toggle(Minecraft mc, boolean on, String key, KeyMapping button) {
		on = !on;
		if (!on) button.setDown(false);
		Compat.overlay(mc, Component.translatable(key + (on ? ".on" : ".off")));
		return on;
	}

	// ---------- autoclicker ----------

	private static long interval() {
		int min = Math.max(1, Math.min(cfg().cpsMin, cfg().cpsMax)), max = Math.max(cfg().cpsMin, cfg().cpsMax);
		// a little uneven, like a hand
		double cps = min + ThreadLocalRandom.current().nextDouble() * (max - min + 0.999);
		return Math.round(1000 / Math.max(1, cps));
	}

	private static void autoClick(Minecraft mc, Player player) {
		long now = System.currentTimeMillis();
		// both click on their own while armed, no button held
		if (cfg().autoClickLeft) {
			HitResult hit = mc.hitResult;
			boolean onTarget = hit instanceof EntityHitResult e && e.getEntity() instanceof LivingEntity living && living.isAlive()
				&& (cfg().autoClickPlayers || !(living instanceof Player));
			// a block being dug with the button held is left alone: clicking would restart the digging
			boolean digging = mc.options.keyAttack.isDown() && hit != null && hit.getType() == HitResult.Type.BLOCK;
			boolean want = cfg().autoClickMobs ? onTarget : !digging;
			if (want) {
				if (cfg().autoClickCooldown) {
					// hits as hard as they can: once the weapon is charged again
					if (player.getAttackStrengthScale(0f) >= 1f && now >= nextLeft) {
						click(mc.options.keyAttack);
						leftClicks++;
						nextLeft = now + 120;
					}
				} else if (now >= nextLeft) {
					click(mc.options.keyAttack);
					leftClicks++;
					nextLeft = now + interval();
				}
			}
		}
		if (cfg().autoClickRight && now >= nextRight) {
			click(mc.options.keyUse);
			rightClicks++;
			nextRight = now + interval();
		}
	}

	private static void click(KeyMapping key) {
		KeyMapping.click(net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper.getBoundKeyOf(key));
	}

	// ---------- auto tool ----------

	private static void autoTool(Minecraft mc, Player player) {
		Inventory inv = player.getInventory();
		boolean digging = mc.options.keyAttack.isDown() && mc.hitResult instanceof BlockHitResult b && b.getType() == HitResult.Type.BLOCK;
		if (!digging) {
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
		int best = bestSlot(inv, state);
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

	public static void arm(boolean on) {
		armed = on;
	}
}
