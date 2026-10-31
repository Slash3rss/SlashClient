// only the client gametests call these, and their API came in 1.21.4
//#if MC >= 1.21.4
package dev.slash3rss.slashclient.hud.testing;

import dev.slash3rss.slashclient.hud.config.HudConfig;
import dev.slash3rss.slashclient.hud.SlashHud;
import dev.slash3rss.slashclient.hud.modules.StreamChatModule;

import dev.slash3rss.slashclient.hud.streams.KickChat;
import dev.slash3rss.slashclient.hud.streams.StreamChat;
import dev.slash3rss.slashclient.hud.streams.TwitchChat;

import java.util.ArrayList;
import java.util.List;

/**
 * The stream chat modules for the in-game test (src/gametest GameStreamChat): the parsers tried
 * on raw IRC lines and Pusher frames as Twitch and Kick send them, and the modules filled the
 * same way, with no network at all.
 */
public final class StreamChatTestHooks {
	private StreamChatTestHooks() {}

	private static final StreamChat.Target TWITCH = new StreamChat.Target("slash3rss", ""), KICK = new StreamChat.Target("slash3rss", "668");

	/** Kick's frames: Pusher's JSON with the event's data as a JSON string inside. */
	static String kickMessage(String id, String user, String color, String badges, String content) {
		String data = "{\"id\":\"" + id + "\",\"chatroom_id\":668,\"content\":\"" + content + "\",\"type\":\"message\",\"created_at\":\"2026-10-19T19:02:47+00:00\","
			+ "\"sender\":{\"id\":1,\"username\":\"" + user + "\",\"slug\":\"" + user.toLowerCase() + "\",\"identity\":{\"color\":\"" + color + "\",\"badges\":[" + badges + "],"
			+ "\"badges_v2\":[{\"name\":\"level\",\"badge_type\":\"global\",\"metadata\":{\"level\":29},\"selected\":true,\"sort_order\":1}]}},\"metadata\":{\"message_ref\":\"1\"}}";
		return "{\"event\":\"App\\\\Events\\\\ChatMessageEvent\",\"data\":" + new com.google.gson.JsonPrimitive(data) + ",\"channel\":\"chatrooms.668.v2\"}";
	}

	static String badge(String type) {
		return "{\"type\":\"" + type + "\",\"text\":\"" + type + "\"}";
	}

	static String twitchMessage(String id, String login, String name, String color, String badges, String text) {
		return "@badge-info=;badges=" + badges + ";client-nonce=x;color=" + color + ";display-name=" + name + ";emotes=;first-msg=0;flags=;id=" + id
			+ ";mod=0;returning-chatter=0;room-id=1;subscriber=0;tmi-sent-ts=1760900000000;turbo=0;user-id=2;user-type= :" + login + "!" + login + "@" + login
			+ ".tmi.twitch.tv PRIVMSG #slash3rss :" + text;
	}

