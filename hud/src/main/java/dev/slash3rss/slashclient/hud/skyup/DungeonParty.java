// SkyUp's dungeon party is for SkyUp, played on 26.3: the module is there only
//#if MC >= 26.3
package dev.slash3rss.slashclient.hud.skyup;

import dev.slash3rss.slashclient.hud.Compat;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.modules.HudModule;
import dev.slash3rss.slashclient.hud.modules.Modules;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.Entity;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Who is in the player's SkyUp dungeon party (/dng druzyna), as the chat says it: the party made, a player invited,
 * one joining and leaving, and the whole list from "/dng druzyna info". Beside each name their face, their health
 * and how far they are while they are near enough for the game to see them, and in the dungeon they glow (when
 * wanted) so the player finds them through walls. The chat as SkyUp wrote it in November 2026:
 * <pre>
 * Dungeon » Utworzono drużynę! Zaproś do niej znajomych komendą /dng druzyna zapros &lt;nick&gt;
 * Dungeon » Slash3rss zaprosił KolegaodNetu do drużyny.
 * Dungeon » KolegaodNetu dołączył do drużyny.
 * Dungeon » Twoja drużyna: Slash3rss, KolegaodNetu
 * Dungeon » KolegaodNetu opuścił drużynę.
 * Dungeon » Opuszczono drużynę.          (also when leaving a dungeon played alone: a party of one)
 * </pre>
 * Joining someone else's party the chat may not list who was in it before: the module then says to type
 * /dng druzyna info, whose answer gives the whole party.
 */
public final class DungeonParty {
	private DungeonParty() {}

	/** The glow of the party in the dungeon (0xRRGGBB): green, apart from the bosses' red and orange. */
	public static final int GLOW = 0x4ADE80;

	private static final Pattern CREATED = Pattern.compile("^Dungeon » Utworzono drużynę!.*");
	private static final Pattern INVITED = Pattern.compile("^Dungeon » (\\S+) zaprosił (\\S+) do drużyny\\.?$");
	private static final Pattern JOINED = Pattern.compile("^Dungeon » (\\S+) dołączył(?:a)? do drużyny[.!]?$");
	private static final Pattern LEFT = Pattern.compile("^Dungeon » (\\S+) opuścił(?:a)? drużynę[.!]?$");
	// not seen yet: as SkyUp says the like elsewhere, so a kick takes the player off the list too
	private static final Pattern KICKED = Pattern.compile("^Dungeon » (?:Gracz )?(\\S+) został(?:a)? wyrzucon[ya] z drużyny.*");
	private static final Pattern KICKED_BY = Pattern.compile("^Dungeon » (\\S+) wyrzucił(?:a)? (\\S+) z drużyny.*");
	private static final Pattern LIST = Pattern.compile("^Dungeon » Twoja drużyna: (.+)$");
	private static final Pattern GONE = Pattern.compile("^Dungeon » (?:Opuszczono drużynę|Wyrzucono Cię z drużyny|Zostałeś wyrzucony z drużyny|Drużyna została rozwiązana).*");
	private static final Pattern SPACES = Pattern.compile("\\s+");
	private static final Pattern NICK = Pattern.compile("[A-Za-z0-9_]{1,16}");

	/** The party in the order the chat gave it (the player too), the leader when known, those invited not in yet. */
	private static final List<String> members = new ArrayList<>();
	private static final Set<String> invited = new LinkedHashSet<>();
	private static String leader;
	/** Joined a party without its list: who else is in it the chat has not said. */
	private static boolean partial;
	/** The connection the party was heard on: another server (or the same one again) begins with none. */
	private static Object connection;

	/** A line of the chat (ChatComponentMixin). */
	public static void onChat(String line) {
		Minecraft mc = Minecraft.getInstance();
		if (SlashHud.config == null || mc.player == null || !line.contains("Dungeon") || !SkyTasks.onSkyUp(mc)) return;
		sameConnection(mc);
		heard(line, mc.player.getName().getString());
	}

	private static void sameConnection(Minecraft mc) {
		Object now = mc.getConnection();
		if (now != connection) {
			connection = now;
			clear();
		}
	}

	private static void clear() {
		members.clear();
		invited.clear();
		leader = null;
		partial = false;
	}

