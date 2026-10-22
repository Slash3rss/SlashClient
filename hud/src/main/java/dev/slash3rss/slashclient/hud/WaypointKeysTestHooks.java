package dev.slash3rss.slashclient.hud;

import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** For the game test of waypoint keys (GameWaypointKeys): the file, the lists and the death point, from outside the package. */
public final class WaypointKeysTestHooks {
	private WaypointKeysTestHooks() {}

	public static Path file() {
		return FabricLoader.getInstance().getConfigDir().resolve("slashclient-waypoints.json");
	}

	public static Path backup() {
		return FabricLoader.getInstance().getConfigDir().resolve("slashclient-waypoints-before-keys.json");
	}

	/** Reads the file again, as the game does at its first look at waypoints (keys written one way then). */
	public static void reload() {
		Waypoints.reloadForTest();
	}

	public static Map<String, List<Waypoints.Point>> lists() {
		return Waypoints.lists();
	}

	/** Names of the points kept under a key ("" when none). */
	public static String names(String key) {
		List<Waypoints.Point> list = Waypoints.lists().get(key);
		List<String> out = new ArrayList<>();
		if (list != null) for (Waypoints.Point p : list) out.add(p.name);
		return String.join(",", out);
	}

	/** Names of the points shown here. */
	public static String shown(Minecraft mc) {
		List<String> out = new ArrayList<>();
		for (Waypoints.Point p : Waypoints.points(mc)) out.add(p.name);
		return String.join(",", out);
	}

	public static Waypoints.Point point(String name, int x, int z) {
		return new Waypoints.Point(name, x, 70, z, "ResourceKey[minecraft:dimension / minecraft:overworld]", Waypoints.COLORS[0]);
	}

	public static Waypoints.Point find(Minecraft mc, String name) {
		for (Waypoints.Point p : Waypoints.points(mc)) if (p.name.equals(name)) return p;
		return null;
	}

	/** The singleplayer world opened again, as far as moving its points from the old name goes. */
	public static void rerunSingleplayer() {
		WaypointKeys.rerunSingleplayerForTest();
	}

	public static Waypoints.Point placeDeath(Minecraft mc) {
		return DeathPoint.place(mc);
	}

	public static String exploredWorld() {
		return MinimapTerrain.exploredWorld();
	}

	/** A line in the chat as the client shows a server's message (through the chat's own way in, so it gets marked). */
	public static void chat(Minecraft mc, net.minecraft.network.chat.Component line) {
		Compat.chat(mc).addClientSystemMessage(line);
	}

	/** The newest chat line's style at the start of `text` in it (what a click there finds), from its stored content. */
	public static net.minecraft.network.chat.Style chatStyle(String text) {
		var chat = Compat.chat(Minecraft.getInstance());
		net.minecraft.client.multiplayer.chat.GuiMessage m = null;
		for (Object o : ((dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) chat).slashclient$allMessages()) {
			if (((net.minecraft.client.multiplayer.chat.GuiMessage) o).content().getString().contains(text)) {
				m = (net.minecraft.client.multiplayer.chat.GuiMessage) o;
				break;
			}
		}
		if (m == null) return null;
		String plain = m.content().getString();
		int at = plain.indexOf(text);
		net.minecraft.network.chat.Style[] found = new net.minecraft.network.chat.Style[1];
		int[] pos = { 0 };
		m.content().visit((style, s) -> {
			if (found[0] == null && at >= pos[0] && at < pos[0] + s.length()) found[0] = style;
			pos[0] += s.length();
			return java.util.Optional.empty();
		}, net.minecraft.network.chat.Style.EMPTY);
		return found[0];
	}

	/** Where in the open chat (GUI pixels) the middle of `text` in the newest line is (one line, not wrapped). */
	public static int[] chatSpot(String text) {
		Minecraft mc = Minecraft.getInstance();
		var chat = Compat.chat(mc);
		var all = ((dev.slash3rss.slashclient.hud.mixin.ChatComponentAccessor) chat).slashclient$allMessages();
		// the newest line holding it, counted from the bottom (lines short enough not to wrap)
		int row = 0;
		while (row < all.size() - 1 && !((net.minecraft.client.multiplayer.chat.GuiMessage) all.get(row)).content().getString().contains(text)) row++;
		var m = (net.minecraft.client.multiplayer.chat.GuiMessage) all.get(row);
		String plain = m.content().getString();
		int at = plain.indexOf(text);
		double scale = ChatLook.scale(mc);
		int lineHeight = (int) (9.0 * (mc.options.chatLineSpacing().get() + 1.0));
		double y = ((mc.getWindow().getGuiScaledHeight() - 40) / scale - lineHeight * (row + 0.5)) * scale;
		double x = (4 + mc.font.width(plain.substring(0, Math.max(0, at))) + mc.font.width(text) / 2.0) * scale;
		return new int[] { (int) Math.round(x), (int) Math.round(y) };
	}

	public static void write(String json) throws Exception {
		Files.writeString(file(), json);
	}
}
