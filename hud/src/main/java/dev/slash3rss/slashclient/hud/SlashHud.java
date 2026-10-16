package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.platform.InputConstants;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.fabricmc.fabric.api.event.player.AttackEntityCallback;
import net.minecraft.world.InteractionResult;
import dev.slash3rss.slashclient.hud.ui.SlashTitleScreen;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.client.screen.v1.Screens;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.network.chat.Component;
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

	public static HudConfig config;
	static final List<HudModule> MODULES = Modules.all();

	public static List<HudModule> modules() {
		return MODULES;
	}
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
		KeyMapping friends = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.friends", InputConstants.KEY_O, category));
		dev.slash3rss.slashclient.hud.social.Social.start();
		ChatTabs.register();
		Badges.load();
		// another server or world: what we knew about its players is gone
		net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.JOIN.register((handler, sender, mc) -> Badges.reset());
		// the game's own menu gets a way back to ours
		ScreenEvents.AFTER_INIT.register((mc, screen, w, h) -> {
			if (!(screen instanceof TitleScreen)) return;
			Screens.getWidgets(screen).add(Button.builder(Component.translatable("slashclient-hud.menu.ours"), b -> {
				config.customMenu = true;
				config.save();
				mc.setScreenAndShow(new SlashTitleScreen());
			}).bounds(4, 4, 110, 20).build());
		});

		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			Extras.tick(mc);
			Badges.tick(mc);
			while (edit.consumeClick()) {
				if (Compat.screen(mc) == null) mc.setScreenAndShow(new HudEditScreen());
			}
			while (friends.consumeClick()) {
				if (Compat.screen(mc) == null) mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.social.FriendsScreen(null));
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

		// under the chat and the tab list, as in other clients: those stay readable over the HUD
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.fromNamespaceAndPath(ID, "hud"), (g, delta) -> {
			Minecraft mc = Minecraft.getInstance();
			if (mc.getDebugOverlay().showDebugScreen() || Compat.screen(mc) instanceof HudEditScreen) return;
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

	/** On-screen size of a module, with its scale. */
	static int[] size(HudModule m, Minecraft mc, HudConfig.Placement p) {
		return new int[] { Math.round(m.width(mc) * p.scale()), Math.round(m.height(mc) * p.scale()) };
	}

	static void drawAll(GuiGraphicsExtractor g, Minecraft mc, boolean preview) {
		Modules.CLICKS.sample(mc);
		for (HudModule m : MODULES) {
			HudConfig.Placement p = config.placement(m.id());
			if (!p.enabled || (!preview && !m.visible(mc))) continue;
			int[] size = size(m, mc, p);
			int[] at = position(p, size[0], size[1], g.guiWidth(), g.guiHeight());
			var pose = g.pose();
			pose.pushMatrix();
			pose.translate(at[0], at[1]);
			pose.scale(p.scale(), p.scale());
			// keystrokes draw their own boxes
			if (p.background(config) && !(m instanceof Modules.Keystrokes)) g.fill(0, 0, m.width(mc), m.height(mc), 0x70000000);
			if (preview) m.drawPreview(g, mc, 0, 0);
			else m.draw(g, mc, 0, 0);
			pose.popMatrix();
		}
	}
}