	/** "ok", or what came out wrong. */
	public static String parsers() {
		List<String> bad = new ArrayList<>();
		StreamChat.offline(true);
		// the channel as typed
		expect(bad, StreamChat.channelName("https://www.twitch.tv/Slash3rss?sr=a", false), "slash3rss");
		expect(bad, StreamChat.channelName("#Foo_Bar ", false), "foo_bar");
		expect(bad, StreamChat.channelName("https://kick.com/some-user/videos", true), "some-user");
		expect(bad, StreamChat.channelName("@x-y", false), "xy");

		// Twitch: tags, escapes, /me, badges and colours
		var irc = TwitchChat.Irc.parse("@badge-info=subscriber/12;badges=moderator/1,subscriber/12,glhf-pledge/1;color=#1E90FF;display-name=Moderator_PL;emotes=25:0-4;id=m-1;"
			+ "system-msg=a\\sb\\:c\\\\d :moderator_pl!moderator_pl@moderator_pl.tmi.twitch.tv PRIVMSG #slash3rss :Kappa witam czat :)");
		expect(bad, irc.tags.get("system-msg"), "a b;c\\d");
		StreamChat.Line l = TwitchChat.line(irc);
		expect(bad, l.user() + "|" + l.login() + "|" + Integer.toHexString(l.color()) + "|" + labels(l) + "|" + l.text() + "|" + l.id(), "Moderator_PL|moderator_pl|1e90ff|MOD SUB|Kappa witam czat :)|m-1");
		l = TwitchChat.line(TwitchChat.Irc.parse(":viewer!viewer@viewer.tmi.twitch.tv PRIVMSG #slash3rss :\u0001ACTION macha\u0001"));
		expect(bad, l.user() + "|" + l.color() + "|" + l.action() + "|" + l.text() + "|" + labels(l), "viewer|-1|true|macha|");
		var ping = TwitchChat.Irc.parse("PING :tmi.twitch.tv");
		expect(bad, ping.command + "|" + ping.trailing, "PING|tmi.twitch.tv");
		var clear = TwitchChat.Irc.parse("@ban-duration=600;room-id=1;target-user-id=3;tmi-sent-ts=1 :tmi.twitch.tv CLEARCHAT #slash3rss :spammer");
		expect(bad, clear.command + "|" + clear.params + "|" + clear.trailing, "CLEARCHAT|[#slash3rss]|spammer");

		// Twitch: the whole way, frames of several lines; deleted messages and a banned user's go away
		TwitchChat tw = TwitchChat.INSTANCE;
		tw.want(null);
		tw.want(TWITCH);
		tw.receive(":tmi.twitch.tv 001 justinfan123 :Welcome, GLHF!\r\n:justinfan123!justinfan123@justinfan123.tmi.twitch.tv JOIN #slash3rss\r\n"
			+ "@emote-only=0;room-id=1 :tmi.twitch.tv ROOMSTATE #slash3rss\r\n");
		expect(bad, tw.state() + "", "LIVE");
		tw.receive(twitchMessage("a", "anna", "Anna", "#FF0000", "", "pierwsza") + "\r\n" + twitchMessage("b", "spammer", "Spammer", "", "", "kup tanio")
			+ "\r\n" + twitchMessage("c", "bob", "Bob", "#00FF00", "vip/1", "druga") + "\r\n" + twitchMessage("d", "spammer", "Spammer", "", "", "jeszcze raz") + "\r\n");
		tw.receive("@login=bob;room-id=;target-msg-id=c;tmi-sent-ts=1 :tmi.twitch.tv CLEARMSG #slash3rss :druga\r\n");
		tw.receive("@ban-duration=600;room-id=1;target-user-id=3;tmi-sent-ts=1 :tmi.twitch.tv CLEARCHAT #slash3rss :spammer\r\n");
		expect(bad, texts(tw), "pierwsza");
		tw.receive("@room-id=1;tmi-sent-ts=1 :tmi.twitch.tv CLEARCHAT #slash3rss\r\n");
		expect(bad, texts(tw), "");
		expect(bad, tw.receive("@msg-id=msg_channel_suspended :tmi.twitch.tv NOTICE #slash3rss :This channel does not exist or has been suspended."), "twitch.suspended");

		// Kick: emotes as text, the double-encoded data, badges from both lists, deletions, bans and errors
		expect(bad, KickChat.emotes("[emote:37226:KEKW] hej [emote:1:Pog][emote:2:a$b]"), ":KEKW: hej :Pog::a$b:");
		KickChat kick = KickChat.INSTANCE;
		kick.want(null);
		kick.want(KICK);
		kick.receive("{\"event\":\"pusher:connection_established\",\"data\":\"{\\\"socket_id\\\":\\\"1.2\\\",\\\"activity_timeout\\\":120}\"}");
		kick.receive("{\"event\":\"pusher_internal:subscription_succeeded\",\"data\":\"{}\",\"channel\":\"chatrooms.668.v2\"}");
		expect(bad, kick.state() + "", "LIVE");
		kick.receive(kickMessage("k1", "Suhib99", "#4CFF75", badge("moderator") + "," + badge("subscriber"), "dobry stream [emote:5747996:GoldenKEKW]"));
		kick.receive(kickMessage("k2", "Troll", "#FFFFFF", "", "usuń mnie"));
		kick.receive(kickMessage("k3", "Troll", "#FFFFFF", badge("og"), "i mnie"));
		kick.receive(kickMessage("k4", "Ola", "#E9113C", badge("vip"), "\\\"cytat\\\" i ąę"));
		kick.receive("{\"event\":\"App\\\\Events\\\\MessageDeletedEvent\",\"data\":\"{\\\"id\\\":\\\"x\\\",\\\"message\\\":{\\\"id\\\":\\\"k2\\\"},\\\"aiModerated\\\":false}\",\"channel\":\"chatrooms.668.v2\"}");
		kick.receive("{\"event\":\"App\\\\Events\\\\UserBannedEvent\",\"data\":\"{\\\"id\\\":\\\"y\\\",\\\"user\\\":{\\\"id\\\":5,\\\"username\\\":\\\"Troll\\\",\\\"slug\\\":\\\"troll\\\"},\\\"banned_by\\\":{\\\"id\\\":1,\\\"username\\\":\\\"Mod\\\"}}\",\"channel\":\"chatrooms.668.v2\"}");
		expect(bad, texts(kick), "dobry stream :GoldenKEKW:/\"cytat\" i ąę");
		List<StreamChat.Line> k = kick.newest(5);
		expect(bad, k.isEmpty() ? "" : k.get(0).user() + "|" + Integer.toHexString(k.get(0).color()) + "|" + labels(k.get(0)), "Suhib99|4cff75|MOD SUB");
		kick.receive("{\"event\":\"pusher:ping\",\"data\":{}}");
		expect(bad, kick.receive("{\"event\":\"pusher:error\",\"data\":{\"code\":4001,\"message\":\"App key x not in this cluster.\"}}"), "kick.pusher");
		expect(bad, kick.receive("{\"event\":\"pusher:error\",\"data\":{\"code\":4201,\"message\":\"Pong reply not received\"}}"), "");

		// the fade: full for nine seconds, gone after ten
		expect(bad, StreamChatModule.alpha(0) + "|" + (StreamChatModule.alpha(9500) < 1 && StreamChatModule.alpha(9500) > 0) + "|" + StreamChatModule.alpha(10_001), "1.0|true|0.0");
		// a dark name made readable on the dark background, a light one kept
		expect(bad, Integer.toHexString(StreamChatModule.readable(0xFFFFFF)) + "|" + (StreamChatModule.readable(0x0000FF) != 0x0000FF), "ffffff|true");
		tw.want(null);
		kick.want(null);
		return bad.isEmpty() ? "ok" : String.join("\n", bad);
	}

