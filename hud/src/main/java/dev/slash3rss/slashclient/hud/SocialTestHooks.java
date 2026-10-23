package dev.slash3rss.slashclient.hud;

import dev.slash3rss.slashclient.hud.social.Groups;
import dev.slash3rss.slashclient.hud.social.Social;

import java.util.List;

/** For the in-game test of group chats and clans (GameGroupsClans): made-up data, no launcher. */
public final class SocialTestHooks {
	private SocialTestHooks() {}

	/** A friend, a group chat with three of them, and a clan with its chat, all made up. */
	public static void sample() {
		long now = System.currentTimeMillis();
		Social.sampleForTest(new Social.Friend("kumpel", "Kumpel", "kumpel", "online", "server", "skyup.pl", 0, now), List.of(), "me");
		Groups.sampleForTest("me");
	}

	/** Which group the friends window opens on (null: a friend's chat or none). */
	public static void viewGroup(String id) {
		Social.viewing = null;
		Groups.viewing = id;
	}

	/** Our own player in a clan with this tag (null: in none), its name shown above the head and written to the chat. */
	public static String ownClan(String tag) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		Badges.setClan(mc.player.getUUID(), tag);
		SlashHud.config.ownNametag = tag != null;
		var name = Badges.decorate(mc.player.getUUID(), mc.player.getName());
		if (tag != null) Compat.chat(mc).addClientSystemMessage(net.minecraft.network.chat.Component.literal("Klan: ").append(name));
		mc.options.setCameraType(tag != null ? net.minecraft.client.CameraType.THIRD_PERSON_FRONT : net.minecraft.client.CameraType.FIRST_PERSON);
		return name.getString();
	}

	/** The name above our head with clan tags switched on or off in the settings (and the setting back as it was). */
	public static String ownNameWithClanTags(boolean on) {
		var mc = net.minecraft.client.Minecraft.getInstance();
		boolean was = SlashHud.config.clanTags;
		SlashHud.config.clanTags = on;
		try {
			return Badges.decorate(mc.player.getUUID(), mc.player.getName()).getString();
		} finally {
			SlashHud.config.clanTags = was;
		}
	}

	/** What the layout audit found, one per line ("" when everything fits). */
	public static String problems() {
		return String.join("\n", dev.slash3rss.slashclient.hud.ui.Ui.PROBLEMS);
	}
}
