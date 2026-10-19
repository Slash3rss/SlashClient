package dev.slash3rss.slashclient.hud.streams;

/** One stream chat module's own settings (in config/slashclient-hud.json as "twitchChat" and "kickChat"). */
public final class StreamChatSettings {
	/** The channel's name, as typed (a link or "#name" work too). */
	public String channel = "";
	/** Kick only: the chat room's number typed by hand, for when Kick refuses the lookup (empty = look it up). */
	public String chatroomId = "";
	/** How many lines show at most (3–20) and how wide the module is (in GUI pixels). */
	public int lines = 8;
	public int width = 220;
	/** [MOD], [SUB], [VIP] before names. */
	public boolean badges = true;
	/** Names in the colours the viewers chose. */
	public boolean nameColors = true;
	/** Lines fade out after ten seconds, like the game's chat; off: they stay. */
	public boolean fade = true;

	/** For Gson, so missing fields keep the defaults above. */
	public StreamChatSettings() {}

	/** Values from a hand-edited file or an older version, kept in range. */
	public StreamChatSettings checked() {
		if (channel == null) channel = "";
		if (chatroomId == null) chatroomId = "";
		lines = Math.max(3, Math.min(20, lines));
		width = Math.max(120, Math.min(400, width));
		return this;
	}

	public StreamChatSettings copy() {
		StreamChatSettings s = new StreamChatSettings();
		s.channel = channel;
		s.chatroomId = chatroomId;
		s.lines = lines;
		s.width = width;
		s.badges = badges;
		s.nameColors = nameColors;
		s.fade = fade;
		return s.checked();
	}
}
