package dev.slash3rss.slashclient.hud.players;

import dev.slash3rss.slashclient.hud.gamehud.GameHud;
import dev.slash3rss.slashclient.hud.SlashHud;

import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.Style;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;

import java.util.UUID;

/**
 * Other players' ping after their name above the head ("Nick 45ms"), from the tab list's entry and in
 * the tab list's colours (GameHud.pingColor). It is part of the name's own line, so the logo, the clan
 * tag, "● NA ŻYWO" above and the score below stay where they were. Only on a server: in your own world
 * (also opened to LAN) everyone's ping is the host's, and a server that sends none (or 0) shows nothing.
 */
public final class NametagPing {
	private NametagPing() {}

	/** For the in-game test: singleplayer counts as a server and our own name (F5) shows its ping too. */
	public static boolean anyWorld;

	/** `name` with the player's ping after it, when there is one to show. */
	public static Component decorate(Entity entity, Component name) {
		if (name == null || !(entity instanceof Player)) return name;
		Minecraft mc = Minecraft.getInstance();
		if (!anyWorld && (entity == mc.player || mc.hasSingleplayerServer())) return name;
		Component ping = label(entity.getUUID());
		return ping == null ? name : Component.empty().append(name).append(" ").append(ping);
	}

	/** "45ms" in the ping's colour for this player, or null: the setting off, not on the tab list, or no ping. */
	public static Component label(UUID id) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config == null || !SlashHud.config.nametagPing || id == null || mc.getConnection() == null) return null;
		var info = mc.getConnection().getPlayerInfo(id);
		if (info == null) return null;
		int ms = info.getLatency();
		if (ms <= 0) return null;
		return Component.literal(ms + "ms").withStyle(Style.EMPTY.withColor(GameHud.pingColor(ms) & 0xFFFFFF));
	}
}
