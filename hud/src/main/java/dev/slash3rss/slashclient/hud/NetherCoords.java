package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.util.Mth;
import net.minecraft.world.level.Level;

/**
 * Where the player would be in the other dimension: in the Overworld the Nether's coordinates
 * (x and z divided by 8), in the Nether the Overworld's (times 8); the height stays. Hidden
 * elsewhere (the End, other dimensions).
 */
final class NetherCoords extends Modules.TextModule {
	static final int NETHER = 0xFFFF6B4A, OVERWORLD = 0xFF4ADE80;

	public String id() {
		return "nethercoords";
	}

	@Override
	public boolean visible(Minecraft mc) {
		return mc.player != null && mc.level != null && (mc.level.dimension() == Level.OVERWORLD || mc.level.dimension() == Level.NETHER);
	}

	/** The other dimension's block coordinates for a position: x, y, z. */
	static int[] convert(double x, double y, double z, boolean inNether) {
		double f = inNether ? 8 : 1 / 8.0;
		return new int[] { Mth.floor(x * f), Mth.floor(y), Mth.floor(z * f) };
	}

	@Override
	Component content(Minecraft mc) {
		boolean inNether;
		int[] at;
		if (!visible(mc)) {
			// the editor's sample: as if standing at 800 64 -1600 in the Overworld
			inNether = false;
			at = convert(800, 64, -1600, false);
		} else {
			inNether = mc.level.dimension() == Level.NETHER;
			at = convert(mc.player.getX(), mc.player.getY(), mc.player.getZ(), inNether);
		}
		String label = Component.translatable(inNether ? "slashclient-hud.netherCoords.overworld" : "slashclient-hud.netherCoords.nether").getString();
		return Component.literal(label + ": ").withStyle(Style.EMPTY.withColor(inNether ? OVERWORLD : NETHER))
			.append(Component.literal(at[0] + " " + at[1] + " " + at[2]));
	}
}
