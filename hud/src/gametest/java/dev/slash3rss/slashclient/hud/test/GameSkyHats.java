// SkyUp's job hats are played on 26.3: their test is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.skyup.SkyHats;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;

/**
 * SkyUp's "Kapelusz pracusia" as the server makes it (two hats inside, the lumberjack's worn): its tooltip lists
 * each hat with the XP left (a hat joined of 30 with all of their XP), the worn one with the outer hat's wear; a single job hat gets its XP left.
 */
public class GameSkyHats implements FabricClientGameTest {
	private static ItemStack hat(String name, int job, int damage) {
		return hat(name, job, damage, 1);
	}

	private static ItemStack hat(String name, int job, int damage, int stacks) {
		ItemStack s = new ItemStack(Items.PAPER);
		s.set(DataComponents.CUSTOM_NAME, Component.literal(name));
		s.set(DataComponents.MAX_STACK_SIZE, 1);
		s.set(DataComponents.MAX_DAMAGE, 30000 * stacks);
		s.set(DataComponents.DAMAGE, damage);
		CompoundTag b = new CompoundTag();
		b.putInt("kjobs:hat_item", 1);
		b.putInt("kjobs:hat_job_id", job);
		b.putInt("kjobs:hat_stacks", stacks);
		b.putDouble("kjobs:hat_exp_multiplier", 1.2);
		CompoundTag root = new CompoundTag();
		root.put("PublicBukkitValues", b);
		s.set(DataComponents.CUSTOM_DATA, CustomData.of(root));
		return s;
	}

	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			context.waitTicks(20);
			String got = context.computeOnClient(mc -> {
				try {
					ItemStack outer = new ItemStack(Items.PAPER);
					outer.set(DataComponents.MAX_DAMAGE, 30000);
					outer.set(DataComponents.DAMAGE, 94);
					CompoundTag b = new CompoundTag();
					b.putInt("kjobs:universal_hat_item", 1);
					b.putInt("kjobs:universal_hat_data_current_job", 2);
					b.putString("kjobs:universal_hat_data_items", "{\"1\":\"" + SkyHats.encodeForTest(hat("Kask Górnika x30", 1, 45, 30)) + "\",\"2\":\""
						+ SkyHats.encodeForTest(hat("Czapka Drwala", 2, 0)) + "\"}");
					CompoundTag root = new CompoundTag();
					root.put("PublicBukkitValues", b);
					outer.set(DataComponents.CUSTOM_DATA, CustomData.of(root));
					return SkyHats.linesForTest(outer) + "\n--\n" + SkyHats.linesForTest(hat("Kapelusz Farmera", 3, 100));
				} catch (java.io.IOException e) {
					throw new RuntimeException(e);
				}
			});
			String want = "▪ Hats inside:\n  Kask Górnika x30 · 899 955 / 900 000 xp\n  Czapka Drwala · 29 906 / 30 000 xp « worn\n--\n▪ XP left: 29 900 / 30 000 xp";
			if (!got.equals(want)) throw new AssertionError("The hat's lines:\n" + got);
		}
	}
}
//#endif