	/** What a line says of the party, `me` being the player's own nick. */
	static void heard(String line, String me) {
		line = SPACES.matcher(DungeonMap.uncoloured(line)).replaceAll(" ").trim();
		if (!line.startsWith("Dungeon » ")) return;
		Matcher m;
		if (CREATED.matcher(line).matches()) {
			clear();
			members.add(me);
			leader = me;
		} else if ((m = INVITED.matcher(line)).matches()) {
			// an invitation for the player is not a party yet
			if (same(m.group(2), me)) return;
			if (members.isEmpty()) members.add(me);
			if (!contains(members, m.group(2))) invited.add(m.group(2));
		} else if ((m = JOINED.matcher(line)).matches()) {
			String who = m.group(1);
			if (same(who, me)) {
				// the player joined someone's party: who else is in it only /dng druzyna info says
				clear();
				members.add(me);
				partial = true;
				return;
			}
			if (members.isEmpty()) members.add(me);
			remove(invited, who);
			if (!contains(members, who)) members.add(who);
		} else if ((m = LEFT.matcher(line)).matches()) {
			leaves(m.group(1), me);
		} else if ((m = KICKED.matcher(line)).matches()) {
			leaves(m.group(1), me);
		} else if ((m = KICKED_BY.matcher(line)).matches()) {
			leaves(m.group(2), me);
		} else if ((m = LIST.matcher(line)).matches()) {
			members.clear();
			for (String n : m.group(1).split(",")) {
				String nick = n.strip();
				if (NICK.matcher(nick).matches() && !contains(members, nick)) members.add(nick);
			}
			if (!contains(members, me)) members.add(0, me);
			for (String n : members) remove(invited, n);
			if (leader != null && !contains(members, leader)) leader = null;
			partial = false;
		} else if (GONE.matcher(line).matches()) {
			clear();
		}
	}

	private static void leaves(String who, String me) {
		if (same(who, me)) {
			clear();
			return;
		}
		remove(members, who);
		remove(invited, who);
		if (same(who, leader)) leader = null;
	}

	private static boolean same(String a, String b) {
		return a != null && b != null && a.equalsIgnoreCase(b);
	}

	private static boolean contains(java.util.Collection<String> names, String who) {
		for (String n : names) if (same(n, who)) return true;
		return false;
	}

	private static void remove(java.util.Collection<String> names, String who) {
		names.removeIf(n -> same(n, who));
	}

	/** Whether someone else is in the party (or invited): not alone. */
	static boolean together() {
		return members.size() > 1 || !invited.isEmpty();
	}

	/** The glow of a party member in the dungeon (0xRRGGBB), or -1 (BossGlow asks every frame). */
	public static int glowColor(Entity entity) {
		if (members.size() < 2 || !(entity instanceof AbstractClientPlayer p)) return -1;
		HudConfig c = SlashHud.config;
		Minecraft mc = Minecraft.getInstance();
		if (c == null || !c.dungeonPartyGlow || entity == mc.player || !DungeonMap.active() || !c.placement("dungeonparty").enabled) return -1;
		return contains(members, p.getName().getString()) ? GLOW : -1;
	}

	// ---------- the module ----------

	/** One row: a nick, whether it leads, is the player, is only invited, and their player when near enough. */
	private record Row(String nick, boolean leads, boolean me, boolean invite, AbstractClientPlayer player) {}

	private static List<Row> rows(Minecraft mc) {
		List<Row> out = new ArrayList<>();
		String me = mc.player == null ? "" : mc.player.getName().getString();
		List<String> names = new ArrayList<>(members);
		// alone in the dungeon (no party heard): the player's own row
		if (names.isEmpty() && mc.player != null) names.add(me);
		for (String n : names) out.add(new Row(n, same(n, leader), same(n, me), false, same(n, me) ? mc.player : near(mc, n)));
		for (String n : invited) out.add(new Row(n, false, false, true, null));
		return out;
	}

	private static AbstractClientPlayer near(Minecraft mc, String nick) {
		if (mc.level == null) return null;
		for (AbstractClientPlayer p : mc.level.players()) if (same(p.getName().getString(), nick)) return p;
		return null;
	}

