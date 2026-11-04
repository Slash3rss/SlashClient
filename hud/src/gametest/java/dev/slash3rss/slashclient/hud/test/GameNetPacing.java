package dev.slash3rss.slashclient.hud.test;

import dev.slash3rss.slashclient.hud.cosmetics.CosmeticsScreen;
import dev.slash3rss.slashclient.hud.players.Badges;
import dev.slash3rss.slashclient.hud.social.FriendPositions;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;

import java.util.List;
import java.util.UUID;

/**
 * How often the game asks SlashClient's server (it limits requests per home address): players already
 * known are asked about again in groups, a quick way back to the same server keeps the logos, our
 * position goes out only when we move (or now and then), and the cosmetics menu remembers its catalog.
 */
public class GameNetPacing implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		context.runOnClient(mc -> {
			lookups();
			rejoin();
			positions();
			catalog();
		});
	}

	private static void check(boolean ok, String what) {
		if (!ok) throw new AssertionError(what);
	}

	private static void lookups() {
		UUID fresh = UUID.fromString("00000000-0000-4000-8000-0000000000a1"), due = UUID.fromString("00000000-0000-4000-8000-0000000000a2"),
			soon = UUID.fromString("00000000-0000-4000-8000-0000000000a3"), later = UUID.fromString("00000000-0000-4000-8000-0000000000a4");
		long now = System.currentTimeMillis(), wait = 120_000;
		Badges.checkedAtForTest(fresh, 0);
		Badges.checkedAtForTest(due, now - 130_000);
		Badges.checkedAtForTest(soon, now - 100_000);
		Badges.checkedAtForTest(later, now - 10_000);
		Badges.clearRecheckGapForTest();
		// one due: it goes with the one due in 20 seconds, not with the one due in almost two minutes
		check(Badges.dueForTest(List.of(due, soon, later), now, wait).equals(List.of(due, soon)), "rechecks not batched");
		// right after, nothing again (at most one recheck request in 10 seconds)
		check(Badges.dueForTest(List.of(due, soon, later), now + 1_000, wait).isEmpty(), "rechecks not spaced");
		check(!Badges.dueForTest(List.of(due, soon, later), now + 11_000, wait).isEmpty(), "recheck never came");
		// a player never asked about goes at once, and takes the due ones along
		check(Badges.dueForTest(List.of(fresh, due, soon, later), now + 2_000, wait).equals(List.of(fresh, due, soon)), "new player not asked at once");
		// nobody due: nothing goes
		check(Badges.dueForTest(List.of(later), now, wait).isEmpty(), "asked too early");

		// the wait after an answer: changes coming live make it longer, a player without SlashClient gets a second look first
		check(Badges.recheckAfterForTest(due, false) == 120_000, "without live changes: 2 minutes");
		Badges.notSlashForTest(due, false);
		check(Badges.recheckAfterForTest(due, true) == 120_000, "a second quick look at a player without SlashClient");
		Badges.notSlashForTest(due, true);
		check(Badges.recheckAfterForTest(due, true) == 600_000, "players without SlashClient: 10 minutes");
		Badges.setSlash(due);
		check(Badges.recheckAfterForTest(due, true) == 300_000, "SlashClient players: 5 minutes");
		for (UUID id : List.of(fresh, due, soon, later)) Badges.checkedAtForTest(id, 0);
	}

	private static void rejoin() {
		UUID other = UUID.fromString("00000000-0000-4000-8000-0000000000b1");
		Badges.joined("play.example.com");
		Badges.setSlash(other);
		// a network's lobby to a game: the same address at once, the logos stay
		check(Badges.joined("Play.Example.com"), "same server not kept");
		check(Badges.knownFromServer(other), "logo lost on the same server");
		// back after more than a minute: forgotten
		Badges.leftForTest(61_000);
		check(!Badges.joined("play.example.com"), "kept after a minute away");
		check(!Badges.knownFromServer(other), "logo kept after a minute away");
		Badges.setSlash(other);
		check(!Badges.joined("other.example.com"), "another server kept");
		check(!Badges.knownFromServer(other), "logo kept on another server");
		Badges.setSlash(other);
		check(!Badges.joined(null), "a world kept the server's players");
		check(!Badges.knownFromServer(other), "logo kept in a world");
	}

	private static void positions() {
		String s = "play.example.com", ow = "minecraft:overworld";
		check(!FriendPositions.dueForTest(1_000, s, ow, 0, 64, 0, 0, 0, 64, 0, 0, s, ow), "standing still, sent after 1 s");
		check(!FriendPositions.dueForTest(3_000, s, ow, 0, 64, 0, 0, 0, 64, 0, 0, s, ow), "standing still, sent after 3 s");
		check(FriendPositions.dueForTest(5_100, s, ow, 0, 64, 0, 0, 0, 64, 0, 0, s, ow), "no keepalive after 5 s");
		check(FriendPositions.STILL_MS <= FriendPositions.STALE_MS - 3_000, "keepalive too close to the receivers' 8 s");
		check(FriendPositions.dueForTest(2_100, s, ow, 0, 64, 0, 0, 0.6, 64, 0, 0, s, ow), "moved, not sent");
		check(!FriendPositions.dueForTest(2_100, s, ow, 0, 64, 0, 0, 0.3, 64, 0, 0, s, ow), "barely moved, sent");
		check(!FriendPositions.dueForTest(1_000, s, ow, 0, 64, 0, 0, 5, 64, 0, 0, s, ow), "moved, sent before 2 s");
		check(FriendPositions.dueForTest(2_100, s, ow, 0, 64, 0, 0, 0, 64, 0, 15, s, ow), "turned, not sent");
		check(!FriendPositions.dueForTest(2_100, s, ow, 0, 64, 0, 359, 0, 64, 0, 3, s, ow), "a small turn over 0° sent");
		check(FriendPositions.dueForTest(100, s, ow, 0, 64, 0, 0, 0, 64, 0, 0, s, "minecraft:the_nether"), "another dimension not sent at once");
		check(FriendPositions.dueForTest(100, s, ow, 0, 64, 0, 0, 0, 64, 0, 0, "other.example.com", ow), "another server not sent at once");
		check(FriendPositions.refusedForTest("HTTP 502 {\"error\":\"not_on_server\",\"status\":409}"), "409 not seen");
		check(FriendPositions.refusedForTest("HTTP 502 {\"error\":\"rate_limited\",\"status\":429}"), "429 not seen");
		check(!FriendPositions.refusedForTest("HTTP 502 {\"error\":\"not_sharing\",\"status\":403}"), "not_sharing taken for a refusal");
	}

	private static void catalog() {
		CosmeticsScreen.catalogChanged();
		check(!CosmeticsScreen.catalogCachedForTest(), "catalog remembered after a change");
		CosmeticsScreen.rememberForTest(new com.google.gson.JsonObject());
		check(CosmeticsScreen.catalogCachedForTest(), "catalog not remembered");
		CosmeticsScreen.catalogChanged();
		check(!CosmeticsScreen.catalogCachedForTest(), "catalog kept after a purchase or a change");
	}
}
