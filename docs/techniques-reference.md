# Cursed Energy Bot — Unified Technique Reference

> All canon JJK techniques. Every technique has a **Discord action** — something visible on Discord, not just abstract damage. **Total: 53 techniques.**

**Legend:** ⬛ Innate (assigned on `/profile`)  |  ◇ Branch (requires parent)  |  ○ Standalone (unlockable)

---

## Innate Pool (15 ⬛)

One is randomly assigned when you run `/profile`. Each innate has a tree of branch techniques to unlock.

---

### ⬛ Limitless `limitless`
| | |
|---|---|
| **Type** | Defensive |
| **CE Cost** | 30 |
| **Cooldown** | 10s |
| **Effect** | The neutral state — nothing touches you. Gain immunity to slowmode effects and nullify the next cursed technique used against you. |
| **Discord** | Passive immunity to slowmode + nullifies hostile technique effects |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Infinity** `infinity` | Limitless | Defensive | 25 | 20s | 0 | `slowmode: 3s, 20s` |
| **Blue** `limitless_blue` | Limitless (choice) | Offensive | 40 | 30m | 35–55 | `pull_all_voice:` everyone in VC pulled to one channel |
| **Red** `limitless_red` | Limitless (choice) | Offensive | 50 | 1h | 50–75 | `disconnect_all_voice:` kicks everyone out of VC |
| **Hollow Purple** `hollow_purple` | Blue + Red | Offensive | 90 | 2d | 100–140 | `bulk_delete: 100` + edit reply "Erased." |

---

### ⬛ Ten Shadows `ten_shadows`
| | |
|---|---|
| **Type** | Summon |
| **CE Cost** | 30 |
| **Cooldown** | 1m |
| **Damage** | 20–40 |
| **Effect** | Divine Dogs track the target. Given a word and a target, finds an instance of when that target said the word (channel search). |
| **Discord** | `search_message_history: { word, target }` |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Nue** `nue` | 5 wins | Utility | 40 | 0s* | 0 | `fly_away:` 30 min immunity — cannot attack, buy, or act |
| **Toad** `toad` | 3 wins | Utility | 25 | 30m | 0 | `thread_trap: 🐸 Inside the Toad — [target]` — locks target in private thread for 20s, then archives it. Target loses their turn. |
| **Great Serpent** `great_serpent` | 10 wins | Offensive | 45 | 1h | 40–60 | `webhook:` serpent emerges from earth |
| **Mahoraga** `mahoraga` | 50 wins | Boss | 150 | 72h | 120–180 | Spawns raid boss. See Boss section below. |

*\*Nue: 30 minute duration, not a traditional cooldown. Cannot be used while flying.*

**Removed:** Rabbit Escape, Max Elephant — no longer in the tree.

---

### ⬛ Blood Manipulation `blood_manipulation`
| | |
|---|---|
| **Type** | Offensive |
| **CE Cost** | 45 |
| **Cooldown** | 15s |
| **Damage** | 40–60 |
| **Effect** | Convergence: compress and fire blood as a piercing spike. Applies BLEED. |
| **Discord** | `react: 🩸` |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Flowing Red Scale** `flowing_red_scale` | 8 wins | Defensive | 35 | 20s | 20–30 | `role_add: 🩸 Red Scale (crimson), 30s` — +20 dmg next 3 techs |
| **Piercing Blood** `piercing_blood` | 5 wins | Offensive | 40 | 20m | 30 (<2s) | `dodge_check:` 2s button prompt. If they click Dodge, 0 damage. Otherwise 30 damage. |

---

### ⬛ Cursed Speech `cursed_speech`
| | |
|---|---|
| **Type** | Utility |
| **CE Cost** | 40 |
| **Cooldown** | 20s |
| **Effect** | Words become weapons. Choose one of three commands: |
| **Discord** | — |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Don't Move** `dont_move` | Cursed Speech | Utility | 25 | 10m | 0 | `slowmode: 10s` |
| **Explode** `explode` | Cursed Speech | Offensive | 45 | 20m | 55 | `bulk_delete: 10 (target only), slowly` |
| **Sleep** `sleep` | Cursed Speech | Utility | 35 | 1h | 0 | `timeout: 60s` + DM target "your eyes are heavy, you can't fight it" |