	/** What a row says on the right: health and distance, "daleko" when the game cannot see them, "zaproszony". */
	private static String state(Minecraft mc, Row r) {
		if (r.invite()) return Component.translatable("slashclient-hud.dungeonParty.invited").getString();
		HudConfig c = SlashHud.config;
		AbstractClientPlayer p = r.player();
		if (p == null) return c.dungeonPartyHealth || c.dungeonPartyDistance ? Component.translatable("slashclient-hud.dungeonParty.far").getString() : "";
		StringBuilder s = new StringBuilder();
		if (c.dungeonPartyHealth) s.append(health(p.getHealth())).append(" ❤");
		if (c.dungeonPartyDistance && !r.me()) {
			if (!s.isEmpty()) s.append("  ");
			s.append(Math.round(Math.sqrt(p.distanceToSqr(mc.player)))).append(" m");
		}
		return s.toString();
	}

	private static String health(float hp) {
		return hp == Math.round(hp) ? String.valueOf(Math.round(hp)) : String.format(Locale.ROOT, "%.1f", hp);
	}

	/** The colour of a row's state: its health's, green to red; grey far or invited. */
	private static int stateColor(Row r) {
		AbstractClientPlayer p = r.player();
		if (p == null || !SlashHud.config.dungeonPartyHealth) return 0xFF9CA3AF;
		float f = p.getHealth() / Math.max(1f, p.getMaxHealth());
		if (!p.isAlive() || f <= 0) return 0xFF6B7280;
		return f > 0.6f ? 0xFF4ADE80 : f > 0.3f ? 0xFFFACC15 : 0xFFF87171;
	}

	/** Whether the hint for /dng druzyna info goes under the list: who is in the party is not (fully) known. */
	private static boolean hint() {
		return SlashHud.config.dungeonPartyHint && (partial || members.isEmpty());
	}

	public static final class Module implements HudModule {
		private static final int ROW = 10, FACE = 8;

		public String id() {
			return "dungeonparty";
		}

		@Override
		public boolean textColored() {
			return false;
		}

		@Override
		public boolean visible(Minecraft mc) {
			if (mc.player == null || !SkyTasks.onSkyUp(mc)) return false;
			sameConnection(mc);
			if (together()) return true;
			// alone: only in the dungeon, and only when wanted
			return DungeonMap.active() && !SlashHud.config.dungeonPartyHideSolo;
		}

		private static Component title() {
			return Component.translatable(together() ? "slashclient-hud.dungeonParty.title" : "slashclient-hud.dungeonParty.solo");
		}

		private static Component hintText() {
			return Component.translatable("slashclient-hud.dungeonParty.hint");
		}

		public int width(Minecraft mc) {
			return width(mc, rows(mc), hint());
		}

		private static int width(Minecraft mc, List<Row> rows, boolean hint) {
			int w = mc.font.width(title());
			for (Row r : rows) w = Math.max(w, FACE + 3 + mc.font.width(name(r)) + 8 + mc.font.width(state(mc, r)));
			if (hint) w = Math.max(w, mc.font.width(hintText()));
			return Math.max(90, w) + Modules.PAD * 2;
		}

		public int height(Minecraft mc) {
			return height(rows(mc).size(), hint());
		}

		private static int height(int rows, boolean hint) {
			return ROW + rows * ROW + (hint ? ROW : 0) + Modules.PAD * 2 - 1;
		}

		private static String name(Row r) {
			return r.leads() ? "★ " + r.nick() : r.nick();
		}

		public void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			draw(g, mc, x, y, rows(mc), hint());
		}

		private static void draw(GuiGraphicsExtractor g, Minecraft mc, int x, int y, List<Row> rows, boolean hint) {
			int w = width(mc, rows, hint) - Modules.PAD * 2, left = x + Modules.PAD, top = y + Modules.PAD;
			Modules.text(g, mc, title(), left, top, 0xFF4ADE80);
			int row = top + ROW;
			for (Row r : rows) {
				face(g, mc, r, left, row);
				int color = r.invite() ? 0xFF9CA3AF : r.leads() ? 0xFFFACC15 : r.me() ? 0xFFFFFFFF : 0xFFE5E7EB;
				Modules.text(g, mc, name(r), left + FACE + 3, row, color);
				String state = state(mc, r);
				Modules.text(g, mc, state, left + w - mc.font.width(state), row, r.invite() ? 0xFF9CA3AF : stateColor(r));
				row += ROW;
			}
			if (hint) Modules.text(g, mc, hintText(), left, row, 0xFF9CA3AF);
		}