	private static void expect(List<String> bad, Object got, Object wanted) {
		if (!String.valueOf(wanted).equals(String.valueOf(got))) bad.add("expected <" + wanted + "> got <" + got + ">");
	}

	private static String labels(StreamChat.Line l) {
		StringBuilder out = new StringBuilder();
		for (StreamChat.Badge b : l.badges()) out.append(out.length() > 0 ? " " : "").append(b.label());
		return out.toString();
	}

	private static String texts(StreamChat chat) {
		StringBuilder out = new StringBuilder();
		for (StreamChat.Line l : chat.newest(50)) out.append(out.length() > 0 ? "/" : "").append(l.text());
		return out.toString();
	}

	/** Both modules on and filled with a stream's worth of chat (no network), fading or not. */
	public static void fill(boolean fade) {
		StreamChat.offline(true);
		HudConfig cfg = SlashHud.config;
		cfg.twitchChat.channel = "slash3rss";
		cfg.kickChat.channel = "slash3rss";
		cfg.kickChat.chatroomId = "668";
		cfg.twitchChat.fade = cfg.kickChat.fade = fade;
		cfg.twitchChat.lines = 12;
		cfg.kickChat.lines = 10;
		cfg.placement("twitchchat").enabled = true;
		cfg.placement("kickchat").enabled = true;
		TwitchChat tw = TwitchChat.INSTANCE;
		tw.want(null);
		tw.want(TWITCH);
		String[][] twitch = {
			{ "slash3rss", "Slash3rss", "#60A5FA", "broadcaster/1", "Witajcie na streamie! Dzisiaj budujemy bazę na SkyUp" },
			{ "moderator_pl", "Moderator_PL", "#00AD03", "moderator/1,subscriber/24", "Pamiętajcie o regulaminie czatu" },
			{ "kasia_gra", "Kasia_gra", "#FF69B4", "subscriber/3", "ten build jest świetny PogChamp" },
			{ "spammer", "Spammer", "#888888", "", "KUP TANIO ZŁOTO" },
			{ "gracz_pl", "Gracz_PL", "#9146FF", "vip/1", "gg" },
			{ "nowy_widz", "nowy_widz", "", "", "na jakim serwerze grasz?" },
			{ "piotrek", "Piotrek", "#1E3A8A", "subscriber/1", "LUL LUL LUL" },
		};
		StringBuilder frame = new StringBuilder();
		for (int i = 0; i < twitch.length; i++) frame.append(twitchMessage("t" + i, twitch[i][0], twitch[i][1], twitch[i][2], twitch[i][3], twitch[i][4])).append("\r\n");
		frame.append(":nowy_widz!nowy_widz@nowy_widz.tmi.twitch.tv PRIVMSG #slash3rss :\u0001ACTION macha do wszystkich\u0001\r\n");
		tw.receive(frame.toString());
		// a moderator takes the spam away
		tw.receive("@login=spammer;room-id=;target-msg-id=t3;tmi-sent-ts=1 :tmi.twitch.tv CLEARMSG #slash3rss :KUP TANIO ZŁOTO\r\n");

		KickChat kick = KickChat.INSTANCE;
		kick.want(null);
		kick.want(KICK);
		kick.receive(kickMessage("k1", "Slash3rss", "#60A5FA", badge("broadcaster"), "Siema Kick! [emote:37226:KEKW]"));
		kick.receive(kickMessage("k2", "Suhib99", "#4CFF75", badge("moderator") + "," + badge("subscriber"), "dobry stream [emote:5747996:GoldenKEKW]"));
		kick.receive(kickMessage("k3", "Troll", "#FFFFFF", "", "usuń mnie"));
		kick.receive(kickMessage("k4", "Ola", "#E9113C", badge("vip"), "a gdzie jest farma?"));
		kick.receive(kickMessage("k5", "OG_Widz", "#00C7FF", badge("og") + "," + badge("verified"), "[emote:1:Clap] [emote:1:Clap]"));
		kick.receive(kickMessage("k6", "Marek", "#6F87FF", badge("subscriber"), "długa wiadomość, która na pewno nie zmieści się w jednej linii modułu i zawinie się do następnej"));
		kick.receive("{\"event\":\"App\\\\Events\\\\MessageDeletedEvent\",\"data\":\"{\\\"id\\\":\\\"x\\\",\\\"message\\\":{\\\"id\\\":\\\"k3\\\"}}\",\"channel\":\"chatrooms.668.v2\"}");
	}