---

### ⬛ Straw Doll Technique `straw_doll`
| | |
|---|---|
| **Type** | Utility |
| **CE Cost** | 25 |
| **Cooldown** | 15s |
| **Damage** | 10–20 |
| **Effect** | Nail a straw doll to link to the target. Exposes them — next hit deals +30%. |
| **Discord** | `react: 🔨` on target's last message |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Resonance** `resonance` | Straw Doll | Offensive | 40 | 20s | 35–55 | `react: 💥` + removes prior 🔨 (bonus if present) |

---

### ⬛ Shrine (Dismantle) `dismantle`
| | |
|---|---|
| **Type** | Offensive |
| **CE Cost** | 55 |
| **Cooldown** | 45m |
| **Damage** | 60–85 |
| **Effect** | Invisible slashes that shred everything. Mass damage, removes all reactions, slowly deletes last 20 messages. |
| **Discord** | `bulk_delete: 20, slowly` + `unreact_all` |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Cleave** `cleave` | Dismantle | Offensive | 60 | 1h | 70–100 | `timeout: 10s` |
| **Malevolent Shrine** `malevolent_shrine` | Dismantle | Offensive | 80 | 2d | 10/5s | Creates temp channel "malevolent-shrine", target takes 10 dmg every 5s for 20s, channel auto-deletes |

---

### ⬛ Individual Innates (no branches)

**Boogie Woogie `boogie_woogie`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Utility | 30 | 15s | 15–25 | Swap positions. Confuses target (50% miss). | `react: 🔄` |

**Ratio Technique `hairpin`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Offensive | 60 | 25s | 70–90 | Strike 0.7 ratio. Ignores 40% dmg reduction. | `react: ⚔️` + edit "7:3 ratio" |

**Puppet Manipulation `puppet_manipulation`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Summon | 55 | 20s | 45–65 | Cursed puppet mirrors your attacks. | `webhook:` puppet mimic |

**Disaster Flames `disaster_flames`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Offensive | 50 | 20s | 45–65 | Volcanic fire. Applies BURN (8/tick). | `slowmode: 5s, 20s` + `react: 🔥` |

**Disaster Plants `disaster_plants`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Offensive | 45 | 20s | 35–55 | Cursed vines root the enemy. Applies FREEZE. | `slowmode: 20s` + `set_topic: "Rooted"` |

### ⬛ Idle Transfiguration `idle_transfiguration`
| | |
|---|---|
| **Type** | Offensive |
| **CE Cost** | 70 |
| **Cooldown** | 10m |
| **Damage** | 65–90 |
| **Effect** | Reshape the soul. Bypasses shields. Changes target's nickname and marks them Transfigured. |
| **Discord** | `set_nickname:` + `role_add: "Transfigured"` |

**Mahito Tree:**

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Body Repel** `body_repel` | 5 wins | Utility | 40 | 20m | 35–50 | If in VC: disconnect + DM "your body moved on its own". If not: move to 💀 Transfigured VC then eject + DM. If no VC: just DM. Applies CONFUSE (50% self-hit) |
| **Soul Distortion** `soul_distortion` | 8 wins | Offensive | 55 | 20m | 45–65 | `role_add: 👤 Distorted` to target — pale sickly color. While active, all healing on target is reversed (heals = damage) |
| **Instant Spirit Body** `instant_spirit_body` | 12 wins | Offensive | 65 | 30m | 60–80 | `webhook:` mimics target's username/avatar, sends "wrong." then delivers the hit |
| **Countless Piercing Transfigurations** `countless_piercing` | 18 wins | Offensive | 80 | 10m | 80–105 | Sends 10 rapid DMs over 10s (corrupted messages), then delivers hit. Applies BLEED + FEAR |
| **Transfigured Army** `transfigured_army` | 25 wins | Offensive | 95 | 5m | 90–120 | Creates 5 webhooks of corrupted random usernames, all post simultaneously, then all delete |
| **Self-Embodiment of Perfection** `self_embodiment` | 50 wins | Domain | 160 | 2d | 140–180 | Creates channel 👁️・self-embodiment. Changes EVERY online member's nickname to corrupted unicode. DMs every online member "your soul has been touched by Mahito." Assigns target role 💀 Reshaped (0 perms, 30s). Nicknames revert after 3m. Channel deletes after 5m. |

