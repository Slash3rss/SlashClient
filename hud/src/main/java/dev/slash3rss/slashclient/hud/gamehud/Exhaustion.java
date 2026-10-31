package dev.slash3rss.slashclient.hud.gamehud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.food.FoodData;

/**
 * The exhaustion on a server, worked out in the game: the server keeps it to itself (its health packet carries only
 * health, food and saturation; AppleSkin needs itself on the server to send it). So the game adds it up by the
 * server's own rules (ServerPlayer.checkMovementStatistics, jumpFromGround, Player.attack, a block broken, damage,
 * natural healing, hunger), and at 4 starts again, as the server takes a point of saturation or food then. The
 * server says nothing of saturation going down until it is gone, so the count is put right only when it sees a
 * point go: food going down, or saturation reaching nothing. Close, not exact: things the game cannot see (a block
 * broken by a command, damage of another kind) wait for that.
 */
public final class Exhaustion {
	private Exhaustion() {}

	private static final float STEP = 4f;

	private static float value;
	private static LocalPlayer player;
	private static double lastX, lastY, lastZ;
	private static int lastFood = -1;
	private static float lastSaturation, lastHealth;

	/** The exhaustion counted so far (0 to 4). */
	public static float value() {
		return value;
	}

	/** What the game itself asks for while counting on the server's side: an attack, a jump (from mixins). */
	public static void add(float amount) {
		if (amount <= 0) return;
		value += amount;
		// the server takes a point at 4 and goes on from what is left
		while (value >= STEP) value -= STEP;
	}

	public static void tick(Minecraft mc) {
		LocalPlayer p = mc.player;
		if (p != player) {
			// another world, or after dying: nothing counted yet
			player = p;
			value = 0;
			lastFood = -1;
			if (p == null) return;
			remember(p);
			return;
		}
		if (p == null) return;
		FoodData data = p.getFoodData();
		int food = data.getFoodLevel();
		float saturation = data.getSaturationLevel(), health = p.getHealth();
		if (lastFood >= 0) {
			// a point seen going (food down, or the last of the saturation): the count starts there
			if (food < lastFood || saturation == 0 && lastSaturation > 0) value = 0;
			if (!p.getAbilities().invulnerable) {
				moved(p);
				// damage (most kinds cost 0.1), and health the food bar gave back (6 for every point)
				if (health < lastHealth) add(0.1f);
				else if (health > lastHealth && lastFood >= 18 && !p.hasEffect(MobEffects.REGENERATION)) add((health - lastHealth) * 6);
				var hunger = p.getEffect(MobEffects.HUNGER);
				if (hunger != null) add(0.005f * (hunger.getAmplifier() + 1));
			}
		}
		remember(p);
	}

	/** Moving as the server counts it: swimming, under or in water, sprinting on the ground (walking costs nothing). */
	private static void moved(LocalPlayer p) {
		double dx = p.getX() - lastX, dy = p.getY() - lastY, dz = p.getZ() - lastZ;
		double all = Math.sqrt(dx * dx + dy * dy + dz * dz), flat = Math.sqrt(dx * dx + dz * dz);
		// a teleport is not a walk
		if (p.isPassenger() || all > 10) return;
		if (p.isSwimming() || p.isEyeInFluid(FluidTags.WATER)) add((float) all * 0.01f);
		else if (p.isInWater()) add((float) flat * 0.01f);
		else if (!p.onClimbable() && p.onGround() && p.isSprinting()) add((float) flat * 0.1f);
	}

	private static void remember(LocalPlayer p) {
		lastX = p.getX();
		lastY = p.getY();
		lastZ = p.getZ();
		lastFood = p.getFoodData().getFoodLevel();
		lastSaturation = p.getFoodData().getSaturationLevel();
		lastHealth = p.getHealth();
	}

	/** A jump of the player's own: 0.2 sprinting, 0.05 else. */
	public static void jumped(LocalPlayer p) {
		if (p == player && !p.getAbilities().invulnerable) add(p.isSprinting() ? 0.2f : 0.05f);
	}

	/** A block the player broke. */
	public static void broke() {
		if (player != null && !player.getAbilities().invulnerable) add(0.005f);
	}
}