		/** A face from the skin with its hat layer: of the player near, else from the tab list, else a grey square. */
		private static void face(GuiGraphicsExtractor g, Minecraft mc, Row r, int x, int y) {
			Identifier skin = null;
			if (r.player() != null) skin = Compat.skinTexture(r.player());
			else if (mc.getConnection() != null) {
				var info = mc.getConnection().getPlayerInfo(r.nick());
				if (info != null) skin = Compat.skinTexture(info);
			}
			if (skin == null) {
				g.fill(x, y - 1, x + FACE, y - 1 + FACE, 0xFF4B5563);
				return;
			}
			int tint = r.invite() || r.player() == null && !r.me() ? 0xFF9CA3AF : 0xFFFFFFFF;
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x, y - 1, 8, 8, FACE, FACE, 8, 8, 64, 64, tint);
			g.blit(net.minecraft.client.renderer.RenderPipelines.GUI_TEXTURED, skin, x, y - 1, 40, 8, FACE, FACE, 8, 8, 64, 64, tint);
		}

		/** In the editor: a party of three and one invited, as it looks in a dungeon. */
		@Override
		public void drawPreview(GuiGraphicsExtractor g, Minecraft mc, int x, int y) {
			if (visible(mc)) {
				draw(g, mc, x, y);
				return;
			}
			List<String> m = new ArrayList<>(members);
			Set<String> i = new LinkedHashSet<>(invited);
			String l = leader;
			boolean p = partial;
			sample(mc);
			draw(g, mc, x, y);
			members.clear();
			members.addAll(m);
			invited.clear();
			invited.addAll(i);
			leader = l;
			partial = p;
		}
	}

	private static void sample(Minecraft mc) {
		clear();
		String me = mc.player == null ? "Slash3rss" : mc.player.getName().getString();
		members.addAll(List.of(me, "KolegaodNetu", "Guardes"));
		invited.add("Szeregowy007");
		leader = me;
	}

	// ---------- for the in-game tests ----------

	/**
	 * The chat of a real party (Slash3rss with KolegaodNetu, 17 November 2026) through the parser, the party after
	 * each line as "leader:members/invited" (partial with a "?"); then joining someone's party without its list and
	 * the list from /dng druzyna info. Ends with the party for the screenshot, the module switched on.
	 */
	public static String checkForTest() {
		StringBuilder out = new StringBuilder();
		clear();
		String me = "Slash3rss";
		for (String line : List.of(
			"§5Dungeon §8» §7Utworzono drużynę! Zaproś do niej znajomych komendą /dng druzyna zapros <nick>",
			"Dungeon » Slash3rss zaprosił KolegaodNetu do drużyny.",
			"Dungeon » KolegaodNetu dołączył do drużyny.",
			"Dungeon » Twoja drużyna: Slash3rss, KolegaodNetu",
			"Opuść drużynę komendą /dng druzyna opusc",
			"Dungeon » KolegaodNetu opuścił drużynę.",
			"Dungeon » Opuszczono drużynę.",
			// invited by someone: no party yet; joining it: only the player known until /dng druzyna info
			"Dungeon » Guardes zaprosił Slash3rss do drużyny.",
			"Dungeon » Slash3rss dołączył do drużyny.",
			"Dungeon » Twoja drużyna: Guardes, Slash3rss, KolegaodNetu",
			"Dungeon » KolegaodNetu został wyrzucony z drużyny.",
			"Dungeon » Opuszczono Dungeon poz. 54",
			"Dungeon » Opuszczono drużynę.")) {
			heard(line, me);
			out.append(leader == null ? "-" : leader).append(':').append(String.join(",", members)).append('/').append(String.join(",", invited)).append(partial ? "?" : "").append(';');
		}
		Minecraft mc = Minecraft.getInstance();
		SlashHud.config.placement("dungeonparty").enabled = true;
		sample(mc);
		out.append('|').append(together());
		return out.toString();
	}

	/** The party gone (after the test's screenshot). */
	public static void clearForTest() {
		clear();
	}
}
//#endif
