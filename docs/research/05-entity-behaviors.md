# 調査: 実体の行動（`minecraft:behavior.*`）

**出どころ**: `bedrock-samples/documentation/Entities.html`（同梱の公式ドキュメント）。
**この文書は機械的に抜き出したもの。** **推測は 1 行も入っていない。**

---

## 0. いちばん大事なこと

> ### **新しい行動は作れない**
>
> **Bedrock のビヘイビアーパックに「自分で書いた AI」を登録する口は無い。**
> **できるのは、下の 171 個を組み合わせることだけ。**
>
> **171 個で足りない動きは、Script API で作るしかない**（`services/` に置く）。

**だから順番はこう:**

| | |
| --- | --- |
| **1** | **下の一覧から、やりたい動きに近いものを探す** |
| **2** | **無ければ script。** **あるのに script で書くと、経路探索と綱引きになる** |

---

## 1. 全部の一覧（171 個）


| 名前 | 何ができるか |
| --- | --- |
| `admire_item` | Enables the mob to admire items that have been configured as admirable. Must be used in combination with the admire_item component |
| `avoid_block` | Allows this entity to avoid certain blocks. |
| `avoid_mob_type` | Allows the entity to run away from other entities that meet the criteria specified. |
| `barter` | Enables the mob to barter for items that have been configured as barter currency. Must be used in combination with the barter component |
| `beg` | Allows this mob to look at and follow the player that holds food they like. |
| `break_door` | -1798237626 <td style="border-style:solid; border-width:2; padding:8px" |
| `breed` | Allows this mob to breed with other mobs. |
| `celebrate` | Allows this entity to celebrate surviving a raid by making celebration sounds and jumping. |
| `celebrate_survive` | Allows this entity to celebrate surviving a raid by shooting fireworks. |
| `charge_attack` | Allows this entity to damage a target by using a running attack. |
| `charge_held_item` | Allows an entity to charge and use their held item. |
| `circle_around_anchor` | Causes an entity to circle around an anchor point placed near a point or target. |
| `controlled_by_player` | Allows the entity to be controlled by the player using an item in the item_controllable property (required). Also requires the minecraft:movement property, and the minecraft:rideable property. On ever |
| `croak` | Allows the entity to croak at a random time interval with configurable conditions. |
| `defend_trusted_target` | Allows the mob to target another mob that hurts an entity it trusts. |
| `defend_village_target` | Allows the entity to stay in a village and defend the village from aggressors. If a player is in bad standing with the village this goal will cause the entity to attack the player regardless of filter |
| `delayed_attack` | Allows an entity to attack, while also delaying the damage-dealt until a specific time in the attack animation. |
| `dig` | Allows this entity to dig into the ground before despawning. |
| `door_interact` | Allows the mob to open and close doors. |
| `dragonchargeplayer` | Allows this entity to attack a player by charging at them. The player is chosen by the " |
| `dragondeath` | Allows the dragon to go out with glory. This controls the Ender Dragon's death animation and can't be used by other mobs. |
| `dragonflaming` | Allows this entity to use a flame-breath attack. Can only be used by the Ender Dragon. |
| `dragonholdingpattern` | Allows the Dragon to fly around in a circle around the center podium. Can only be used by the Ender Dragon. |
| `dragonlanding` | Allows the Dragon to stop flying and transition into perching mode. Can only be used by the Ender Dragon. |
| `dragonscanning` | Allows the dragon to look around for a player to attack while in perch mode. Can only be used by the Ender Dragon. |
| `dragonstrafeplayer` | Allows this entity to fly around looking for a player to shoot fireballs at. Can only be used by the Ender Dragon. |
| `dragontakeoff` | Allows the dragon to leave perch mode and go back to flying around. Can only be used by the Ender Dragon. |
| `drink_milk` | Allows the mob to drink milk based on specified environment conditions. |
| `drink_potion` | Allows the mob to drink potions based on specified environment conditions. |
| `drop_item_for` | Allows the entity to move toward a target, and drop an item near the target. This goal requires a "minecraft:navigation" to execute. |
| `eat_block` | Allows the entity to consume a block, replace the eaten block with another block, and trigger an event as a result. |
| `eat_carried_item` | If the mob is carrying a food item, the mob will eat it and the effects will be applied to the mob. |
| `eat_mob` | Allows the entity to eat a specified Mob. |
| `emerge` | Allows this entity to emerge from the ground |
| `enderman_leave_block` | Allows the enderman to drop a block they are carrying. Can only be used by Endermen. |
| `enderman_take_block` | Allows the enderman to take a block and carry it around. Can only be used by Endermen. |
| `equip_item` | The entity puts on the desired equipment. |
| `explore_outskirts` | Allows the entity to first travel to a random point on the outskirts of the village, and then explore random points within a small distance. This goal requires "minecraft:dweller" and "minecraft:navig |
| `fertilize_farm_block` | Allows the mob to search within an area for a growable crop block. If found, the mob will use any available fertilizer in their inventory on the crop. This goal will not execute if the mob does not ha |
| `find_cover` | Allows the mob to seek shade. |
| `find_mount` | Allows the mob to look around for another mob to ride atop it. |
| `find_underwater_treasure` | Allows the mob to move towards the nearest underwater ruin or shipwreck. |
| `fire_at_target` | Allows an entity to attack by firing a shot with a delay. Anchor and offset parameters of this component overrides the anchor and offset from projectile component. |
| `flee_sun` | Allows the mob to run away from direct sunlight and seek shade. |
| `float` | Allows the mob to stay afloat while swimming. Passengers will be kicked out the moment the mob's head goes underwater, which may not happen for tall mobs. |
| `float_tempt` | Allows a mob to be tempted by a player holding a specific item. Uses point-to-point movement. Designed for mobs that are floating (e.g. use the "minecraft:navigation.float" component). |
| `float_wander` | Allows the mob to float around like the Ghast. |
| `follow_caravan` | Allows the mob to follow mobs that are in a caravan. |
| `follow_mob` | Allows the mob to follow other mobs. |
| `follow_owner` | Allows a mob to follow the player that owns it. |
| `follow_parent` | Allows the mob to follow their parent around. |
| `follow_target_leader` | Allows mob to move towards its target leader. |
| `go_and_give_items_to_noteblock` | The entity will attempt to toss the items from its inventory to a nearby recently played noteblock. |
| `go_and_give_items_to_owner` | The entity will attempt to toss the items from its inventory to its owner. |
| `go_home` | Allows the mob to move back to the position they were spawned. |
| `guardian_attack` | Allows this entity to use a laser beam attack. Can only be used by Guardians and Elder Guardians. |
| `harvest_farm_block` | Allows the entity to search within an area for farmland with air above it. If found, the entity will replace the air block by planting a seed item from its inventory on the farmland block. This goal r |
| `hide` | Allows a mob with the hide component to attempt to move to - and hide at - an owned or nearby POI. |
| `hold_ground` | The mob freezes and looks at the mob they are targeting. |
| `hurt_by_target` | Allows the mob to target another mob that hurts them. |
| `inspect_bookshelf` | Allows the mob to inspect bookshelves. |
| `investigate_suspicious_location` | Allows this entity to move towards a "suspicious" position based on data gathered in minecraft:suspect_tracking |
| `jump_around_target` | Allows an entity to jump around a target. |
| `jump_to_block` | Allows an entity to jump to another random block. |
| `knockback_roar` | Allows the mob to perform a damaging knockback that affects all nearby entities. |
| `lay_down` | Allows mobs to lay down at times |
| `lay_egg` | Allows the mob to lay an egg block on certain types of blocks if the mob is pregnant. |
| `leap_at_target` | Allows monsters to jump at and attack their target. Can only be used by hostile mobs. |
| `make_love` | Allows the villager to look for a mate to spawn other villagers with. Can only be used by Villagers. |
| `melee_attack` | Allows an entity to deal damage through a melee attack. |
| `melee_box_attack` | Allows an entity to deal damage through a melee attack with reach calculations based on bounding boxes. |
| `mingle` | Allows an entity to go to the village bell and mingle with other entities |
| `mount_pathing` | Allows the mob to move around on its own while mounted seeking a target to attack. |
| `move_around_target` | Allows an entity to move around a target. If the entity is too close (i.e. closer than destination range min and height difference limit) it will try to move away from its target. If the entity is too |
| `move_indoors` | Allows this entity to move indoors. |
| `move_outdoors` | Allows this entity to move outdoors. |
| `move_through_village` | Can only be used by Villagers. Allows the villagers to create paths around the village. |
| `move_to_block` | Allows mob to move towards a block. |
| `move_to_land` | Allows the mob to move back onto land when in water. |
| `move_to_lava` | Allows the mob to move back into lava when on land. |
| `move_to_liquid` | Allows the mob to move into a liquid when on land. |
| `move_to_poi` | Allows the mob to move to a POI if able to |
| `move_to_random_block` | Allows mob to move towards a random block. |
| `move_to_village` | Allows the mob to move into a random location within a village. |
| `move_to_water` | Allows the mob to move back into water when on land. |
| `move_towards_dwelling_restriction` | Allows entities with the "minecraft:dweller" component to move toward their Village area that the entity should be restricted to. |
| `move_towards_home_restriction` | Allows entities with a "minecraft:home" component to move towards their home position. If "restriction_radius" is set, entities will be able to run this behavior only if outside of it. |
| `move_towards_target` | Allows mob to move towards its current target. |
| `nap` | Allows mobs to occassionally stop and take a nap under certain conditions. |
| `nearest_attackable_target` | Allows an entity to attack the closest target within a given subset of specific target types. |
| `nearest_prioritized_attackable_target` | Allows the mob to check for and pursue the nearest valid target. |
| `ocelot_sit_on_block` | Allows to mob to be able to sit in place like the ocelot. |
| `ocelotattack` | Allows an entity to attack by sneaking and pouncing. |
| `offer_flower` | Allows the mob to offer a flower to another mob with the minecraft:take_flower behavior. |
| `open_door` | Allows the mob to open doors. Requires the mob to be able to path through doors, otherwise the mob won't even want to try opening them. |
| `owner_hurt_by_target` | Allows the mob to target another mob that hurts their owner. |
| `owner_hurt_target` | Allows the mob to target a mob that is hurt by their owner. |
| `panic` | Allows the mob to enter the panic state, which makes it run around and away from the damage source that made it enter this state. |
| `pet_sleep_with_owner` | Allows the pet mob to move onto a bed with its owner while sleeping. |
| `pickup_items` | Allows the mob to pick up items on the ground. |
| `place_block` | Allows the entity to place a block. |
| `play` | Allows the mob to play with other mobs by chasing each other and moving around randomly. |
| `play_dead` | Allows this entity to pretend to be dead to avoid being targeted by attackers. |
| `player_ride_tamed` | Allows the mob to be ridden by the player after being tamed. |
| `raid_garden` | Allows the mob to eat/raid crops out of farms until they are full. |
| `ram_attack` | Allows this entity to damage a target by using a running attack. |
| `random_breach` | Allows the mob to randomly break surface of the water. |
| `random_fly` | Allows a mob to randomly fly around. |
| `random_hover` | Allows the mob to hover around randomly, close to the surface |
| `random_look_around` | Allows the mob to randomly look around. |
| `random_look_around_and_sit` | Allows the mob to randomly sit and look around for a duration. Note: Must have a sitting animation set up to use this. |
| `random_search_and_dig` | Allows this entity to locate a random target block that it can path find to. Once found, the entity will move towards it and dig up an item. [Default target block types: Dirt, Grass, Podzol, DirtWithR |
| `random_sitting` | Allows the mob to randomly sit for a duration. |
| `random_stroll` | Allows a mob to randomly stroll around. |
| `random_swim` | Allows an entity to randomly move through water |
| `ranged_attack` | Allows an entity to attack by using ranged shots. "charge_shoot_trigger" must be greater than 0 to enable charged up burst-shot attacks. Requires minecraft:shooter to define projectile behaviour. |
| `receive_love` | Allows the villager to stop so another villager can breed with it. Can only be used by a Villager. |
| `restrict_open_door` | 715583988 <td style="border-style:solid; border-width:2; padding:8px" |
| `restrict_sun` | Allows the mob to automatically start avoiding the sun when its a clear day out. |
| `rise_to_liquid_level` | Allows the mob to stay at a certain level when in liquid. |
| `roar` | Allows this entity to roar at another entity based on data in minecraft:anger_level. Once the anger threshold specified in minecraft:anger_level has been reached, this entity will roar for the specifi |
| `roll` | This allows the mob to roll forward. |
| `run_around_like_crazy` | Allows the mob to run around aimlessly. |
| `scared` | Allows the a mob to become scared when the weather outside is thundering |
| `send_event` | Allows the mob to send an event to another mob. |
| `share_items` | Allows the mob to give items it has to others. |
| `silverfish_merge_with_stone` | Allows the mob to go into stone blocks like Silverfish do. Currently it can only be used by Silverfish. |
| `silverfish_wake_up_friends` | Allows the mob to alert mobs in nearby blocks to come out. Currently it can only be used by Silverfish. |
| `skeleton_horse_trap` | Allows Equine mobs to be Horse Traps and be triggered like them, spawning a lightning bolt and a bunch of horses when a player is nearby. Can only be used by Horses, Mules, Donkeys and Skeleton Horses |
| `sleep` | Allows mobs that own a bed to in a village to move to and sleep in it. |
| `slime_attack` | Causes the entity to grow tired every once in a while, while attacking. |
| `slime_float` | Allow slimes to float in water / lava. Can only be used by Slime and Magma Cubes. |
| `slime_keep_on_jumping` | Allows the entity to continuously jump around like a slime. |
| `slime_random_direction` | Allows the entity to move in random directions like a slime. |
| `snacking` | Allows the mob to take a load off and snack on food that it found nearby. |
| `sneeze` | Allows the mob to stop and sneeze possibly startling nearby mobs and dropping an item. |
| `sniff` | Allows this entity to detect the nearest player within "sniffing_radius" and update its "minecraft:suspect_tracking" component state |
| `sonic_boom` | Allows this entity to perform a 'sonic boom' ranged attack |
| `squid_dive` | Allows the squid to dive down in water. Can only be used by the Squid. |
| `squid_flee` | Allows the squid to swim away. Can only be used by the Squid. |
| `squid_idle` | Allows the squid to swim in place idly. Can only be used by the Squid. |
| `squid_move_away_from_ground` | Allows the squid to move away from ground blocks and back to water. Can only be used by the Squid. |
| `squid_out_of_water` | Allows the squid to stick to the ground when outside water. Can only be used by the Squid. |
| `stalk_and_pounce_on_target` | Allows a mob to stalk a target, then once within range pounce onto a target, on success the target will be attacked dealing damage defined by the attack component. On failure, the mob will risk gettin |
| `stay_near_noteblock` | The entity will attempt to toss the items from its inventory to a nearby recently played noteblock. |
| `stay_while_sitting` | Allows the mob to stay put while it is in a sitting state instead of doing something else. |
| `stomp_attack` | Allows an entity to attack using stomp AoE damage behavior. |
| `stomp_turtle_egg` | Allows this mob to stomp turtle eggs |
| `stroll_towards_village` | Allows the mob to move into a random location within a village within the search range. |
| `summon_entity` | Allows the mob to attack the player by summoning other entities. |
| `swell` | Allows the creeper to swell up when a player is nearby. It can only be used by Creepers. |
| `swim_idle` | Allows the entity go idle, if swimming. Entity must be in water. |
| `swim_up_for_breath` | Allows the mob to try to move to air once it is close to running out of its total breathable supply. Requires "minecraft:breathable". |
| `swim_wander` | Allows the entity to wander around while swimming, when not path-finding. |
| `swim_with_entity` | Allows the entity follow another entity. Both entities must be swimming [ie, in water]. |
| `swoop_attack` | Allows an entity to attack using swoop attack behavior; Ideal for use with flying mobs. The behavior ends if the entity has a horizontal collision or gets hit. |
| `take_block` | Allows the entity to take a block from the world and carry it around. |
| `take_flower` | Allows the mob to accept flowers from another mob with the minecraft:offer_flower behavior. |
| `teleport_to_owner` | Allows an entity to teleport to its owner. |
| `tempt` | Allows a mob to be tempted by a player holding a specific item. Uses pathfinding for movement. |
| `timer_flag_1` | Fires an event when this behavior starts, then waits for a duration before stopping. When stopping due to that timeout or due to being interrupted by another behavior, fires another event. query.timer |
| `timer_flag_2` | Fires an event when this behavior starts, then waits for a duration before stopping. When stopping due to that timeout or due to being interrupted by another behavior, fires another event. query.timer |
| `timer_flag_3` | Fires an event when this behavior starts, then waits for a duration before stopping. When stopping due to that timeout or due to being interrupted by another behavior, fires another event. query.timer |
| `trade_interest` | Allows the mob to look at a player that is holding a tradable item. |
| `trade_with_player` | Allows the player to trade with this mob. When the goal starts, it will stop the mob's navigation. |
| `vex_copy_owner_target` | Allows the mob to target the same entity its owner is targeting. |
| `vex_random_move` | Allows the mob to move around randomly like the Vex. |
| `wither_random_attack_pos_goal` | Allows the wither to launch random attacks. Can only be used by the Wither Boss. |
| `wither_target_highest_damage` | Allows the wither to focus its attacks on whichever mob has dealt the most damage to it. |
| `work` | Allows the NPC to use the POI |
| `work_composter` | Allows the NPC to use the composter POI to convert excess seeds into bone meal. |

---

## 2. よく使うものの値

**既定値は公式ドキュメントのまま。** **書かなければこの値になる。**


### `minecraft:behavior.melee_box_attack`

Allows an entity to deal damage through a melee attack with reach calculations based on bounding boxes.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_once` | Boolean | false | Allows the entity to use this attack behavior, only once EVER. |
| `attack_types` | String | N/A | Defines the entity types this entity will attack. |
| `can_spread_on_fire` | Boolean | false | If the entity is on fire, this allows the entity's target to catch on fire after being hit. |
| `cooldown_time` | Decimal | 1 | Cooldown time (in seconds) between attacks. |
| `horizontal_reach` | Decimal | 0.8 | The attack reach of the mob will be a box with the size of the mobs bounds increased by this value in all horizontal directions. |
| `inner_boundary_time_increase` | Decimal | 0.25 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_inner_boundary". |
| `max_path_time` | Decimal | 0.55 | Maximum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `melee_fov` | Decimal | 90 | Field of view (in degrees) when using the sensing component to detect an attack target. |
| `min_path_time` | Decimal | 0.2 | Minimum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `on_attack` | Trigger | N/A | Defines the event to trigger when this entity successfully attacks. |
| `on_kill` | Trigger | N/A | Defines the event to trigger when this entity kills the target. |
| `outer_boundary_time_increase` | Decimal | 0.5 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_outer_boundary". |
| `path_fail_time_increase` | Decimal | 0.75 | Time (in seconds) to add to attack path recalculation when this entity cannot move along the current path. |
| `path_inner_boundary` | Decimal | 16 | Distance at which to increase attack path recalculation by "inner_boundary_tick_increase". |
| `path_outer_boundary` | Decimal | 32 | Distance at which to increase attack path recalculation by "outer_boundary_tick_increase". |
| `random_stop_interval` | Integer | 0 | This entity will have a 1 in N chance to stop it's current attack, where N = "random_stop_interval". |
| `require_complete_path` | Boolean | false | Toggles (on/off) the need to have a full path from the entity to the target when using this melee attack behavior. |
| `speed_multiplier` | Decimal | 1 | This multiplier modifies the attacking entity's speed when moving toward the target. |
| `track_target` | Boolean | false | Allows the entity to track the attack target, even if the entity has no sensing. |
| `x_max_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the X-axis, this entity can rotate while trying to look at the target. |
| `y_max_head_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the Y-axis, this entity can rotate its head while trying to look at the target. |

### `minecraft:behavior.delayed_attack`

Allows an entity to attack, while also delaying the damage-dealt until a specific time in the attack animation.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_duration` | Decimal | 0.75 | The entity's attack animation will play out over this duration (in seconds). Also controls attack cooldown. |
| `attack_once` | Boolean | false | Allows the entity to use this attack behavior, only once EVER. |
| `attack_types` | String | N/A | Defines the entity types this entity will attack. |
| `can_spread_on_fire` | Boolean | false | If the entity is on fire, this allows the entity's target to catch on fire after being hit. |
| `hit_delay_pct` | Decimal | 0.5 | The percentage into the attack animation to apply the damage of the attack (1.0 = 100%). |
| `inner_boundary_time_increase` | Decimal | 0.25 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_inner_boundary". |
| `max_path_time` | Decimal | 0.55 | Maximum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `melee_fov` | Decimal | 90 | Field of view (in degrees) when using the sensing component to detect an attack target. |
| `min_path_time` | Decimal | 0.2 | Minimum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `on_attack` | Trigger | N/A | Defines the event to trigger when this entity successfully attacks. |
| `on_kill` | Trigger | N/A | Defines the event to trigger when this entity kills the target. |
| `outer_boundary_time_increase` | Decimal | 0.5 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_outer_boundary". |
| `path_fail_time_increase` | Decimal | 0.75 | Time (in seconds) to add to attack path recalculation when this entity cannot move along the current path. |
| `path_inner_boundary` | Decimal | 16 | Distance at which to increase attack path recalculation by "inner_boundary_tick_increase". |
| `path_outer_boundary` | Decimal | 32 | Distance at which to increase attack path recalculation by "outer_boundary_tick_increase". |
| `random_stop_interval` | Integer | 0 | This entity will have a 1 in N chance to stop it's current attack, where N = "random_stop_interval". |
| `reach_multiplier` | Decimal | 1.5 | Used with the base size of the entity to determine minimum target-distance before trying to deal attack damage. |
| `require_complete_path` | Boolean | false | Toggles (on/off) the need to have a full path from the entity to the target when using this melee attack behavior. |
| `speed_multiplier` | Decimal | 1 | This multiplier modifies the attacking entity's speed when moving toward the target. |
| `track_target` | Boolean | true | Allows the entity to track the attack target, even if the entity has no sensing. |
| `x_max_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the X-axis, this entity can rotate while trying to look at the target. |
| `y_max_head_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the Y-axis, this entity can rotate its head while trying to look at the target. |

### `minecraft:behavior.melee_attack`

Allows an entity to deal damage through a melee attack.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_once` | Boolean | false | Allows the entity to use this attack behavior, only once EVER. |
| `attack_types` | String | N/A | Defines the entity types this entity will attack. |
| `can_spread_on_fire` | Boolean | false | If the entity is on fire, this allows the entity's target to catch on fire after being hit. |
| `cooldown_time` | Decimal | 1 | Cooldown time (in seconds) between attacks. |
| `inner_boundary_time_increase` | Decimal | 0.25 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_inner_boundary". |
| `max_path_time` | Decimal | 0.55 | Maximum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `melee_fov` | Decimal | 90 | Field of view (in degrees) when using the sensing component to detect an attack target. |
| `min_path_time` | Decimal | 0.2 | Minimum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `on_attack` | Trigger | N/A | Defines the event to trigger when this entity successfully attacks. |
| `on_kill` | Trigger | N/A | Defines the event to trigger when this entity kills the target. |
| `outer_boundary_time_increase` | Decimal | 0.5 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_outer_boundary". |
| `path_fail_time_increase` | Decimal | 0.75 | Time (in seconds) to add to attack path recalculation when this entity cannot move along the current path. |
| `path_inner_boundary` | Decimal | 16 | Distance at which to increase attack path recalculation by "inner_boundary_tick_increase". |
| `path_outer_boundary` | Decimal | 32 | Distance at which to increase attack path recalculation by "outer_boundary_tick_increase". |
| `random_stop_interval` | Integer | 0 | This entity will have a 1 in N chance to stop it's current attack, where N = "random_stop_interval". |
| `reach_multiplier` | Decimal | 2 | Used with the base size of the entity to determine minimum target-distance before trying to deal attack damage. |
| `require_complete_path` | Boolean | false | Toggles (on/off) the need to have a full path from the entity to the target when using this melee attack behavior. |
| `speed_multiplier` | Decimal | 1 | This multiplier modifies the attacking entity's speed when moving toward the target. |
| `track_target` | Boolean | false | Allows the entity to track the attack target, even if the entity has no sensing. |
| `x_max_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the X-axis, this entity can rotate while trying to look at the target. |
| `y_max_head_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the Y-axis, this entity can rotate its head while trying to look at the target. |

### `minecraft:behavior.ranged_attack`

Allows an entity to attack by using ranged shots. "charge_shoot_trigger" must be greater than 0 to enable charged up burst-shot attacks. Requires minecraft:shooter to define projectile behaviour.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_interval` | Decimal | 0 | Alternative to "attack_interval_min" & "attack_interval_max". Consistent reload-time (in seconds), when not using a charged shot. Does not scale with target-distance. |
| `attack_interval_max` | Decimal | 0 | Maximum bound for reload-time range (in seconds), when not using a charged shot. Reload-time range scales with target-distance. |
| `attack_interval_min` | Decimal | 0 | Minimum bound for reload-time range (in seconds), when not using a charged shot. Reload-time range scales with target-distance. |
| `attack_radius` | Decimal | 0 | Minimum distance to target before this entity will attempt to shoot. |
| `attack_radius_min` | Decimal | 0 | Minimum distance the target can be for this mob to fire. If the target is closer, this mob will move first before firing |
| `burst_interval` | Decimal | 0 | Time (in seconds) between each individual shot when firing a burst of shots from a charged up attack. |
| `burst_shots` | Integer | 1 | Number of shots fired every time the attacking entity uses a charged up attack. |
| `charge_charged_trigger` | Decimal | 0 | Time (in seconds, then add "charge_shoot_trigger"), before a charged up attack is done charging. Charge-time decays while target is not in sight. |
| `charge_shoot_trigger` | Decimal | 0 | Amount of time (in seconds, then doubled) a charged shot must be charging before reloading burst shots. Charge-time decays while target is not in sight. |
| `ranged_fov` | Decimal | 90 | Field of view (in degrees) when using sensing to detect a target for attack. |
| `set_persistent` | Boolean | false | Allows the actor to be set to persist upon targeting a player |
| `speed_multiplier` | Decimal | 1 | During attack behavior, this multiplier modifies the entity's speed when moving toward the target. |
| `swing` | Boolean | false | If a swing animation (using variable.attack_time) exists, this causes the actor to swing their arm(s) upon firing the ranged attack. |
| `target_in_sight_time` | Decimal | 1 | Minimum amount of time (in seconds) the attacking entity needs to see the target before moving toward it. |
| `x_max_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the X-axis, this entity can rotate while trying to look at the target. |
| `y_max_head_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the Y-axis, this entity can rotate its head while trying to look at the target. |

### `minecraft:behavior.fire_at_target`

Allows an entity to attack by firing a shot with a delay. Anchor and offset parameters of this component overrides the anchor and offset from projectile component.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_cooldown` | Decimal | 0.500000 | The cooldown time in seconds before this goal can be used again. |
| `attack_range` | Range [a, b] | [2.000000, 16.000000] | Target needs to be within this range for the attack to happen. |
| `filters` | Minecraft Filter | Conditions that need to be met for the behavior to start. | max_head_rotation_x |
| `Decimal` | 30.000000 | Maximum head rotation (in degrees), on the X-axis, that this entity can apply while trying to look at the target. | max_head_rotation_y |
| `Decimal` | 30.000000 | Maximum head rotation (in degrees), on the Y-axis, that this entity can apply while trying to look at the target. | owner_anchor |
| `Integer` | 2 | Entity anchor for the projectile spawn location. | owner_offset |
| `Vector [a, b, c]` | [0.000, 0.000, 0.000] | Offset vector from the owner_anchor. | post_shoot_delay |
| `Decimal` | 0.200000 | Time in seconds between firing the projectile and ending the goal. | pre_shoot_delay |
| `Decimal` | 0.750000 | Time in seconds before firing the projectile. | projectile_def |
| `String` | Actor definition to use as projectile for the ranged attack. The actor must be a projectile. This field is required for the goal to be usable. | ranged_fov | Decimal |
| `90.000000` | Field of view (in degrees) when using sensing to detect a target for attack. | target_anchor | Integer |
| `2` | Entity anchor for projectile target. | target_offset | Vector [a, b, c] |

### `minecraft:behavior.move_around_target`

Allows an entity to move around a target. If the entity is too close (i.e. closer than destination range min and height difference limit) it will try to move away from its target. If the entity is too far away from its target it will try to move closer to a random position within the destination range. A randomized amount of those positions will be behind the target, and the spread can be tweaked with 'destination_pos_spread_degrees'.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `destination_pos_spread_degrees` | Decimal | 90.000000 | This angle (in degrees) is used for controlling the spread when picking a destination position behind the target. A zero spread angle means the destination position will be straight behind the target with no variance. A 90 degree spread angle means the destina |
| `destination_position_range` | Range [a, b] | [4.000000, 8.000000] | The range of distances from the target entity within which the goal should look for a position to move the owner entity to. |
| `filters` | Minecraft Filter | Conditions that need to be met for the behavior to start. | height_difference_limit |
| `Decimal` | 10.000000 | Distance in height (in blocks) between the owner entity and the target has to be less than this value when owner checks if it is too close and should move away from the target. This value needs to be bigger than zero for the move away logic to trigger. | horizontal_search_distance |
| `Integer` | 5 | Horizontal search distance (in blocks) when searching for a position to move away from target. | movement_speed |
| `Decimal` | 0.600000 | The speed with which the entity should move to its target position. | vertical_search_distance |
| `Integer` | 5 | Vertical search distance (in blocks) when searching for a position to move away from target. | <p id="minecraft:behavior.move_indoors (See JSON Schema since 1.26.20)" |

### `minecraft:behavior.avoid_mob_type`

Allows the entity to run away from other entities that meet the criteria specified.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `avoid_mob_sound` | String | The sound event to play when the mob is avoiding another mob. | avoid_target_xz |
| `Integer` | 16 | The next target position the entity chooses to avoid another entity will be chosen within this XZ Distance. | avoid_target_y |
| `Integer` | 7 | The next target position the entity chooses to avoid another entity will be chosen within this Y Distance. | entity_types |
| `Minecraft Filter` | The list of conditions another entity must meet to be a valid target to avoid. | ignore_visibility | Boolean |
| `false` | Whether or not to ignore direct line of sight while this entity is running away from other specified entities. | max_dist | Decimal |
| `3.0` | Maximum distance to look for an avoid target for the entity. | max_flee | Decimal |
| `10.0` | How many blocks away from its avoid target the entity must be for it to stop fleeing from the avoid target. | on_escape_event | Trigger |
| `Event that is triggered when escaping from a mob.` | probability_per_strength | Decimal | 1.0 |
| `Percent chance this entity will stop avoiding another entity based on that entity's strength, where 1.0 = 100%.` | remove_target | Boolean | false |
| `Determine if we should remove target when fleeing or not.` | sound_interval | Range [a, b] | [3, 8] |
| `The range of time in seconds to randomly wait before playing the sound again.` | sprint_distance | Decimal | 7.0 |
| `How many blocks within range of its avoid target the entity must be for it to begin sprinting away from the avoid target.` | sprint_speed_multiplier | Decimal | 1.0 |
| `Multiplier for sprint speed. 1.0 means keep the regular speed, while higher numbers make the sprint speed faster.` | walk_speed_multiplier | Decimal | 1.0 |

### `minecraft:behavior.move_towards_target`

Allows mob to move towards its current target.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `within_radius` | Decimal | 0.0 | Defines the radius in blocks that the mob tries to be from the target. A value of 0 means it tries to occupy the same block as the target |

### `minecraft:behavior.hold_ground`

The mob freezes and looks at the mob they are targeting.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `broadcast` | Boolean | false | Whether to broadcast out the mob's target to other mobs of the same type. |
| `broadcast_range` | Decimal | 0.0f | Range in blocks for how far to broadcast. |
| `min_radius` | Decimal | 10.0f | Minimum distance the target must be for the mob to run this goal. |
| `within_radius_event` | String | Event to run when target is within the radius. This event is broadcasted if broadcast is true. | <p id="minecraft:behavior.hurt_by_target" |

### `minecraft:behavior.nearest_attackable_target`

Allows an entity to attack the closest target within a given subset of specific target types.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_interval` | Range [a, b] | [0, 0] | Time range (in seconds) between searching for an attack target, range is in (0, "attack_interval"]. Only used if "attack_interval" is greater than 0, otherwise "scan_interval" is used. |
| `attack_owner` | Boolean | false | If true, this entity can attack its owner. |
| `entity_types` | Minecraft Filter | Filters which types of targets are valid for this entity. | must_reach |
| `Boolean` | false | If true, this entity requires a path to the target. | must_see |
| `Boolean` | false | Determines if target-validity requires this entity to be in range only, or both in range and in sight. | must_see_forget_duration |
| `Decimal` | 3.0 | Time (in seconds) the target must not be seen by this entity to become invalid. Used only if "must_see" is true. | persist_time |
| `Decimal` | 0.0 | Time (in seconds) this entity can continue attacking the target after the target is no longer valid. | reselect_targets |
| `Boolean` | false | Allows the attacking entity to update the nearest target, otherwise a target is only reselected after each "scan_interval" or "attack_interval". | scan_interval |
| `Integer` | 10 | If "attack_interval" is 0 or isn't declared, then between attacks: scanning for a new target occurs every amount of ticks equal to "scan_interval", minimum value is 1. Values under 10 can affect performance. | set_persistent |
| `Boolean` | false | Allows the actor to be set to persist upon targeting a player | target_acquisition_probability |
| `Decimal` | 1.00 | Probability (0.0 to 1.0) that this entity will accept a found target. Checked each time a valid target is found during scanning. | target_invisible_multiplier |
| `Decimal` | 0.70 | Multiplied with the target's armor coverage percentage to modify "max_dist" when detecting an invisible target. | target_search_height |
| `Decimal` | -1.00 | Maximum vertical target-search distance, if it's greater than the target type's "max_dist". A negative value defaults to "entity_types" greatest "max_dist". | target_sneak_visibility_multiplier |
| `Decimal` | 0.80 | Multiplied with the target type's "max_dist" when trying to detect a sneaking target. | within_radius |
| `Decimal` | 0.0 | Maximum distance this entity can be from the target when following it, otherwise the target becomes invalid. This value is only used if the entity doesn't declare "minecraft:follow_range". | <p id="minecraft:behavior.nearest_prioritized_attackable_target" |

### `minecraft:behavior.hurt_by_target`

Allows the mob to target another mob that hurts them.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `alert_same_type` | Boolean | false | If true, nearby mobs of the same type will be alerted about the damage |
| `entity_types` | JSON Object | List of entity types that this mob can target when hurt by them | Name |
| `Type` | Default Value | Description | cooldown |
| `Decimal` | 0.0 | The amount of time in seconds that the mob has to wait before selecting a target of the same type again | filters |
| `Minecraft Filter` | Conditions that make this entry in the list valid | max_dist | Decimal |
| `16` | Maximum distance this mob can be away to be a valid choice | must_see | Boolean |
| `false` | If true, the mob has to be visible to be a valid choice | must_see_forget_duration | Decimal |
| `3.0` | Determines the amount of time in seconds that this mob will look for a target before forgetting about it and looking for a new one when the target isn't visible any more | reevaluate_description | Boolean |
| `false` | If true, the mob will stop being targeted if it stops meeting any conditions. | sprint_speed_multiplier | Decimal |
| `1.0` | Multiplier for the running speed. A value of 1.0 means the speed is unchanged | walk_speed_multiplier | Decimal |
| `1.0` | Multiplier for the walking speed. A value of 1.0 means the speed is unchanged | hurt_owner | Boolean |

### `minecraft:behavior.swell`

Allows the creeper to swell up when a player is nearby. It can only be used by Creepers.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `start_distance` | Decimal | 10.0 | This mob starts swelling when a target is at least this many blocks away |
| `stop_distance` | Decimal | 2 | This mob stops swelling when a target has moved away at least this many blocks |

### `minecraft:behavior.charge_attack`

Allows this entity to damage a target by using a running attack.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `max_distance` | Decimal | 3 | A charge attack cannot start if the entity is farther than this distance to the target. |
| `min_distance` | Decimal | 2 | A charge attack cannot start if the entity is closer than this distance to the target. |
| `speed_multiplier` | Decimal | 1 | Modifies the entity's speed when charging toward the target. |
| `success_rate` | Decimal | 0.1428 | Percent chance this entity will start a charge attack, if not already attacking (1.0 = 100%) |

### `minecraft:behavior.leap_at_target`

Allows monsters to jump at and attack their target. Can only be used by hostile mobs.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `must_be_on_ground` | Boolean | true | If true, the mob will only jump at its target if its on the ground. Setting it to false will allow it to jump even if its already in the air |
| `set_persistent` | Boolean | false | Allows the actor to be set to persist upon targeting a player |
| `yd` | Decimal | 0.0 | The height in blocks the mob jumps when leaping at its target |

### `minecraft:behavior.random_fly`

Allows a mob to randomly fly around.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `can_land_on_trees` | Boolean | true | If true, the mob can stop flying and land on a tree instead of the ground |
| `speed_multiplier` | Decimal | 1.0 | Movement speed multiplier of the mob when using this AI Goal |
| `xz_dist` | Integer | 10 | Distance in blocks on ground that the mob will look for a new spot to move to. Must be at least 1 |
| `y_dist` | Integer | 7 | Distance in blocks that the mob will look up or down for a new spot to move to. Must be at least 1 |

### `minecraft:behavior.random_hover`

Allows the mob to hover around randomly, close to the surface

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `hover_height` | Range [a, b] | The height above the surface which the mob will try to maintain | interval |
| `Integer` | 120 | A random value to determine when to randomly move somewhere. This has a 1/interval chance to choose this goal | speed_multiplier |
| `Decimal` | 1.0 | Movement speed multiplier of the mob when using this AI Goal | xz_dist |
| `Integer` | 10 | Distance in blocks on ground that the mob will look for a new spot to move to. Must be at least 1 | y_dist |
| `Integer` | 7 | Distance in blocks that the mob will look up or down for a new spot to move to. Must be at least 1 | y_offset |
| `Decimal` | 0.0 | Height in blocks to add to the selected target position | <p id="minecraft:behavior.random_look_around" |

### `minecraft:behavior.float_wander`

Allows the mob to float around like the Ghast.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `additional_collision_buffer` | Boolean | false | If true, the mob will have an additional buffer zone around it to avoid collisions with blocks when picking a position to wander to. |
| `allow_navigating_through_liquids` | Boolean | false | If true allows the mob to navigate through liquids on its way to the target position. |
| `float_duration` | Range [a, b] | [0.0, 0.0] | Range of time in seconds the mob will float around before landing and choosing to do something else |
| `float_wander_has_move_control` | Boolean | true | If true, the MoveControl flag will be added to the behavior which means that it can no longer be active at the same time as other behaviors with MoveControl. |
| `must_reach` | Boolean | false | If true, the point has to be reachable to be a valid target |
| `navigate_around_surface` | Boolean | false | If true, will prioritize finding random positions in the vicinity of surfaces, i.e. blocks that are not Air or Liquid. |
| `random_reselect` | Boolean | false | If true, the mob will randomly pick a new point while moving to the previously selected one |
| `surface_xz_dist` | Integer | 0 | The horizontal distance in blocks that the goal will check for a surface from a candidate position. Only valid when `navigate_around_surface` is true. |
| `surface_y_dist` | Integer | 0 | The vertical distance in blocks that the goal will check for a surface from a candidate position. Only valid when `navigate_around_surface` is true. |
| `use_home_position_restriction` | Boolean | true | If true, the mob will respect home position restrictions when choosing new target positions. If false, it will choose target position without considering home restrictions |
| `xz_dist` | Integer | 10 | Distance in blocks on ground that the mob will look for a new spot to move to. Must be at least 1 |
| `y_dist` | Integer | 7 | Distance in blocks that the mob will look up or down for a new spot to move to. Must be at least 1 |
| `y_offset` | Decimal | 0.0 | Height in blocks to add to the selected target position |

### `minecraft:behavior.circle_around_anchor`

Causes an entity to circle around an anchor point placed near a point or target.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `angle_change` | Decimal | 15.0 | Number of degrees to change this entity's facing by, when the entity selects its next anchor point. |
| `goal_radius` | Decimal | 0.5 | Maximum distance from the anchor-point in which this entity considers itself to have reached the anchor point. This is to prevent the entity from bouncing back and forth trying to reach a specific spot. |
| `height_above_target_range` | Range [a, b] | [0, 0] | The number of blocks above the target that the next anchor point can be set. This value is used only when the entity is tracking a target. |
| `height_adjustment_chance` | Decimal | 0.002857 | Percent chance to determine how often to increase or decrease the current height around the anchor point. 1 = 100%. "height_change_chance" is deprecated and has been replaced with "height_adjustment_chance". |
| `height_offset_range` | Range [a, b] | [0, 0] | Vertical distance from the anchor point this entity must stay within, upon a successful height adjustment. |
| `radius_adjustment_chance` | Decimal | 0.004 | Percent chance to determine how often to increase the size of the current movement radius around the anchor point. 1 = 100%. "radius_change_chance" is deprecated and has been replaced with "radius_adjustment_chance". |
| `radius_change` | Decimal | 1.0 | The number of blocks to increase the current movement radius by, upon successful "radius_adjustment_chance". If the current radius increases over the range maximum, the current radius will be set back to the range minimum and the entity will change between clo |
| `radius_range` | Range [a, b] | [5, 15] | Horizontal distance from the anchor point this entity must stay within upon a successful radius adjustment. |
| `speed_multiplier` | Decimal | 1.0 | Multiplies the speed at which this entity travels to its next desired position. |

### `minecraft:behavior.swoop_attack`

Allows an entity to attack using swoop attack behavior; Ideal for use with flying mobs. The behavior ends if the entity has a horizontal collision or gets hit.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `damage_reach` | Decimal | 0.2 | Added to the base size of the entity, to determine the target's maximum allowable distance, when trying to deal attack damage. |
| `delay_range` | Range [a, b] | [10, 20] | Minimum and maximum cooldown time-range (in seconds) between each attempted swoop attack. |
| `speed_multiplier` | Decimal | 1 | During swoop attack behavior, this determines the multiplier the entity's speed is modified by when moving toward the target. |

### `minecraft:behavior.summon_entity`

Allows the mob to attack the player by summoning other entities.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `summon_choices` | List | List of spells for the mob to use to summon entities. Each spell has the following parameters: | Name |
| `Type` | Default Value | Description | cast_duration |
| `Decimal` | Total delay of the steps | Time in seconds the spell casting will take | cooldown_time |
| `Decimal` | 0.0 | Time in seconds the mob has to wait before using the spell again | do_casting |
| `Boolean` | true | If true, the mob will do the casting animations and render spell particles | filters |
| `Minecraft Filter` | max_activation_range | Decimal | 32.0 |
| `Upper bound of the activation distance in blocks for this spell, must not be negative.` | min_activation_range | Decimal | 1.0 |
| `Lower bound of the activation distance in blocks for this spell, must not be negative.` | particle_color | Integer | 0 |
| `The color of the particles for this spell` | sequence | List | List of steps for the spell. Each step has the following parameters: |
| `Name` | Type | Default Value | Description |
| `base_delay` | Decimal | 0.0 | Amount of time in seconds to wait before this step starts |
| `delay_per_summon` | Decimal | 0.0 | Amount of time in seconds before each entity is summoned in this step |
| `entity_lifespan` | Decimal | -1.0 | Amount of time in seconds that the spawned entity will be alive for. A value of -1.0 means it will remain alive for as long as it can |
| `entity_type` | String | The entity type of the entities we will spawn in this step | num_entities_spawned |
| `Integer` | 1 | Number of entities that will be spawned in this step | shape |
| `String` | line | The base shape of this step. Valid values are circle and line | size |
| `Decimal` | 1.0 | The base size of the entity | sound_event |
| `String` | The sound event to play for this step | summon_cap | Integer |
| `0` | Maximum number of summoned entities at any given time | summon_cap_radius | Decimal |
| `0.0` | summon_event | String | Event to invoke on each summoned entity on spawn |
| `target` | String | self | The target of the spell. This is where the spell will start (line will start here, circle will be centered here) |
| `start_sound_event` | String | The sound event to play when using this spell | weight |
| `Decimal` | 0.0 | The weight of this spell. Controls how likely the mob is to choose this spell when casting one | <p id="minecraft:behavior.swell" |

### `minecraft:behavior.send_event`

Allows the mob to send an event to another mob.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `cast_duration` | Decimal | Total delay of the steps | Time in seconds for the entire event sending process |
| `look_at_target` | Boolean | true | If true, the mob will face the entity it sends an event to |
| `sequence` | List | List of events to send | Name |
| `Type` | Default Value | Description | base_delay |
| `Decimal` | 0.0 | Amount of time in seconds before starting this step | event |
| `String` | The event to send to the entity | sound_event | String |

### `minecraft:behavior.timer_flag_1`

Fires an event when this behavior starts, then waits for a duration before stopping. When stopping due to that timeout or due to being interrupted by another behavior, fires another event. query.timer_flag_1 will return 1.0 on both the client and server when this behavior is running, and 0.0 otherwise.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `cooldown_range` | Range [a, b] | [0, 0] | Goal cooldown range in seconds. If specified, the cooldown will have to elapse even before the goal can be selected for the first time. |
| `duration_range` | Range [a, b] | [0, 0] | Goal duration range in seconds. |
| `on_end` | Trigger | Event(s) to run when the goal ends. | on_start |

### `minecraft:behavior.knockback_roar`

Allows the mob to perform a damaging knockback that affects all nearby entities.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_time` | Decimal | 0.5 | The delay after which the knockback occurs (in seconds). |
| `cooldown_time` | Decimal | 0.1 | Time (in seconds) the mob has to wait before using the goal again. |
| `damage_filters` | Minecraft Filter | The list of conditions another entity must meet to be a valid target to apply damage to. | duration |
| `Decimal` | 1.0 | The max duration of the roar (in seconds). | knockback_damage |
| `Integer` | 6 | The damage dealt by the knockback roar. | knockback_filters |
| `Minecraft Filter` | The list of conditions another entity must meet to be a valid target to apply knockback to. | knockback_height_cap | Decimal |
| `0.40` | The maximum height for vertical knockback. | knockback_horizontal_strength | Integer |
| `4` | The strength of the horizontal knockback. | knockback_range | Integer |
| `4` | The radius (in blocks) of the knockback effect. | knockback_vertical_strength | Integer |
| `4` | The strength of the vertical knockback. | on_roar_end | Trigger |

### `minecraft:behavior.stomp_attack`

Allows an entity to attack using stomp AoE damage behavior.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `attack_once` | Boolean | false | Allows the entity to use this attack behavior, only once EVER. |
| `attack_types` | String | N/A | Defines the entity types this entity will attack. |
| `can_spread_on_fire` | Boolean | false | If the entity is on fire, this allows the entity's target to catch on fire after being hit. |
| `cooldown_time` | Decimal | 1 | Cooldown time (in seconds) between attacks. |
| `inner_boundary_time_increase` | Decimal | 0.25 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_inner_boundary". |
| `max_path_time` | Decimal | 0.55 | Maximum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `min_path_time` | Decimal | 0.2 | Minimum base time (in seconds) to recalculate new attack path to target (before increases applied). |
| `no_damage_range_multiplier` | Decimal | 2 | Multiplied with the final AoE damage range to determine a no damage range. The stomp attack will go on cooldown if target is in this no damage range. |
| `on_attack` | Trigger | N/A | Defines the event to trigger when this entity successfully attacks. |
| `on_kill` | Trigger | N/A | Defines the event to trigger when this entity kills the target. |
| `outer_boundary_time_increase` | Decimal | 0.5 | Time (in seconds) to add to attack path recalculation when the target is beyond the "path_outer_boundary". |
| `path_fail_time_increase` | Decimal | 0.75 | Time (in seconds) to add to attack path recalculation when this entity cannot move along the current path. |
| `path_inner_boundary` | Decimal | 16 | Distance at which to increase attack path recalculation by "inner_boundary_tick_increase". |
| `path_outer_boundary` | Decimal | 32 | Distance at which to increase attack path recalculation by "outer_boundary_tick_increase". |
| `random_stop_interval` | Integer | 0 | This entity will have a 1 in N chance to stop it's current attack, where N = "random_stop_interval". |
| `reach_multiplier` | Decimal | 2 | Used with the base size of the entity to determine minimum target-distance before trying to deal attack damage. |
| `require_complete_path` | Boolean | false | Toggles (on/off) the need to have a full path from the entity to the target when using this melee attack behavior. |
| `speed_multiplier` | Decimal | 1 | This multiplier modifies the attacking entity's speed when moving toward the target. |
| `stomp_range_multiplier` | Decimal | 2 | Multiplied with the base size of the entity to determine stomp AoE damage range. |
| `track_target` | Boolean | false | Allows the entity to track the attack target, even if the entity has no sensing. |
| `x_max_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the X-axis, this entity can rotate while trying to look at the target. |
| `y_max_head_rotation` | Decimal | 30 | Maximum rotation (in degrees), on the Y-axis, this entity can rotate its head while trying to look at the target. |

### `minecraft:behavior.slime_attack`

Causes the entity to grow tired every once in a while, while attacking.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `set_persistent` | Boolean | false | Allows the actor to be set to persist upon targeting a player |
| `speed_multiplier` | Decimal | 1 | During attack behavior, this multiplier modifies the entity's speed when moving toward the target. |
| `x_max_rotation` | Decimal | 10 | Maximum rotation (in degrees), on the X-axis, this entity can rotate while trying to look at the target. |
| `y_max_rotation` | Decimal | 10 | Maximum rotation (in degrees), on the Y-axis, this entity can rotate while trying to look at the target. |

### `minecraft:behavior.slime_float`

Allow slimes to float in water / lava. Can only be used by Slime and Magma Cubes.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `jump_chance_percentage` | Decimal | 0.8 | Percent chance a slime or magma cube has to jump while in water / lava. |
| `speed_multiplier` | Decimal | 1.2 | Determines the multiplier the entity's speed is modified by when moving through water / lava. |

### `minecraft:behavior.slime_keep_on_jumping`

Allows the entity to continuously jump around like a slime.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `speed_multiplier` | Decimal | 1 | Determines the multiplier this entity's speed is modified by when jumping around. |

### `minecraft:behavior.slime_random_direction`

Allows the entity to move in random directions like a slime.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `add_random_time_range` | Integer | 3 | Additional time (in whole seconds), chosen randomly in the range of [0, "add_random_time_range"], to add to "min_change_direction_time". |
| `min_change_direction_time` | Decimal | 2 | Constant minimum time (in seconds) to wait before choosing a new direction. |
| `turn_range` | Integer | 360 | Maximum rotation angle range (in degrees) when randomly choosing a new direction. |

### `minecraft:behavior.random_stroll`

Allows a mob to randomly stroll around.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `interval` | Integer | 120 | A random value to determine when to randomly move somewhere. This has a 1/interval chance to choose this goal |
| `speed_multiplier` | Decimal | 1.0 | Movement speed multiplier of the mob when using this AI Goal |
| `xz_dist` | Integer | 10 | Distance in blocks on ground that the mob will look for a new spot to move to. Must be at least 1 |
| `y_dist` | Integer | 7 | Distance in blocks that the mob will look up or down for a new spot to move to. Must be at least 1 |

### `minecraft:behavior.float`

Allows the mob to stay afloat while swimming. Passengers will be kicked out the moment the mob's head goes underwater, which may not happen for tall mobs.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `chance_per_tick_to_float` | Decimal | 0.8 | The chance per tick to cause an upward impulse. |
| `sink_with_passengers` | Boolean | false | If true, the mob will keep sinking as long as it has passengers. |
| `time_under_water_to_dismount_passengers` | Decimal | 0.0 | Time in seconds that a floating vehicles head can be underwater before it causes its passengers to dismount. |

### `minecraft:behavior.random_look_around`

Allows the mob to randomly look around.

| 値 | 型 | 既定 | 説明 |
| --- | --- | --- | --- |
| `look_time` | Range [a, b] | [2, 4] | The range of time in seconds the mob will stay looking in a random direction before looking elsewhere |
| `max_angle_of_view_horizontal` | Integer | 30 | The rightmost angle a mob can look at on the horizontal plane with respect to its initial facing direction. |
| `min_angle_of_view_horizontal` | Integer | -30 | The leftmost angle a mob can look at on the horizontal plane with respect to its initial facing direction. |

### `minecraft:behavior.equip_item`

The entity puts on the desired equipment.

