<!-- dzial: hud | kolejnosc: 170 | ikona: fa-cloud | opis: Modules and windows for SkyUp.pl: the dungeon map, tasks, fish counter, SkyCase, wardrobe, plan of the week and XP calculator -->
# SkyUp.pl modules

The features for the SkyUp.pl server have their own category in the settings window: **Right Shift → Settings → SkyUp** (they are not under "All"). The modules only show on SkyUp.pl and only when they have something to show. Most need Minecraft 26.3; the dungeon map and the loot highlight work on older versions too.

## Dungeon map

In a dungeon: a map of the rooms with you, other players, mobs and loot. **M** opens it full-screen (drag, wheel, right click – the whole map, Tab – the view), **=** and **-** zoom the small map, and **H** switches between the detailed and the simple view.

| Setting | What it does |
|---|---|
| Map style | detailed, or simple (rooms as tiles) |
| The whole layout from the map above the dungeon | rooms not found yet are dimmed |
| Floor block colours | the real colours instead of plain ones |
| Map size, Shape, Zoom, Follow the player | look and behaviour |
| Start room | a mark and an arrow to it |
| Show other players, Show mobs and NPCs | each mob class (normal, elites, mini bosses, minions, others) as a head, a dot or hidden |
| Loot on the map | dots for chests, barrels, pots, flower pots and ores |
| Room loot counters, Counters' place | below the map, above, on the map or apart (the **Dungeon loot counters** module) |
| Cleared rooms | green, with the time to respawn |
| Rooms without a spawner | a blue frame |
| XP on the dungeon's bar | the XP as a number on the boss bar, e.g. "90/225 xp" |
| Mini bosses glow, Elites glow | a red (elites: orange) glow seen through walls |
| Only mobs named glow | names separated by commas, e.g. "Czyken, Żniwiarz" – only those mobs glow (the mob's own name counts) |

The mod learns by itself how much XP a dungeon level takes, from the damage you deal to mobs (the damage is the dungeon XP). Until it has measured a level it uses the server's formula, so a change in how the server counts XP doesn't break the numbers.

## XP in the dungeon

The **XP in the dungeon** module shows during a run the dungeon XP, your own XP (the green bar) and each job's XP from its boss bar.

## Dungeon summary

After you leave a dungeon, a card with a summary: the level, the time, rooms, spawners beaten, loot, ores, mobs killed (elites and mini bosses among them), the dungeon, player and job XP – with the levels gained next to them in brackets, e.g. "(level 2 → 3)". Numbers that are zero are not shown. A run cut short by leaving the server goes to the history too, and the list of runs is in the **Dungeon summary** module's settings.

## Dungeon loot highlight

Chests, barrels, pots, flower pots, ores and drops not taken yet are outlined in the world, each in its own colour. Options: **Soft fill**, **Slight pulse**, **Through walls**, **Distance limit** and **Distance (blocks)**.

## SkyUp tasks

A tracker of the island tasks you follow, with their progress. In the tasks window point at a task or a category and press **J** (or the middle mouse button) to track it; the **arrow keys** move it up or down the tracker.

- **Most tasks on screen**, **Width**, **Compact mode**, **Scroll rows that are too long**.
- **Hide those ready to hand in**, **Nearly done tasks higher**, **Task order**.
- **Show rewards**, **Track all unfinished**, **Track the daily task automatically**, **Tasks left in the category**.
- **Mark ready ones in the window** – a frame or a background.
- **Reminder after joining**, reminders about the daily task and an unclaimed daily bonus (every so many minutes, with a sound).
- **Shamanism recipe under the mob to summon**.

## SkyUp shamanism

The shamanism recipes you track, with what is still missing (wand, other hand, level). Point at the mob in the window and press J or the middle button.

## SkyUp fish counter

The fish you caught: on this trip, this session and in total. **Split into categories** (size, species, quality), **Show weight**, **Show value (SC)** and **Trip ends after a break**.

## Fish atlas

An album of every species: what you have caught, your weight and price records, fun facts and the list of fish you caught. Filters: all, caught, missing. Species load when you look through "My catches" at the Fisherman.

## SkyCase drop counter

What the SkyCase cases you opened gave, this session and in total. **Show**: recent, most common or a summary; **Recent drops** as a name, an icon or both; **How many rewards**, **Add up amounts**, **New drop notification**. The **SkyCase drops** window lists every reward of every case – won or not – and can add wins from the game's logs.

## SkyUp wardrobe

What you wear in SkyUp's cosmetic wardrobe and the state of its switches.

## SkyUp plan of the week

The coming events, fishing contests and the Boss Arena with their start time (in how long, at what time, or both). A notification before the start, for each kind on its own, with the sound you pick.

## Boosts and skills

The **Boosts and skills** module reads the beacon's boost bars ("Boost » Drop z mobów » 1 godz 59 min") and job skill bars ("Nawałnica (pozostało 1 min 14 sek)") and shows a banner with a sound:

- **Boost running out** – shortly before it ends (**Warn before a boost ends**, 0–10 minutes before).
- **Boost ended**.
- **Skill running out** – a banner for a skill's last seconds (**Warn before a skill ends**, 0–60 seconds, 10 by default) that counts down and goes together with it.
- **Job skill ended** – Wiertło, Piła, Pług, Nawałnica, Rozbiórka, Sieci rybackie, Eskalacja.
- **Skill ready again** – after its cooldown (**Skill cooldown**, 10 minutes from its end by default). The cooldown counts only while you play on SkyUp, as on the server.

The banners have icons from the beacon's and /prace menus (with SkyUp's pack loaded; without it – plain items). Each banner has its own **Sound** and can be turned off. A boost ended, a skill ready and a boost running out can also come as a **system notification** while the game is in the background (a switch next to each; the launcher shows them when its system notifications are on). A bar that goes with plenty of time left (another sector, leaving the server) doesn't count as the end.

## SkyUp XP calculator and bottling countdown

An XP bottling calculator with the 50% tax, a mending assistant (generators, Unbreaking) and an AFK session countdown. The **XP bottling countdown** module shows it on the screen while it runs.

## SkyUp wiki

The server's wiki in a game window, with search. The "SkyUp: wiki" key (none by default) or the card in the SkyUp category. Works in a game started from the launcher.

## SkyUp's pack in your resource packs

When SkyUp sends its resource pack, the mod saves it as `SkyUp.zip` in your resource packs and updates it when the server has a newer one. Kept on for good – later joins download and load nothing again.

## GUI dump

**F7** over an open server window saves everything in it (names, lore, item data, the scoreboard) to a file in `config/slashclient-skyup/zrzuty` – useful for bug reports.
