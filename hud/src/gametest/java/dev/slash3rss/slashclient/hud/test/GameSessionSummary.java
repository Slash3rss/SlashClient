package dev.slash3rss.slashclient.hud.test;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.slash3rss.slashclient.hud.SessionStats;
import dev.slash3rss.slashclient.hud.TestHooks;
import dev.slash3rss.slashclient.hud.WorldAidsTestHooks;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * The session summary for the launcher: a bit of play (a block placed and mined, a few steps, a
 * zombie killed, one death, a screenshot) shows up in config/slashclient-session.json.
 */
public class GameSessionSummary implements FabricClientGameTest {
	@Override
	public void runTest(ClientGameTestContext context) {
		if (TestFilter.skip(context, getClass())) return;
		try (TestSingleplayerContext world = context.worldBuilder().create()) {
			var server = world.getServer();
			context.waitTicks(40);
			JsonObject before = read(context);
			server.runCommand("fill -4 99 -4 4 99 4 stone");
			server.runCommand("fill -4 100 -4 4 103 4 air");
			server.runCommand("tp @a 0 100 0 180 30");
			server.runCommand("item replace entity @a weapon.mainhand with stone 8");
			context.waitTicks(30);

			// a block placed on the floor in front, then mined again (the client's own actions)
			context.runOnClient(mc -> {
				BlockPos floor = new BlockPos(0, 99, -2);
				mc.gameMode.useItemOn(mc.player, InteractionHand.MAIN_HAND, new BlockHitResult(Vec3.atCenterOf(floor).add(0, 0.5, 0), Direction.UP, floor, false));
			});
			context.waitTicks(5);
			context.runOnClient(mc -> mc.gameMode.destroyBlock(new BlockPos(0, 100, -2)));
			context.waitTicks(5);

			// a few steps along the floor
			for (int i = 0; i < 10; i++) {
				context.runOnClient(mc -> mc.player.setPos(mc.player.getX() + 0.3, mc.player.getY(), mc.player.getZ()));
				context.waitTick();
			}

			// a zombie with one heart left, hit once
			server.runCommand("summon zombie 0 100 -2 {NoAI:1b,Health:1f}");
			context.waitTicks(10);
			// the zombie itself (a pet from an earlier test may stand nearer)
			boolean hitZombie = context.computeOnClient(mc -> {
				for (var e : mc.level.entitiesForRendering()) {
					if (net.minecraft.world.entity.EntityType.getKey(e.getType()).getPath().equals("zombie")) {
						mc.gameMode.attack(mc.player, e);
						return true;
					}
				}
				return false;
			});
			if (!hitZombie) throw new AssertionError("No zombie to hit");
			context.waitTicks(30);

			// one death, then back
			server.runCommand("kill @a");
			context.waitTicks(20);
			context.runOnClient(mc -> WorldAidsTestHooks.respawn());
			context.waitTicks(30);

			// a screenshot (its count comes after the file is saved)
			context.runOnClient(mc -> TestHooks.screenshot());
			context.waitTicks(40);

			JsonObject s = read(context);
			System.out.println("SlashClient test: session summary " + s);
			if (s.get("v").getAsInt() != 1 || s.get("closed").getAsBoolean()) throw new AssertionError("Wrong summary header: " + s);
			if (s.get("playMs").getAsLong() <= before.get("playMs").getAsLong()) throw new AssertionError("No play time counted: " + s);
			if (delta(s, before, "blocks", "placed") < 1) throw new AssertionError("The placed block was not counted: " + s.get("blocks"));
			if (delta(s, before, "blocks", "mined") < 1) throw new AssertionError("The mined block was not counted: " + s.get("blocks"));
			if (delta(s, before, "kills", "mobs") < 1) throw new AssertionError("The zombie kill was not counted: " + s.get("kills"));
			if (s.get("deaths").getAsInt() - before.get("deaths").getAsInt() != 1) throw new AssertionError("Deaths: " + s.get("deaths") + " (before " + before.get("deaths") + ")");
			if (s.get("screenshots").getAsInt() - before.get("screenshots").getAsInt() != 1) throw new AssertionError("Screenshots: " + s.get("screenshots"));
			JsonObject d = s.getAsJsonObject("distance");
			double moved = d.get("walk").getAsDouble() + d.get("sprint").getAsDouble() + d.get("fly").getAsDouble();
			if (moved < 2) throw new AssertionError("Too little distance: " + d);
			if (s.getAsJsonObject("damage").get("taken").getAsDouble() <= 0) throw new AssertionError("No damage taken counted: " + s.get("damage"));
			if (s.getAsJsonObject("fps").get("frames").getAsLong() < 10 || s.getAsJsonObject("fps").get("avg").getAsLong() <= 0) throw new AssertionError("No FPS: " + s.get("fps"));
			var places = s.getAsJsonArray("places");
			if (places.isEmpty() || !places.get(0).getAsJsonObject().get("kind").getAsString().equals("world") || places.get(0).getAsJsonObject().get("ms").getAsLong() <= 0)
				throw new AssertionError("The world is not among the places: " + places);
			context.takeScreenshot("session-summary-play");
		}
		// leaving the world writes the file at once
		context.waitTicks(5);
		JsonObject after = read(context);
		if (after.get("startedAt").getAsLong() <= 0) throw new AssertionError("No start time: " + after);
	}

	private static JsonObject read(ClientGameTestContext context) {
		String text = context.computeOnClient(mc -> SessionStats.saveForTest());
		return JsonParser.parseString(text).getAsJsonObject();
	}

	private static int delta(JsonObject now, JsonObject before, String group, String key) {
		return now.getAsJsonObject(group).get(key).getAsInt() - before.getAsJsonObject(group).get(key).getAsInt();
	}
}
