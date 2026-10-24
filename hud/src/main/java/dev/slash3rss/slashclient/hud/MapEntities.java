package dev.slash3rss.slashclient.hud;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MobCategory;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * Players and mobs on the minimap and the full map: whatever the game itself already knows about
 * around the player (what the server sends), nothing more. Other players show as their face in a
 * blue frame, hostile mobs as red dots, the other mobs (animals, villagers, golems) as green ones;
 * each kind can be switched off. Friends sharing their position are drawn by the maps themselves,
 * so they are left out here, and so are server NPCs (players who are not real ones: not on the
 * tab list and with an NPC's id or name), armour stands, items and invisible things.
 */
final class MapEntities {
	private MapEntities() {}

	static final int PLAYER = 0xFF60A5FA, HOSTILE = 0xFFEF4444, PASSIVE = 0xFF4ADE80;
	static final int KIND_PLAYER = 0, KIND_HOSTILE = 1, KIND_PASSIVE = 2;

	/** One thing to draw: where it is (x, z), which way it looks and what it is. */
	record Mark(Entity entity, int kind, double x, double z, float yaw) {}

	/** For the tests: what each map drew last ("players,hostile,passive" counts and the players' names). */
	static String drawnMinimap = "", drawnWorldMap = "";

	/** A real player's nick (a Bedrock one through Geyser may start with "." or "*"). */
	private static final java.util.regex.Pattern NICK = java.util.regex.Pattern.compile("[.*]?[A-Za-z0-9_]{1,16}");

	private static boolean on() {
		HudConfig cfg = SlashHud.config;
		return cfg != null && (cfg.mapPlayers || cfg.mapHostile || cfg.mapPassive);
	}

	/**
	 * What to draw, placed `t` of the way from the last tick to this one (0..1): mobs first and
	 * players last, so the players lie on top.
	 */
	static List<Mark> around(Minecraft mc, float t) {
		if (!on() || mc.level == null || mc.player == null) return List.of();
		HudConfig cfg = SlashHud.config;
		Set<UUID> friends = new HashSet<>();
		for (var p : dev.slash3rss.slashclient.hud.social.FriendPositions.visible(mc)) friends.addAll(p.uuids());
		List<Mark> mobs = new ArrayList<>(), players = new ArrayList<>();
		for (Entity e : mc.level.entitiesForRendering()) {
			if (e == mc.player || !e.isAlive() || e.isInvisible()) continue;
			int kind;
			if (e instanceof AbstractClientPlayer p) {
				if (!cfg.mapPlayers || p.isSpectator() || friends.contains(p.getUUID()) || !realPlayer(mc, p)) continue;
				kind = KIND_PLAYER;
			} else if (e instanceof Mob) {
				kind = e.getType().getCategory() == MobCategory.MONSTER ? KIND_HOSTILE : KIND_PASSIVE;
				if (kind == KIND_HOSTILE ? !cfg.mapHostile : !cfg.mapPassive) continue;
			} else continue;
			double x = e.xo + (e.getX() - e.xo) * t, z = e.zo + (e.getZ() - e.zo) * t;
			(kind == KIND_PLAYER ? players : mobs).add(new Mark(e, kind, x, z, e.getYRot()));
		}
		// hostile over the others, so a zombie in a herd of cows is seen
		mobs.sort((a, b) -> Integer.compare(b.kind(), a.kind()));
		mobs.addAll(players);
		return mobs;
	}

	/**
	 * A real player, not a server's NPC: on the tab list, or else with an id of a real (or offline)
	 * player and a nick that could be one. Plugins' NPCs have version 2 ids and often odd names.
	 */
	static boolean realPlayer(Minecraft mc, AbstractClientPlayer p) {
		var connection = mc.getConnection();
		if (connection != null && connection.getPlayerInfo(p.getUUID()) != null) return true;
		return p.getUUID().version() != 2 && NICK.matcher(p.getName().getString()).matches();
	}

	/** One mark at (x, y) on a map; `names` puts a player's nick under their face. */
	static void draw(GuiGraphicsExtractor g, Minecraft mc, Mark m, int x, int y, boolean names) {
		if (m.kind() != KIND_PLAYER) {
			int color = m.kind() == KIND_HOSTILE ? HOSTILE : PASSIVE;
			// a dot of 3 pixels in a black ring, seen on grass as well as on sand
			g.fill(x - 2, y - 2, x + 3, y + 3, 0xFF000000);
			g.fill(x - 1, y - 1, x + 2, y + 2, color);
			return;
		}
		AbstractClientPlayer p = (AbstractClientPlayer) m.entity();
		Identifier skin = Compat.skinTexture(p);
		g.fill(x - 5, y - 5, x + 5, y + 5, 0xFF000000);
		g.fill(x - 4, y - 4, x + 4, y + 4, PLAYER);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - 3, y - 3, 8, 8, 6, 6, 8, 8, 64, 64, 0xFFFFFFFF);
		g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x - 3, y - 3, 40, 8, 6, 6, 8, 8, 64, 64, 0xFFFFFFFF);
		if (!names) return;
		String name = p.getName().getString();
		var pose = g.pose();
		int tw = mc.font.width(name);
		pose.pushMatrix();
		pose.translate(x - tw * 0.3f, y + 6);
		pose.scale(0.6f, 0.6f);
		g.fill(-2, -1, tw + 2, 9, 0xB0000000);
		g.text(mc.font, name, 0, 0, PLAYER, false);
		pose.popMatrix();
	}

	/** What was drawn, for the tests: "1,2,3:Name" (players, hostile, passive, the players' nicks). */
	static String describe(List<Mark> drawn) {
		int[] n = new int[3];
		StringBuilder names = new StringBuilder();
		for (Mark m : drawn) {
			n[m.kind()]++;
			if (m.kind() == KIND_PLAYER) names.append(m.entity().getName().getString()).append(',');
		}
		return n[0] + "," + n[1] + "," + n[2] + ":" + names;
	}
}
