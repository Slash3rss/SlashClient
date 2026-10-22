package dev.slash3rss.slashclient.hud;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.rendertype.RenderTypes;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.ChestType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.VoxelShape;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * SkyUp's dungeon loot outlined in the world: the chests, barrels, pots, flower pots and ores
 * DungeonRooms knows of and that were not taken yet, each kind in its own colour, with a soft fill
 * and faint pulsing when wanted. Only in a dungeon (DungeonMap.active), only what DungeonRooms has
 * already found (no scanning of its own), a double chest as one box. Taken loot goes at once: what
 * was opened or broken is left out, and so is a block that is no longer there (before the map's
 * next scan notices). Items lying on the ground in the dungeon (mob drops, what was thrown) glow
 * the game's own way (the outline of the item, seen through walls), each in a colour that suits it
 * (dropColor below), or all in one colour. Each tick the boxes are made anew; each frame they are drawn as one batch of
 * flat quads (thin boxes along the edges), with the depth test, or through walls when switched on.
 */
public final class LootHighlight {
	private LootHighlight() {}

	/** The colours offered for each kind: yellow, orange, purple, green, aqua, blue, red, white, pink. */
	public static final int[] COLORS = { 0xFFFACC15, 0xFFFB923C, 0xFFA855F7, 0xFF4ADE80, 0xFF55FFFF, 0xFF60A5FA, 0xFFF87171, 0xFFFFFFFF, 0xFFFF55FF };
	public static final int MIN_RANGE = 8, MAX_RANGE = 64;
	/** A white texture: the text render types want one, the colour comes from the vertices. */
	private static final Identifier TEXTURE = Identifier.fromNamespaceAndPath(SlashHud.ID, "textures/misc/white.png");
	/** Full brightness for the lightmap: as bright in a dark dungeon as in the day. */
	private static final int FULL_BRIGHT = 0xF000F0;
	/** The fill stands this far out of the block, so it does not flicker with the block's faces. */
	private static final double OUT = 0.004;

	/** The kind after DungeonRooms.LOOT's: an item lying on the ground. */
	public static final int DROP = DungeonRooms.LOOT.length;
	/** How many kinds there are: the loot's and the dropped items. */
	public static final int KINDS = DROP + 1;

	/** One piece of loot's box in the world and its kind (an index of DungeonRooms.LOOT, or DROP). */
	public record Box(double x0, double y0, double z0, double x1, double y1, double z1, int cat) {}

	private static List<Box> boxes = List.of();
	/** The items glowing now: entity id → colour (0xRRGGBB). */
	private static Map<Integer, Integer> glowing = Map.of();

	static HudConfig cfg() {
		return SlashHud.config;
	}

	/** The boxes drawn now (for the test). */
	public static List<Box> boxes() {
		return boxes;
	}

	/** The items glowing now (for the test): entity id → colour. */
	public static Map<Integer, Integer> glowing() {
		return glowing;
	}

	/** The glow colour of an item on the ground (0xRRGGBB), or -1 when it does not glow (DropGlowMixin). */
	public static int glowColor(net.minecraft.world.entity.Entity entity) {
		if (glowing.isEmpty() || !(entity instanceof ItemEntity)) return -1;
		Integer c = glowing.get(entity.getId());
		return c == null ? -1 : c;
	}