### ⬛ Individual Innates (no branches)

**Projection Sorcery `projection_sorcery`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Offensive | 35 | 15s | 30–50 | 1/24s speed. Double strike (70% second). | `react: ⚡⚡` |

**Star Rage `star_rage`**
| Type | CE | CD | Dmg | Effect | Discord |
|------|----|----|-----|--------|---------|
| Offensive | 55 | 25s | 50–75 | Virtual mass strikes. +20% dmg for 30s. | `role_add: "Mass" (yellow), 30s` |

---

### ⬛ Deadly Sentencing `deadly_sentencing`
| | |
|---|---|
| **Type** | Offensive |
| **CE Cost** | 70 |
| **Cooldown** | 10m |
| **Damage** | 50–80 |
| **Effect** | The courtroom domain begins the trial. Target is charged. |
| **Discord** | — |

| ◇ Branch | Unlock | Type | CE | CD | Dmg | Discord Action |
|----------|--------|------|----|----|-----|---------------|
| **Confiscation** `confiscation` | 5 wins | Utility | 50 | 24h | 0 | User picks a target technique — bot blocks any use of it for 2 days. Attempts get silently deleted. |
| **Death Penalty** `death_penalty` | 15 wins | Offensive | 100 | 24h | 95–125 | Public ping: "⚖️ [user] has sentenced [target] to death." Timeouts target 60s, assigns 💀 Sentenced (0 perms, 60s). Target permanently loses their innate technique. |
| **Domain: Deadly Sentencing** `deadly_sentencing_domain` | 50 wins | Domain | 150 | 96h | Instant KO | Creates channel ⚖️・deadly-sentencing. Posts trial embed (Defendant, Judge, Charge, Verdict: GUILTY). Runs 1-day poll "Does [target] deserve mercy?". Majority NO = target instantly loses all HP. Majority YES = nothing. Channel deletes after 1 day. DMs verdict. |

---

## Boss Mechanic: Mahoraga

Mahoraga is a raid-boss summon. When used:

- **Mahoraga's HP:** 2000
- **Duration:** 1 day (24 hours)
- **Win condition:** Target must deal 2000 damage to Mahoraga within 24 hours, or they **die** (Broken, full CE loss)
- **Assist:** Anyone in the server can use techniques on Mahoraga to help kill it
- **Aggro:** If you attack Mahoraga, it will target you on its next turn
- **Cost:** All of the user's cursed energy is consumed on summon
- **Cooldown:** 3 days (72 hours)
- **Optional:** A second Discord bot named "Mahoraga" can be spawned that joins the server

---

## Standalone Techniques (13 ○)

No innate parent. Unlock through wins, events, or game master.

| ID | Technique | Type | CE | CD | Dmg | Discord Action |
|----|-----------|------|----|----|-----|---------------|
| `cursed_spirit_manipulation` | **Cursed Spirit Manipulation** | Summon | 50 | 20s | 40–60 | `webhook:` cursed spirit |
| `sky_manipulation` | **Sky Manipulation** | Offensive | 45 | 20s | 40–60 | `rename:` channel name 15s |
| `granite_blast` | **Granite Blast** | Offensive | 65 | 25s | 60–90 | `slowmode: 10s, 15s` + `react: 💥` |
| `mythical_beast_amber` | **Mythical Beast Amber** | Offensive | 80 | 40s | 75–110 | `react: ⚡⚡⚡` + `typing: 3s` |
| `comedian` | **Comedian** | Utility | 35 | 30s | 20–40 | `webhook:` random funny line |
| `construction` | **Construction** | Offensive | 50 | 25s | 40–65 | `role_add:` temp item role, 30s |
| `love_rendezvous` | **Love Rendezvous** | Utility | 30 | 20s | 15–25 | `pin:` own message (star mark) |
| `jacobs_ladder` | **Jacob's Ladder** | Utility | 60 | 35s | 40–60 | `unreact_all` + `slowmode: 0` |
| `disaster_tides` | **Disaster Tides** | Offensive | 50 | 20s | 40–60 | `react: 🌊` + `thread_create:` water prison |
| `ice_formation` | **Ice Formation** | Offensive | 50 | 25s | 45–70 | `slowmode: 15s, 20s` |
| `rct` | **Reverse Cursed Technique** | Utility | 60 | 30s | 0 | `typing: 3s` (green glow heal) |
| `rot_technique` | **Rot Technique** | Offensive | 35 | 18s | 30–50 | `react: 🦠` |
| `black_bird_manipulation` | **Black Bird Manipulation** | Offensive | 35 | 15s | 30–50 | `webhook:` bird strike |

