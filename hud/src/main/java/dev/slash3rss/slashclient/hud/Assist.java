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
	/** The autoclicker's key arms it; armed, it clicks (see `tick`). */
	private static boolean armed;
	private static long nextLeft, nextRight;
	/** The slot the player had before auto tool picked another (-1 = none). */
	private static int toolFrom = -1;
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
		while (holdAttackKey.consumeClick()) holdAttack = toggle(mc, holdAttack, "slashclient-hud.assist.holdAttack", mc.options.keyAttack);
		while (holdUseKey.consumeClick()) holdUse = toggle(mc, holdUse, "slashclient-hud.assist.holdUse", mc.options.keyUse);
		while (autoClickKey.consumeClick()) {
			if (!cfg().autoClicker) {
				Compat.overlay(mc, Component.translatable("slashclient-hud.assist.autoClick.disabled"));
				continue;
			}
			armed = !armed;
			Compat.overlay(mc, Component.translatable(armed ? "slashclient-hud.assist.autoClick.on" : "slashclient-hud.assist.autoClick.off"));
		}
		if (player == null || mc.level == null) {
			holdAttack = holdUse = armed = false;
			lastHand = ItemStack.EMPTY;
			toolFrom = -1;
			return;
		}
		boolean inGame = Compat.screen(mc) == null;
		// a held button stays down while the key's toggle is on (only in the game, not in menus)
		if (holdAttack && inGame) mc.options.keyAttack.setDown(true);
		if (holdUse && inGame) mc.options.keyUse.setDown(true);

		if (cfg().autoClicker && armed && inGame) autoClick(mc, player);
		if (cfg().autoTool && inGame) autoTool(mc, player);
		if (cfg().autoRefill) refill(mc, player);
		if (cfg().toolWarning) warn(mc, player);
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
		if (cfg().autoClickLeft) {
			HitResult hit = mc.hitResult;
			boolean onTarget = hit instanceof EntityHitResult e && e.getEntity() instanceof LivingEntity living && living.isAlive()
				&& (cfg().autoClickPlayers || !(living instanceof Player));
			// on blocks the button is left alone: clicking would restart the digging
			boolean want = cfg().autoClickMobs ? onTarget : mc.options.keyAttack.isDown() && (hit == null || hit.getType() != HitResult.Type.BLOCK);
			if (want) {
				if (cfg().autoClickCooldown) {
					// hits as hard as they can: once the weapon is charged again
					if (player.getAttackStrengthScale(0f) >= 1f && now >= nextLeft) {
						click(mc.options.keyAttack);
						nextLeft = now + 120;
					}
				} else if (now >= nextLeft) {
					click(mc.options.keyAttack);
					nextLeft = now + interval();
				}
			}
		}
		if (cfg().autoClickRight && mc.options.keyUse.isDown() && now >= nextRight) {
			click(mc.options.keyUse);
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
				if (cfg().autoToolRestore) inv.setSelectedSlot(toolFrom);
				toolFrom = -1;
			}
			return;
		}
		idleTicks = 0;
		BlockState state = mc.level.getBlockState(((BlockHitResult) mc.hitResult).getBlockPos());
		if (state.isAir()) return;
		int best = inv.getSelectedSlot();
		float bestSpeed = speed(inv.getItem(best), state);
		for (int i = 0; i < Inventory.getSelectionSize(); i++) {
			float s = speed(inv.getItem(i), state);
			if (s > bestSpeed + 0.01f) {
				best = i;
				bestSpeed = s;
			}
		}
		if (best != inv.getSelectedSlot()) {
			if (toolFrom < 0) toolFrom = inv.getSelectedSlot();
			inv.setSelectedSlot(best);
		}
	}

	/** How fast a stack breaks the block; tools about to break are not picked. */
	private static float speed(ItemStack stack, BlockState state) {
		if (stack.isEmpty()) return 1f;
		if (stack.isDamageableItem() && stack.getMaxDamage() - stack.getDamageValue() <= 2) return 0f;
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
