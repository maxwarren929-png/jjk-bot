# Plan: JJK-Only Techniques with Discord Actions

## Key Changes Summary
- **Red:** `disconnect_all_voice` — kicks everyone out of VC
- **Blue:** `pull_all_voice` — pulls all VC users to same channel
- **Divine Dogs:** `search_history: { word, target }` — glorified Ctrl+F in chat
- **Nue:** `fly_away: 30m` — immunity but no actions for 30 min
- **Toad:** `thread_trap: 🐸 Inside the Toad — [target]` — private thread for 20s, target locked in, archived mid-sentence, target loses turn
- **Removed:** Max Elephant, Rabbit Escape
- **Mahoraga:** Boss mechanic — 2000 HP pool, 1 day to kill or target dies, anyone can assist, 3 day cooldown, all CE consumed
- **Flowing Red Scale:** 8 wins, +20 dmg next 3 techs, role auto-deletes 30s, 20-30 dmg, 35 CE
- **New: Piercing Blood:** 2s dodge check button prompt
- **Cursed Speech rework:** 3 branches — Don't Move (slowmode 10s), Explode (bulk delete 10 messages + 55 dmg), Sleep (timeout 60s + DM)
- **New: Malevolent Shrine:** Creates temp channel, 10 dmg/5s for 20s

## Techniques Structure

### Innate Trees

| Innate | Branches | Total |
|--------|----------|-------|
| Limitless | Infinity, Blue, Red, Hollow Purple | 5 |
| Ten Shadows | Nue, Toad, Great Serpent, Mahoraga | 5 |
| Blood Manipulation | Flowing Red Scale, Piercing Blood | 3 |
| Cursed Speech | Don't Move, Explode, Sleep | 4 |
| Idle Transfiguration | Body Repel, Soul Distortion, Instant Spirit Body, Countless Piercing, Transfigured Army, Self-Embodiment of Perfection | 7 |
| Deadly Sentencing | Confiscation, Death Penalty, Domain: Deadly Sentencing | 4 |
| Straw Doll | Resonance | 2 |
| Shrine (Dismantle) | Cleave, Malevolent Shrine | 3 |

### Individual Innates (7, no branches)
Boogie Woogie, Ratio, Puppet Manipulation, Disaster Flames, Disaster Plants, Projection Sorcery, Star Rage

### Standalone (14)
Cursed Spirit Manipulation, Sky Manipulation, Granite Blast, Mythical Beast Amber, Comedian, Deadly Sentencing, Construction, Love Rendezvous, Jacob's Ladder, Disaster Tides, Ice Formation, RCT, Rot Technique, Black Bird Manipulation

## Discord Actions Needed

New actions to implement in `discord-actions.js`:
- `disconnect_all_voice` — disconnectEveryone() in voice channel
- `pull_all_voice` — fetch all voice members, move to target channel
- `search_history` — search channel messages for {word, target}
- `fly_away` — set a 30min state on the user (immunity, no actions)
- `thread_trap` — create thread, add target, after 20s archive it
- `dodge_check` — send a message with a button, 2s collector
- `boss_spawn` — create Mahoraga boss entity with 2000 HP, 24h timer
- `create_temp_channel` — create channel, schedule auto-delete
- `dm_user` — send a DM to a user
- `bulk_delete_slow` — delete messages one by one with delay
- `timeout` — timeout member (already in utils, needs to be added)
- `mute` — server mute (already in utils)

## Service Changes Needed

**New service: `mahoraga-boss.js`**
- Manages Mahoraga boss state (2000 HP, aggro tracking, assists, 24h timer)
- On death: rewards all participants
- On timeout: target dies
- 3 day cooldown per player

**New service: `fly-state.js`**
- Tracks which users are flying (immune, can't act)
- 30 min auto-expire
- Blocks all command execution while active

**Combat changes:**
- `applyTechnique` now accepts `interaction` param
- After effect resolution, `executeDiscordAction(tech.discord_action, interaction, actor, target)` is called
- Discord actions are fire-and-forget (fail gracefully)