---

## All Discord Action Types

| Type | What it does | Permission |
|------|-------------|------------|
| `react: { emoji }` | Adds reaction to use-message | — |
| `react_random: { count }` | Adds N random emojis | — |
| `unreact_all` | Removes all reactions | Manage Messages |
| `pin` | Pins the use-message | Manage Messages |
| `unpin` | Unpins target's last pinned | Manage Messages |
| `webhook: { name, content }` | Sends webhook message | Manage Webhooks |
| `typing: { duration }` | Shows typing indicator | — |
| `edit_reply: { content }` | Edits the bot's response | — |
| `slowmode: { seconds, duration }` | Sets channel slowmode | Manage Channels |
| `set_topic: { topic }` | Changes channel topic | Manage Channels |
| `rename: { name, duration }` | Renames channel temporarily | Manage Channels |
| `bulk_delete: { count, slow }` | Deletes N messages | Manage Messages |
| `timeout: { duration }` | Timeouts the target | Moderate Members |
| `mute: { duration }` | Server-mutes in voice | Mute Members |
| `thread_create: { name, duration }` | Creates temp thread | Manage Threads |
| `thread_archive` | Archives the current thread | Manage Threads |
| `role_add: { name, color, duration }` | Creates temp role + assigns | Manage Roles |
| `set_nickname: { nickname }` | Changes target's nickname | Manage Nicknames |
| `poll: { question, options }` | Creates a poll | — |
| `disconnect_all_voice` | Kicks everyone out of voice | Move Members |
| `pull_all_voice: { channel }` | Pulls all to same VC | Move Members |
| `search_history: { word, target }` | Searches for when target said a word | Read History |
| `fly_away: { duration }` | Gives 30 min immunity, blocks actions | — |
| `thread_trap: { name, duration, target }` | Locks target in temp thread | Manage Threads |
| `dodge_check: { duration, damage }` | 2s button prompt to dodge | — |
| `boss_spawn: { hp, duration }` | Spawns Mahoraga raid boss | — |
| `create_temp_channel: { name, duration }` | Creates temp channel, auto-deletes | Manage Channels |
| `dm_user: { content }` | DMs the target user | — |

---

## Effect System Reference

### Phases
| Phase | When it fires |
|---|---|
| `onUse` | Before damage (shields, buffs, heals, statuses) |
| `onHit` | During damage (damage, multi-hit, conditional bonus) |
| `onTurnEnd` | End of each turn (DoT ticks) |
| `onFightEnd` | When a fight concludes |

### Built-in Effects
| Effect | Phase | Description |
|---|---|---|
| `damage` | onHit | Deal min–max damage |
| `multi_hit` | onHit | Hit multiple times |
| `apply_status` | onHit | Apply status to target |
| `remove_status` | onUse | Remove status from self |
| `shield` | onUse | Add shield to self |
| `power_up` | onUse | Buff next N attacks |
| `nullify` | onUse | Nullify next enemy technique |
| `cooldown_reset` | onUse | Reset cooldowns (self/enemy) |
| `cooldown_extend` | onUse | Extend enemy cooldowns |
| `heal` | onUse | Restore HP (self/target) |
| `ce_drain` | onUse | Drain CE from enemy to self |
| `ce_restore` | onUse | Restore CE (self/target) |
| `skip_turn` | onUse | Enemy skips next action |
| `confuse` | onUse | Applies CONFUSE |
| `expose` | onUse | Expose target (+30% next damage) |
| `conditional_bonus` | onHit | Bonus if condition met |
| `dot_tick` | onTurnEnd | Damage-over-time tick |
| `aoe` | onHit | Splash damage to others |
| `reflect` | onUse | Damage reflect for N turns |
