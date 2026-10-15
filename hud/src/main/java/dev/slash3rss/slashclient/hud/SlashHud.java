package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.minecraft.world.InteractionResult;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.resources.Identifier;
import net.minecraft.world.phys.Vec3;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.List;

/**
 * SlashClient HUD: FPS, ping, CPS, coordinates, armour, effects, keystrokes and more
 * drawn over the game. Right Shift (changeable in Controls) opens the editor.
 */
public class SlashHud implements ClientModInitializer {
	public static final String ID = "slashclient-hud";
	public static final Logger LOG = LoggerFactory.getLogger(ID);

	static HudConfig config;
	static final List<HudModule> MODULES = Modules.all();
	private static Vec3 lastPos;

	@Override
	public void onInitializeClient() {
		config = HudConfig.load();
		Modules.cfg = config;

		KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(ID, "main"));
		KeyMapping edit = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.edit", InputConstants.KEY_RSHIFT, category));

		Extras.zoomKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.zoom", InputConstants.KEY_C, category));
		// no key by default: G and the like are taken by other mods too often
		Extras.fullbrightKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.fullbright", InputConstants.UNKNOWN.getValue(), category));
		ChatTabs.register();

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			Extras.tick(mc);
			while (edit.consumeClick()) {
				if (mc.gui.screen() == null) mc.setScreenAndShow(new HudEditScreen());
			}
			MoreModules.Combat.tick(mc);
			// a new world or server starts a new session
			if (mc.player != null && MoreModules.sessionStart == 0) MoreModules.sessionStart = System.currentTimeMillis();
			if (mc.player == null) MoreModules.sessionStart = 0;
			// speed over the last tick, ignoring height so jumping does not count
			if (mc.player != null) {
				Vec3 pos = mc.player.position();
				speed(lastPos == null ? 0 : Math.hypot(pos.x - lastPos.x, pos.z - lastPos.z) * 20);
				lastPos = pos;
			} else lastPos = null;
		});

		// reach and combo: only the local player's own hits, measured from the eyes to the hitbox
		AttackEntityCallback.EVENT.register((player, level, hand, entity, hit) -> {
			Minecraft mc = Minecraft.getInstance();
			if (level.isClientSide() && player == mc.player) MoreModules.Combat.hit(Math.sqrt(entity.getBoundingBox().distanceToSqr(player.getEyePosition())));
			return InteractionResult.PASS;
		});

		// with our effect list on, Minecraft's own effect icons would show the same twice
		HudElementRegistry.replaceElement(VanillaHudElements.MOB_EFFECTS, vanilla -> (g, delta) -> {
			if (!config.placement("effects").enabled) vanilla.extractRenderState(g, delta);
		});

		HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, vanilla -> (g, delta) -> {
			if (!Extras.drawCrosshair(g, Minecraft.getInstance())) vanilla.extractRenderState(g, delta);
		});

		HudElementRegistry.addLast(Identifier.fromNamespaceAndPath(ID, "hud"), (g, delta) -> {
			Minecraft mc = Minecraft.getInstance();
			if (mc.getDebugOverlay().showDebugScreen() || mc.gui.screen() instanceof HudEditScreen) return;
			drawAll(g, mc, false);
		});
	}

	private static void speed(double value) {
		// smoothed, so walking does not flicker between numbers
		Modules.speed = Modules.speed * 0.6 + value * 0.4;
	}

	/** Where a module goes on screen: its anchor point plus the offset, kept inside the screen. */
	static int[] position(HudConfig.Placement p, int w, int h, int screenW, int screenH) {
		int x = Math.round(p.ax * (screenW - w)) + p.dx;
		int y = Math.round(p.ay * (screenH - h)) + p.dy;
		return new int[] { Math.max(0, Math.min(screenW - w, x)), Math.max(0, Math.min(screenH - h, y)) };
	}

	static void drawAll(GuiGraphicsExtractor g, Minecraft mc, boolean preview) {
		Modules.CLICKS.sample(mc);
		for (HudModule m : MODULES) {
			HudConfig.Placement p = config.placement(m.id());
			if (!p.enabled || (!preview && !m.visible(mc))) continue;
			int w = m.width(mc);
			int h = m.height(mc);
			int[] at = position(p, w, h, g.guiWidth(), g.guiHeight());
			// keystrokes draw their own boxes
			if (config.background && !(m instanceof Modules.Keystrokes)) g.fill(at[0], at[1], at[0] + w, at[1] + h, 0x70000000);
			if (preview) m.drawPreview(g, mc, at[0], at[1]);
			else m.draw(g, mc, at[0], at[1]);
		}
	}
}
