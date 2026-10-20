package dev.slash3rss.slashclient.hud.social;

import com.google.gson.JsonObject;

import java.util.List;

/**
 * For the in-game test of edited and deleted messages (GameChatEdits): a made-up friend and group
 * with such messages (no launcher), and the server's events as the launcher would pass them on.
 */
public final class ChatEditsTestHooks {
	private ChatEditsTestHooks() {}

	public static final String FRIEND = "kumpel";
	public static final long WINDOW = 15 * 60_000L;

	/** A conversation with an edited and a deleted message each way, ours recent enough to edit. */
	public static void sample() {
		long now = System.currentTimeMillis();
		var f = new Social.Friend(FRIEND, "Kumpel", "kumpel", "online", "launcher", "", 0, now);
		List<Social.Message> chat = List.of(
			msg(1, FRIEND, "me", "Siema! Wbijasz dziś na SkyUp?", now - 600_000, 0, false),
			msg(2, FRIEND, "me", "Mam nowy pomysł na wyspę, zobaczysz wieczorem", now - 500_000, now - 450_000, false),
			msg(3, FRIEND, "me", "", now - 400_000, 0, true),
			msg(4, "me", FRIEND, "Jasne, będę o 20!", now - 120_000, 0, false),
			msg(5, "me", FRIEND, "", now - 100_000, 0, true),
			msg(6, "me", FRIEND, "Weź ze sobą kilof i diamenty", now - 60_000, now - 30_000, false));
		Social.sampleForTest(f, chat, "me");
		Social.editWindowForTest(WINDOW);
	}

	private static Social.Message msg(long id, String from, String to, String text, long at, long editedAt, boolean deleted) {
		return new Social.Message(id, from, to, text, at, true, "", "", "", null, null, editedAt, deleted);
	}

	/** The made-up group chat (Groups.sampleForTest) with an edited and a deleted message; we own the group. */
	public static void sampleGroup() {
		Groups.sampleForTest("me");
		long now = System.currentTimeMillis();
		Groups.sampleChatForTest("ekipa", List.of(
			new Groups.Message(2, "ekipa", "ola", "Siema! Ktoś ma wolny wieczór?", now - 300_000, "", null),
			new Groups.Message(3, "ekipa", "kumpel", "Ja wbijam koło 20, sorki", now - 200_000, "", null, now - 150_000, false),
			new Groups.Message(6, "ekipa", "piotrek", "", now - 120_000, "", null, 0, true),
			new Groups.Message(7, "ekipa", "kumpel", "To usunie założyciel grupy", now - 90_000, "", null),
			new Groups.Message(4, "ekipa", "me", "No to jesteśmy umówieni", now - 30_000, "", null)));
		Groups.editRulesForTest("ekipa", WINDOW, "all");
	}

	/** A click straight on the screen, in GUI coordinates (the test's own mouse does not reach an unfocused window). */
	public static void click(net.minecraft.client.gui.screens.Screen screen, double x, double y, boolean right) {
		var e = new net.minecraft.client.input.MouseButtonEvent(x, y, new net.minecraft.client.input.MouseButtonInfo(right ? com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_RIGHT : com.mojang.blaze3d.platform.InputConstants.MOUSE_BUTTON_LEFT, 0));
		//#if MC >= 1.21.9
		screen.mouseClicked(e, false);
		//#else
		//$ screen.mouseClicked(e.x(), e.y(), e.button());
		//#endif
	}

	/** A key on the screen (Esc, Enter). */
	public static void key(net.minecraft.client.gui.screens.Screen screen, int key) {
		//#if MC >= 1.21.9
		screen.keyPressed(new net.minecraft.client.input.KeyEvent(key, 0, 0));
		//#else
		//$ screen.keyPressed(key, 0, 0);
		//#endif
	}

	/** A message as the server sends it in an event. */
	public static JsonObject message(long id, String from, String to, String group, String text, long at, long editedAt, boolean deleted) {
		JsonObject m = new JsonObject();
		m.addProperty("id", id);
		m.addProperty("from", from);
		if (group != null) m.addProperty("group", group);
		else m.addProperty("to", to);
		m.addProperty("text", text);
		m.addProperty("at", at);
		if (editedAt > 0) m.addProperty("editedAt", editedAt);
		if (deleted) m.addProperty("deleted", true);
		return m;
	}

	/** A 'message-edit' / 'message-delete' (or the group's) event as the launcher passes it on. */
	public static void event(String type, JsonObject message) throws Exception {
		JsonObject e = new JsonObject();
		e.addProperty("type", type);
		e.add("message", message);
		Social.eventForTest(e);
	}
}
