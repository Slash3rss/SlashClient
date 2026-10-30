package dev.slash3rss.slashclient.hud.ui;

import dev.slash3rss.slashclient.hud.SlashHud;
import net.minecraft.resources.Identifier;

/**
 * "Okna w wyglądzie bloków": the block's part of a window drawn as the block (the crafting table's
 * wooden top, a chest's wood, a furnace's stone, an anvil's shape… – BlockArt), the player's inventory
 * under it dark. Nothing of Mojang's is shipped: the window's own texture is recoloured as it is read,
 * like "Ciemne okna gry" (DarkGui).
 */
public final class BlockWindows {
	private BlockWindows() {}

	public static boolean on() {
		return SlashHud.config != null && SlashHud.config.blockWindows;
	}

	/** Whether this window is drawn as its block (its labels are then white, on the block's colours). */
	public static boolean drawn(Object screen) {
		if (!on()) return false;
		//#if MC >= 1.21
		if (screen instanceof net.minecraft.client.gui.screens.inventory.CrafterScreen) return true;
		//#endif
		//#if MC >= 1.21.11
		if (screen instanceof net.minecraft.client.gui.screens.inventory.NautilusInventoryScreen) return true;
		//#endif
		return screen instanceof net.minecraft.client.gui.screens.inventory.CraftingScreen || screen instanceof net.minecraft.client.gui.screens.inventory.InventoryScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.ContainerScreen || screen instanceof net.minecraft.client.gui.screens.inventory.ShulkerBoxScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.AbstractFurnaceScreen<?> || screen instanceof net.minecraft.client.gui.screens.inventory.EnchantmentScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.AnvilScreen || screen instanceof net.minecraft.client.gui.screens.inventory.HopperScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.DispenserScreen || screen instanceof net.minecraft.client.gui.screens.inventory.BrewingStandScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.SmithingScreen || screen instanceof net.minecraft.client.gui.screens.inventory.StonecutterScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.GrindstoneScreen || screen instanceof net.minecraft.client.gui.screens.inventory.LoomScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.CartographyTableScreen || screen instanceof net.minecraft.client.gui.screens.inventory.BeaconScreen
			|| screen instanceof net.minecraft.client.gui.screens.inventory.HorseInventoryScreen || screen instanceof net.minecraft.client.gui.screens.inventory.MerchantScreen;
	}

	/**
	 * The texture of the shulker box being opened (the one the player looks at): "shulker_box_<colour>",
	 * made from the game's own as it is read (plainOf), so the window is in the box's colour.
	 */
	public static Identifier shulkerTexture(Identifier plain) {
		if (!on()) return plain;
		var mc = net.minecraft.client.Minecraft.getInstance();
		if (mc.level == null || !(mc.hitResult instanceof net.minecraft.world.phys.BlockHitResult hit) || hit.getType() != net.minecraft.world.phys.HitResult.Type.BLOCK) return plain;
		if (!(mc.level.getBlockState(hit.getBlockPos()).getBlock() instanceof net.minecraft.world.level.block.ShulkerBoxBlock box) || box.getColor() == null) return plain;
		Identifier id = Identifier.tryParse(plain.getNamespace() + ":" + plain.getPath().replace(".png", "_" + box.getColor().getName() + ".png"));
		return id != null ? id : plain;
	}

	/** The game's texture a shulker box's coloured one is made from, or null when `id` is not one. */
	public static Identifier plainOf(Identifier id) {
		String p = id.getPath();
		if (!"minecraft".equals(id.getNamespace()) || !p.startsWith("textures/gui/container/shulker_box_") || !p.endsWith(".png")) return null;
		return Identifier.tryParse("minecraft:textures/gui/container/shulker_box.png");
	}

	/**
	 * After the switch: the windows' textures read again as they are next shown (with their pictures or
	 * without), at once and without reloading the game's resources.
	 */
	public static void refresh() {
		var mc = net.minecraft.client.Minecraft.getInstance();
		mc.execute(() -> {
			var textures = mc.getTextureManager();
			java.util.List<String> names = new java.util.ArrayList<>(java.util.List.of(BlockArt.WINDOWS));
			for (String colour : BlockArt.shulkerColours()) names.add("shulker_box_" + colour);
			for (String name : names) {
				Identifier id = Identifier.tryParse("minecraft:textures/gui/container/" + name + ".png");
				if (id != null) textures.release(id);
			}
			Identifier book = Identifier.tryParse("minecraft:textures/gui/recipe_book.png");
			if (book != null) textures.release(book);
		});
	}

	/** The picture for a window's background (or the recipe book's), or null when it has none (villagers, beacons, creative…). */
	static BlockArt.Art artOf(Identifier id) {
		String p = id.getPath();
		if (!"minecraft".equals(id.getNamespace())) return null;
		if (p.equals("textures/gui/recipe_book.png")) return BlockArt.of("recipe_book");
		if (!p.startsWith("textures/gui/container/") || !p.endsWith(".png")) return null;
		return BlockArt.of(p.substring("textures/gui/container/".length(), p.length() - 4));
	}
}
