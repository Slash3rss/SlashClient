package dev.slash3rss.slashclient.hud.streams;

/** The tags shown before a name, the same for Twitch and Kick. */
public final class ChatBadges {
	private ChatBadges() {}

	public static final StreamChat.Badge HOST = new StreamChat.Badge("HOST", 0xE91916);
	public static final StreamChat.Badge MOD = new StreamChat.Badge("MOD", 0x00AD03);
	public static final StreamChat.Badge VIP = new StreamChat.Badge("VIP", 0xE005B9);
	public static final StreamChat.Badge SUB = new StreamChat.Badge("SUB", 0x9146FF);
	public static final StreamChat.Badge STAFF = new StreamChat.Badge("STAFF", 0xF59E0B);
	public static final StreamChat.Badge VERIFIED = new StreamChat.Badge("✔", 0x1E90FF);
	public static final StreamChat.Badge OG = new StreamChat.Badge("OG", 0x00C7FF);
}