	/** Both modules' lines taken away (the editor then shows its made-up ones). */
	public static void empty() {
		TwitchChat.INSTANCE.want(null);
		TwitchChat.INSTANCE.want(TWITCH);
		KickChat.INSTANCE.want(null);
		KickChat.INSTANCE.want(KICK);
	}

	/** What a module shows now, one row per line. */
	public static String shown(String id) {
		return (id.equals("kickchat") ? StreamChatModule.KICK : StreamChatModule.TWITCH).shownText(net.minecraft.client.Minecraft.getInstance());
	}

	/** A module's channel typed in (empty: none), as the settings' text field does. */
	public static void channel(String id, String channel) {
		(id.equals("kickchat") ? SlashHud.config.kickChat : SlashHud.config.twitchChat).channel = channel;
	}

	/** Both modules off again and back to their defaults, and the network allowed. */
	public static void reset() {
		SlashHud.config.placement("twitchchat").enabled = false;
		SlashHud.config.placement("kickchat").enabled = false;
		SlashHud.config.twitchChat = new dev.slash3rss.slashclient.hud.streams.StreamChatSettings();
		SlashHud.config.kickChat = new dev.slash3rss.slashclient.hud.streams.StreamChatSettings();
		TwitchChat.INSTANCE.want(null);
		KickChat.INSTANCE.want(null);
		StreamChat.offline(false);
	}
}
//#endif
