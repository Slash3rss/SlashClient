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
	/** The key that opens friends (O): named in hints, e.g. under a screenshot's preview. */
	public static KeyMapping friendsKey;
	static final List<HudModule> MODULES = Modules.all();

	public static List<HudModule> modules() {
		return MODULES;
	}
	private static Vec3 lastPos;
	/** SlashClient's own group of keys (a category in 1.21.9+, a name before): the keys window lists it. */
	static Object keyCategory;

	@Override
	public void onInitializeClient() {
		config = HudConfig.load();
		Modules.cfg = config;

		//#if MC >= 1.21.9
		KeyMapping.Category category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath(ID, "main"));
		//#else
		//$ String category = "key.category.slashclient-hud.main";
		//#endif
		keyCategory = category;
		KeyMapping edit = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.edit", InputConstants.KEY_RSHIFT, category));

		Extras.zoomKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.zoom", InputConstants.KEY_C, category));
		// no key by default: G and the like are taken by other mods too often
		Extras.fullbrightKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.fullbright", InputConstants.UNKNOWN.getValue(), category));
		KeyMapping friends = friendsKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.friends", InputConstants.KEY_O, category));
		dev.slash3rss.slashclient.hud.social.Social.start();
		// Left Alt holds freelook (only once it is switched on in the HUD window); B opens the waypoints
		Freelook.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.freelook", InputConstants.KEY_LALT, category));
		KeyMapping waypointsKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.waypoints", InputConstants.KEY_B, category));
		Clips.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.clip", InputConstants.KEY_F8, category));
		// the instant replay: F6 (F7–F9 are taken by SkyUp's dump, clips and the light overlay)
		Replay.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.replay", InputConstants.KEY_F6, category));
		Cosmetics.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.emote", InputConstants.KEY_N, category));
		// sprays: no key by default (set in SlashClient's keys window or the game's Controls)
		Sprays.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.spray", InputConstants.UNKNOWN.getValue(), category));
		SprayRender.register();
		// the light level overlay (F9) and the third person camera's distance (V + the wheel in F5)
		LightOverlay.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.lightOverlay", InputConstants.KEY_F9, category));
		LightOverlay.register();
		LootHighlight.register();
		CameraDistance.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.cameraDistance", InputConstants.KEY_V, category));
		// the dungeon map's zoom: = and - (free in the game)
		DungeonMap.zoomInKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.dungeonZoomIn", InputConstants.KEY_EQUALS, category));
		DungeonMap.zoomOutKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.dungeonZoomOut", InputConstants.KEY_MINUS, category));
		DungeonMap.fullKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.dungeonMap", InputConstants.KEY_M, category));
		//#if MC >= 26.3
		// SkyUp's GUIs (the island tasks): F7 on an open one saves what it holds
		SkyDump.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.skyDump", InputConstants.KEY_F7, category));
		// and on a task in its GUI, J (or the middle button) tracks it
		SkyTasks.trackKey = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.skyTasksTrack", InputConstants.KEY_J, category));
		//#endif
		ChatTabs.register();
		Assist.register(category);
		// R over a chest or the inventory sorts it (InventorySort; the window's small button does too)
		InventorySort.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.sort", InputConstants.KEY_R, category));
		// K locks the hotbar slot in hand (or the one under the mouse in an inventory)
		SlotLock.key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.slashclient-hud.slotLock", InputConstants.KEY_K, category));
		// shulker boxes show what is inside in their tooltips
		ShulkerPreview.register();
		// wings, pets and clothing: a layer more on every player's model (drawn from render states, which 1.21.1 does not have)
		//#if MC >= 1.21.2
		net.fabricmc.fabric.api.client.rendering.v1.LivingEntityRenderLayerRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
			if (renderer instanceof net.minecraft.client.renderer.entity.player.AvatarRenderer<?> avatar) {
				helper.register(new CosmeticLayer(avatar, context));
				helper.register(new GearLayer(avatar));
				// a ring under the feet
				helper.register(new RingLayer(avatar));
				// a prop pushed in front (Props)
				helper.register(new PropLayer(avatar));
			}
		});
		//#else
		//$ // there only the clothing, suits, back items, tails, rings and props, drawn straight from the player
		//$ net.fabricmc.fabric.api.client.rendering.v1.LivingEntityFeatureRendererRegistrationCallback.EVENT.register((type, renderer, helper, context) -> {
		//$ 	if (renderer instanceof net.minecraft.client.renderer.entity.player.PlayerRenderer player) {
		//$ 		helper.register(new ClothingLayer(player));
		//$ 		helper.register(new SuitLayer(player));
		//$ 		helper.register(new GearLayer(player));
		//$ 		helper.register(new RingLayer(player));
		//$ 		helper.register(new PropLayer(player));
		//$ 	}
		//$ });
		//#endif
		// held item skins before item models: their models are loaded with the game's (HeldSkins)
		//#if MC < 1.21.4
		//$ net.fabricmc.fabric.api.client.model.loading.v1.ModelLoadingPlugin.register(ctx -> ctx.addModels(HeldSkins.legacyModels()));
		//#endif
		// the menu figure with everything on it, drawn as one picture with depth
		//#if MC >= 1.21.6
		dev.slash3rss.slashclient.hud.ui.FigureRender.register();
		//#endif
		Badges.load();
		// the session in numbers for the launcher's summary after the game (SessionStats)
		SessionStats.register();
		// the partners (and which are pinned on top of the server list) before the list is first opened
		PartnerServers.refresh();
		// a crash still saves the game's and other mods' settings
		CrashSave.register();
		// a server's kept pack downloaded while the old copy was in use: in its place before the packs load
		KeptPacks.applyWaiting();
		// another server or world: what we knew about its players is gone
		//#if MC >= 26.3
		// SkyUp's task progress counted in the last moments is not lost on leaving the server or closing the game
		net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.DISCONNECT.register((handler, mc) -> SkyTasks.flush());
		net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientLifecycleEvents.CLIENT_STOPPING.register(mc -> SkyTasks.flush());
		//#endif
		net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents.JOIN.register((handler, sender, mc) -> {
			Badges.reset();
			Cosmetics.reset();
			CosmeticEffects.reset();
			KillEffects.reset();
			MoveEffects.reset();
			Sprays.reset();
			NetCounter.attach(handler.getConnection());
			Reconnect.joined(mc);
			DungeonMap.stop();
			//#if MC >= 26.3
			SkyTasks.joined(mc);
			SkyFish.joined();
			SkyCase.joined();
			//#endif
		});
		// the game's own menu gets a way back to ours
		ScreenEvents.AFTER_INIT.register((mc, screen, w, h) -> {
			// the game's question about a server's pack: "Ustaw na stałe" under it
			PackForGood.attach(mc, screen);
			// servers' windows (a login): Enter in the text field presses the button under it
			DialogEnter.attach(screen);
			// inventories: Shift-drag and the wheel move items (MouseTweaks)
			if (screen instanceof net.minecraft.client.gui.screens.inventory.AbstractContainerScreen<?> container) {
				MouseTweaks.attach(container);
				// shift-crafting only what fits, with room for the grid's leftovers
				CraftFit.attach(container);
				// a search box over the slots, and the locks of hotbar slots
				InventorySearch.attach(mc, container);
				SlotLock.attach(container);
				// sorting with a key or the window's button
				InventorySort.attach(mc, container);
				// the helpers' keys (holding a button, the autoclicker) also over the window
				Assist.attach(mc, container);
				//#if MC >= 26.3
				net.fabricmc.fabric.api.client.screen.v1.ScreenKeyboardEvents.allowKeyPress(screen).register((s, e) -> !SkyDump.key(container, e) && !SkyTasks.key(container, e));
				net.fabricmc.fabric.api.client.screen.v1.ScreenMouseEvents.allowMouseClick(screen).register((s, e) -> !SkyTasks.click(container, e));
				ContainerLayer.under(container, (g, mx, my) -> SkyTasks.drawOver(container, g));
				//#endif
			}
			// dropped by a server: a way straight back to it
			if (screen instanceof net.minecraft.client.gui.screens.DisconnectedScreen) {
				Reconnect.addButton(mc, screen);
				// refused for an old session: renewed at once, and the screen says to connect again
				SessionRenew.disconnected(mc, screen);
			}
			// the death screen: where it happened, how long the life was, and the place kept as a waypoint
			if (screen instanceof net.minecraft.client.gui.screens.DeathScreen death) DeathInfo.attach(mc, death);
			// the server list: partner servers' pictures, fresh enough
			if (screen instanceof net.minecraft.client.gui.screens.multiplayer.JoinMultiplayerScreen) PartnerServers.refresh();
			// the game's own pause menu gets a way back to ours too
			if (screen instanceof net.minecraft.client.gui.screens.PauseScreen pause && pause.showsPauseMenu()) {
				Screens.getWidgets(screen).add(Button.builder(Component.translatable("slashclient-hud.menu.oursPause"), b -> {
					config.customPause = true;
					config.save();
					mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.ui.SlashPauseScreen());
				}).bounds(4, 4, 110, 20).build());
				return;
			}
			if (!(screen instanceof TitleScreen)) return;
			Screens.getWidgets(screen).add(Button.builder(Component.translatable("slashclient-hud.menu.ours"), b -> {
				config.customMenu = true;
				config.save();
				mc.setScreenAndShow(new SlashTitleScreen());
			}).bounds(4, 4, 110, 20).build());
		});

		//#if MC >= 26.3
		// SkyUp's tasks: blocks the player broke ("Zbierz")
		net.fabricmc.fabric.api.event.client.player.ClientPlayerBlockBreakEvents.AFTER.register((world, player, pos, state) -> SkyCounters.broken(player, state));
		//#endif
		// before the game reads the keys of this tick: the drop key's presses on a valuable item
		ClientTickEvents.START_CLIENT_TICK.register(DropGuard::tick);
		ClientTickEvents.END_CLIENT_TICK.register(mc -> {
			TntTimer.tick(mc);
			// a fresh Microsoft token from the launcher before the game's runs out (in the menus)
			SessionRenew.tick(mc);
			PartnerIcons.tick(mc);
			DungeonMap.tick(mc);
			LootHighlight.tick(mc);
			Minimap.tick(mc);
			// sorting's clicks also go out between the window's frames; friends see where we are (when we share it)
			InventorySort.pump(mc);
			dev.slash3rss.slashclient.hud.social.FriendPositions.tick(mc);
			// once a minute on a server: the players in sight, for friend suggestions (only SlashClient players are kept)
			dev.slash3rss.slashclient.hud.social.FriendSuggestions.tick(mc);
			BenchDisplay.tick(mc);
			StreamChatModule.tick(mc);
			SpotifyModule.tick(mc);
			//#if MC >= 26.3
			SkyTasks.tick(mc);
			SkyCase.tick(mc);
			//#endif
			if (mc.level != null && mc.level.getGameTime() % 20 == 0) dev.slash3rss.slashclient.hud.social.Social.watchLan(mc);
			// what the server's tab list says ("S3 (Wyspy)"), for friends and Discord
			TabStatus.tick(mc);
			WaypointKeys.tick(mc);
			DamageNumbers.tick(mc);
			Extras.tick(mc);
			Assist.tick(mc);
			Latency.tick(mc);
			Benchmark.tick(mc);
			Cosmetics.tick(mc);
			CosmeticEffects.tick(mc);
			LimbWear.tick(mc);
			KillEffects.tick(mc);
			HitMarker.tick(mc);
			MoveEffects.tick(mc);
			RingEffects.tick(mc);
			Sprays.tick(mc);
			Clips.tick(mc);
			Replay.tick(mc);
			Badges.tick(mc);
			while (edit.consumeClick()) {
				if (Compat.screen(mc) == null) mc.setScreenAndShow(new HudEditScreen());
			}
			Freelook.tick(mc);
			DeathPoint.tick(mc);
			DeathInfo.tick(mc);
			LightOverlay.tick(mc);
			CameraDistance.tick(mc);
			SlotLock.keyTick(mc);
			while (waypointsKey.consumeClick()) {
				if (Compat.screen(mc) == null && config.waypoints) mc.setScreenAndShow(new WaypointsScreen());
			}
			while (friends.consumeClick()) {
				if (Compat.screen(mc) == null) mc.setScreenAndShow(new dev.slash3rss.slashclient.hud.social.FriendsScreen(null));
			}
			MoreModules.Combat.tick(mc);
			ExtraModules.Stats.tick(mc);
			SessionStats.tick(mc);
			if (mc.getConnection() == null) ExtraModules.Stats.disconnected();
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
			if (level.isClientSide() && player == mc.player) {
				MoreModules.Combat.hit(Math.sqrt(entity.getBoundingBox().distanceToSqr(player.getEyePosition())));
				//#if MC >= 26.3
				SkyCounters.attacked(player, entity);
				//#endif
				ExtraModules.Stats.attack(player, entity);
				SessionStats.attacked(entity);
				KillEffects.attacked(entity);
				HitMarker.attacked(entity);
			}
			return InteractionResult.PASS;
		});

		// with our effect list on, Minecraft's own effect icons would show the same twice
		HudElementRegistry.replaceElement(VanillaHudElements.MOB_EFFECTS, vanilla -> (g, delta) -> {
			if (!config.placement("effects").enabled) vanilla.extractRenderState(g, delta);
		});

		GameHud.register();
		// the chat's size and opacity from the editor, and a layout of its own for each server
		ChatLook.register();
		ServerLayouts.register();

		HudElementRegistry.replaceElement(VanillaHudElements.CROSSHAIR, vanilla -> (g, delta) -> {
			if (!Extras.drawCrosshair(g, Minecraft.getInstance())) vanilla.extractRenderState(g, delta);
			// over the crosshair, ours or the game's
			HitMarker.draw(g, Minecraft.getInstance());
		});

		// under the chat and the tab list, as in other clients: those stay readable over the HUD
		HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.fromNamespaceAndPath(ID, "hud"), (g, delta) -> {
			Minecraft mc = Minecraft.getInstance();
			Benchmark.frame(g, mc);
			if (mc.getDebugOverlay().showDebugScreen() || Compat.screen(mc) instanceof HudEditScreen) return;
			drawAll(g, mc, false);
			Waypoints.draw(g, mc);
			DamageNumbers.draw(g, mc);
			Sprays.drawCooldown(g, mc);
			ChatTabs.drawMentionBadge(g, mc);
			ChatWindows.draw(g, mc);
			Shots.draw(g);
			SlotLock.drawHotbar(g, mc);
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
		drawAll(g, mc, preview, null);
	}

	/** Every module, with {@code top} (the one the editor's mouse is on) drawn last, over the others. */
	static void drawAll(GuiGraphicsExtractor g, Minecraft mc, boolean preview, HudModule top) {
		Modules.CLICKS.sample(mc);
		for (HudModule m : MODULES) if (m != top) drawOne(g, mc, preview, m);
		if (top != null) drawOne(g, mc, preview, top);
	}

	private static void drawOne(GuiGraphicsExtractor g, Minecraft mc, boolean preview, HudModule m) {
		HudConfig.Placement p = config.placement(m.id());
		if (!p.enabled || (!preview && !m.visible(mc))) return;
		int[] size = size(m, mc, p);
		int[] at = position(p, size[0], size[1], g.guiWidth(), g.guiHeight());
		var pose = g.pose();
		pose.pushMatrix();
		pose.translate(at[0], at[1]);
		pose.scale(p.scale(), p.scale());
		// keystrokes draw their own boxes
		int w = m.width(mc), h = m.height(mc);
		if (p.background(config) && !(m instanceof Modules.Keystrokes) && !(m instanceof GameParts.Part)) g.fill(0, 0, w, h, Math.round(p.opacity() * 2.55f) << 24);
		if (p.outline && !(m instanceof GameParts.Part)) {
			int c = 0xCC60A5FA;
			g.fill(-1, -1, w + 1, 0, c);
			g.fill(-1, h, w + 1, h + 1, c);
			g.fill(-1, 0, 0, h, c);
			g.fill(w, 0, w + 1, h, c);
		}
		// the module's own text colour and shadow, where it draws in the HUD's
		Modules.drawing = p;
		if (preview) m.drawPreview(g, mc, 0, 0);
		else m.draw(g, mc, 0, 0);
		Modules.drawing = null;
		pose.popMatrix();
	}

	/** F3's version line with SlashClient's name and version in place of the game's ("SlashClient 0.9.50 · 1.21.4 …"). */
	public static String brandedVersion(String line) {
		if (!line.startsWith("Minecraft ")) return line;
		String v = version();
		return "SlashClient " + (v.isEmpty() ? "" : v + " · ") + line.substring("Minecraft ".length());
	}

	/** The launcher's version, as it started the game ("0.9.50"); "" from an older launcher, or without one. */
	public static String version() {
		String v = System.getProperty("slashclient.version", "").strip();
		return v.matches("[0-9A-Za-z.+-]{1,32}") ? v : "";
	}

	/** The name the servers see (the client's brand): "slashclient", with the version when it is known. */
	public static String brand() {
		String v = version();
		return v.isEmpty() ? "slashclient" : "slashclient " + v;
	}
}