	/**
	 * The colour of a dropped item. The server's own items (mystic cobblestone and ore, and whatever it
	 * adds later) glow in their name's colour; plain Minecraft items, whose names have none, in a colour
	 * like their texture (what drops in SkyUp's dungeons, skyup.pl/wiki/dungeony); anything else in
	 * the general drop colour from the settings.
	 */
	static int dropColor(net.minecraft.world.item.ItemStack stack, int general) {
		int named = nameColor(stack.getHoverName());
		if (named >= 0) return named;
		String id = net.minecraft.core.registries.BuiltInRegistries.ITEM.getKey(stack.getItem()).getPath();
		if (id.endsWith("_pottery_sherd")) return 0xD9825B;
		if (id.endsWith("_armor_trim_smithing_template")) return 0x5EEAD4;
		return switch (id) {
			case "coal", "coal_ore", "deepslate_coal_ore", "coal_block" -> 0x8A8F98;
			case "raw_iron", "iron_ingot", "iron_nugget", "iron_ore", "deepslate_iron_ore", "iron_block" -> 0xE3C6AE;
			case "redstone", "redstone_ore", "deepslate_redstone_ore", "redstone_block" -> 0xFF3B30;
			case "lapis_lazuli", "lapis_ore", "deepslate_lapis_ore", "lapis_block" -> 0x3B6CFF;
			case "raw_gold", "gold_ingot", "gold_nugget", "gold_ore", "deepslate_gold_ore", "gold_block" -> 0xFFD43B;
			case "diamond", "diamond_ore", "deepslate_diamond_ore", "diamond_block" -> 0x4DEEEA;
			case "emerald", "emerald_ore", "deepslate_emerald_ore", "emerald_block" -> 0x22E06B;
			case "netherite_scrap", "ancient_debris", "netherite_ingot" -> 0xA0705F;
			case "cobblestone", "cobbled_deepslate" -> 0xC084FC;
			case "bone", "bone_meal" -> 0xF1EAD8;
			case "string" -> 0xFFFFFF;
			case "spider_eye", "fermented_spider_eye" -> 0xE0304E;
			case "ghast_tear" -> 0xCFF3FF;
			case "breeze_rod", "wind_charge" -> 0x9FB4FF;
			case "blaze_powder", "blaze_rod" -> 0xFF9F1C;
			case "heavy_core" -> 0x9CA3AF;
			case "totem_of_undying" -> 0xFDE047;
			default -> general;
		};
	}

	/** The first colour a name is written in (a gradient: where it starts), or -1 when plain or white. */
	static int nameColor(net.minecraft.network.chat.Component name) {
		java.util.Optional<Integer> first = name.visit((style, text) -> {
			if (text.isBlank() || style.getColor() == null) return java.util.Optional.empty();
			int rgb = style.getColor().getValue() & 0xFFFFFF;
			// white is the plain colour of a name, not a colour of its own
			return rgb == 0xFFFFFF ? java.util.Optional.empty() : java.util.Optional.of(rgb);
		}, net.minecraft.network.chat.Style.EMPTY);
		return first.orElse(-1);
	}

	public static void register() {
		//#if MC >= 26.1
		net.fabricmc.fabric.api.client.rendering.v1.level.LevelRenderEvents.COLLECT_SUBMITS.register(ctx -> submit(ctx.poseStack(), ctx.submitNodeCollector()));
		//#elif MC >= 1.21.9
		//$ net.fabricmc.fabric.api.client.rendering.v1.world.WorldRenderEvents.BEFORE_DEBUG_RENDER.register(ctx -> draw(ctx.matrices(), ctx.consumers()));
		//#else
		//$ // after the block entities too: the fill writes depth, a chest drawn after it would be hidden behind it
		//$ net.fabricmc.fabric.api.client.rendering.v1.WorldRenderEvents.BEFORE_DEBUG_RENDER.register(ctx -> draw(ctx.matrixStack(), ctx.consumers()));
		//#endif
	}

	/** Whether a kind of loot is outlined (its own switch, not the map's). */
	static boolean shown(int cat) {
		HudConfig c = cfg();
		return switch (cat) {
			case 0 -> c.lootChests;
			case 1 -> c.lootBarrels;
			case 2 -> c.lootPots;
			case 3 -> c.lootFlowerPots;
			case 4 -> c.lootOres;
			default -> c.lootDrops;
		};
	}

	static int color(int cat) {
		HudConfig c = cfg();
		return switch (cat) {
			case 0 -> c.lootChestColor;
			case 1 -> c.lootBarrelColor;
			case 2 -> c.lootPotColor;
			case 3 -> c.lootFlowerPotColor;
			case 4 -> c.lootOreColor;
			default -> c.lootDropColor;
		};
	}

	static void tick(Minecraft mc) {
		HudConfig c = cfg();
		if (c == null || !c.lootHighlight || mc.level == null || mc.player == null || !DungeonMap.active()) {
			boxes = List.of();
			glowing = Map.of();
			return;
		}
		int range = Math.max(MIN_RANGE, Math.min(MAX_RANGE, c.lootHighlightRange));
		boxes = collect(mc.level, mc.player.getX(), mc.player.getEyeY(), mc.player.getZ(), c.lootHighlightLimit ? range : -1);
		glowing = shown(DROP) ? drops(mc.level, mc.player.getX(), mc.player.getEyeY(), mc.player.getZ(), c.lootHighlightLimit ? range : -1) : Map.of();
	}

	/** The boxes of the loot not taken within `range` blocks of a point (-1: any distance). */
	static List<Box> collect(Level level, double px, double py, double pz, int range) {
		List<Box> out = new ArrayList<>();
		BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
		double r2 = (double) range * range;
		DungeonRooms.untaken((x, y, z, cat) -> {
			if (!shown(cat)) return;
			double dx = x + 0.5 - px, dy = y + 0.5 - py, dz = z + 0.5 - pz;
			if (range >= 0 && dx * dx + dy * dy + dz * dz > r2) return;
			if (!level.hasChunkAt(pos.set(x, y, z))) return;
			BlockState state = level.getBlockState(pos);
			// broken since the map's last scan: gone already
			if (DungeonRooms.kind(state.getBlock()) != cat) return;
			AABB box = shape(level, pos, state);
			// a double chest: both halves in one box
			if (state.getBlock() instanceof ChestBlock && state.hasProperty(ChestBlock.TYPE) && state.getValue(ChestBlock.TYPE) != ChestType.SINGLE) {
				BlockPos other = pos.relative(ChestBlock.getConnectedDirection(state));
				BlockState otherState = level.getBlockState(other);
				if (otherState.getBlock() instanceof ChestBlock) box = box.minmax(shape(level, other, otherState));
			}
			out.add(new Box(box.minX, box.minY, box.minZ, box.maxX, box.maxY, box.maxZ, cat));
		});
		return out;
	}

	/** Items on the ground within `range` (-1: as far as the largest range) and the colour each glows in. */
	static Map<Integer, Integer> drops(Level level, double px, double py, double pz, int range) {
		Map<Integer, Integer> out = new HashMap<>();
		HudConfig c = cfg();
		int general = c.lootDropColor & 0xFFFFFF;
		int reach = range >= 0 ? range : MAX_RANGE;
		double r2 = (double) reach * reach;
		AABB around = new AABB(px - reach, py - reach, pz - reach, px + reach, py + reach, pz + reach);
		for (ItemEntity item : level.getEntitiesOfClass(ItemEntity.class, around, e -> e.isAlive() && !e.getItem().isEmpty())) {
			double x = item.getX(), y = item.getY(), z = item.getZ();
			double dx = x - px, dy = y - py, dz = z - pz;
			if (dx * dx + dy * dy + dz * dz > r2) continue;
			out.put(item.getId(), c.lootDropItemColors ? dropColor(item.getItem(), general) : general);
		}
		return out;
	}

	/** A block's outline in the world, or the whole block when it has none. */
	private static AABB shape(Level level, BlockPos pos, BlockState state) {
		VoxelShape shape = state.getShape(level, pos);
		AABB b = shape.isEmpty() ? new AABB(0, 0, 0, 1, 1, 1) : shape.bounds();
		return b.move(pos.getX(), pos.getY(), pos.getZ());
	}

	//#if MC >= 26.1
	private static void submit(PoseStack pose, net.minecraft.client.renderer.SubmitNodeCollector out) {
		List<Box> list = boxes;
		if (list.isEmpty()) return;
		var camera = Compat.camera(Minecraft.getInstance());
		Vec3 cam = camera.position();
		if (pose == null) pose = new PoseStack();
		out.submitCustomGeometry(pose, type(), (p, vc) -> emit(p, vc, list, cam));
	}
	//#else
	//$ private static void draw(PoseStack pose, net.minecraft.client.renderer.MultiBufferSource buffers) {
	//$ 	List<Box> list = boxes;
	//$ 	if (list.isEmpty() || buffers == null) return;
	//$ 	var camera = Compat.camera(Minecraft.getInstance());
	//$ 	Vec3 cam = camera.position();
	//$ 	if (pose == null) pose = new PoseStack();
	//$ 	var type = type();
	//$ 	emit(pose.last(), buffers.getBuffer(type), list, cam);
	//$ 	// drawn now: later the buffers may already have been drawn for this frame
	//$ 	if (buffers instanceof net.minecraft.client.renderer.MultiBufferSource.BufferSource source) source.endBatch(type);
	//$ }
	//#endif

	/** Translucent quads with a white texture: through walls without the depth test, else with it. */
	private static net.minecraft.client.renderer.rendertype.RenderType type() {
		return cfg().lootHighlightWalls ? RenderTypes.textSeeThrough(TEXTURE) : RenderTypes.text(TEXTURE);
	}

	/** Every box: its soft fill (when on), then its twelve edges as thin boxes, a little thicker further off. */
	private static void emit(PoseStack.Pose p, VertexConsumer vc, List<Box> list, Vec3 cam) {
		HudConfig c = cfg();
		// faint pulsing: between two thirds and full strength, once in 1.6 seconds
		float pulse = c.lootHighlightPulse ? 0.67f + 0.33f * (float) Math.sin(System.currentTimeMillis() % 1600 / 1600.0 * Math.PI * 2) : 1f;
		// the text shader drops anything fainter than a tenth
		int fillAlpha = Math.max(30, Math.round(64 * pulse)), lineAlpha = Math.max(60, Math.round(235 * pulse));
		for (Box b : list) {
			int rgb = color(b.cat());
			float x0 = (float) (b.x0() - cam.x), y0 = (float) (b.y0() - cam.y), z0 = (float) (b.z0() - cam.z);
			float x1 = (float) (b.x1() - cam.x), y1 = (float) (b.y1() - cam.y), z1 = (float) (b.z1() - cam.z);
			if (c.lootHighlightFill) box(p, vc, (float) (x0 - OUT), (float) (y0 - OUT), (float) (z0 - OUT), (float) (x1 + OUT), (float) (y1 + OUT), (float) (z1 + OUT), rgb, fillAlpha);
			double mx = (x0 + x1) / 2, my = (y0 + y1) / 2, mz = (z0 + z1) / 2;
			double dist = Math.sqrt(mx * mx + my * my + mz * mz);
			float h = (float) Math.max(0.015, Math.min(0.07, 0.014 + dist * 0.0016));
			for (int i = 0; i < 4; i++) {
				float y = (i & 1) == 0 ? y0 : y1, z = (i & 2) == 0 ? z0 : z1, x = (i & 2) == 0 ? x0 : x1;
				// along x, along z (at each height), and the four upright edges
				box(p, vc, x0 - h, y - h, z - h, x1 + h, y + h, z + h, rgb, lineAlpha);
				box(p, vc, x - h, y - h, z0 + h, x + h, y + h, z1 - h, rgb, lineAlpha);
				float ux = (i & 1) == 0 ? x0 : x1;
				box(p, vc, ux - h, y0 + h, z - h, ux + h, y1 - h, z + h, rgb, lineAlpha);
			}
		}
	}

	/** A box's six faces, each counter-clockwise seen from outside. */
	private static void box(PoseStack.Pose p, VertexConsumer vc, float x0, float y0, float z0, float x1, float y1, float z1, int rgb, int a) {
		int r = rgb >> 16 & 0xFF, g = rgb >> 8 & 0xFF, b = rgb & 0xFF;
		// up, down
		quad(p, vc, x0, y1, z0, x0, y1, z1, x1, y1, z1, x1, y1, z0, r, g, b, a);
		quad(p, vc, x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, r, g, b, a);
		// north, south
		quad(p, vc, x0, y0, z0, x0, y1, z0, x1, y1, z0, x1, y0, z0, r, g, b, a);
		quad(p, vc, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, r, g, b, a);
		// west, east
		quad(p, vc, x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, r, g, b, a);
		quad(p, vc, x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z1, r, g, b, a);
	}

	private static void quad(PoseStack.Pose p, VertexConsumer vc, float ax, float ay, float az, float bx, float by, float bz, float cx, float cy, float cz,
			float dx, float dy, float dz, int r, int g, int b, int a) {
		vertex(p, vc, ax, ay, az, r, g, b, a);
		vertex(p, vc, bx, by, bz, r, g, b, a);
		vertex(p, vc, cx, cy, cz, r, g, b, a);
		vertex(p, vc, dx, dy, dz, r, g, b, a);
	}

	private static void vertex(PoseStack.Pose p, VertexConsumer vc, float x, float y, float z, int r, int g, int b, int a) {
		//#if MC >= 1.21
		vc.addVertex(p, x, y, z).setColor(r, g, b, a).setUv(0.5f, 0.5f).setLight(FULL_BRIGHT);
		//#else
		//$ vc.vertex(p.pose(), x, y, z).color(r, g, b, a).uv(0.5f, 0.5f).uv2(FULL_BRIGHT).endVertex();
		//#endif
	}
}
