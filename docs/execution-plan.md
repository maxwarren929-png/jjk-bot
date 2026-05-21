# Execution Plan

## Issues Found During Review

### ISSUE 1: Mahoraga Targeting
**Problem:** `/use` requires a Discord user target (@mention). Mahoraga isn't a user.
**Fix:** When Mahoraga is active in a channel, any technique used in that channel that targets the Mahoraga summoner gets redirected to Mahoraga instead. `/use technique @summoner` → hits Mahoraga if active.

### ISSUE 2: Confiscation UX
**Problem:** Confiscation lets you pick a *target's* technique to lock. Autocomplete only shows the user's own techs.
**Fix:** Confiscation is a separate interaction flow — `/use confiscation @target` triggers a follow-up dropdown showing the target's techniques.

### ISSUE 3: Death Penalty Innate Removal
**Problem:** Permanently removing an innate technique requires schema changes — the DB has no "innate removed" field.
**Fix:** Add `innate_removed BOOLEAN DEFAULT false` to players table. If true, the player has no innate assigned and must use only branch/standalone techniques.

### ISSUE 4: Multiple Discord Actions
**Problem:** Some techniques (Self-Embodiment, Mahoraga) need to do many things in sequence. A single `discord_action` object is insufficient.
**Fix:** Use `discord_actions: []` array. Executed in order. Each action awaits the previous.

### ISSUE 5: Nue Fly State
**Problem:** Blocks multiple commands (use, shop, buy). Need centralized check.
**Fix:** Create `fly-state.js` with `isFlying()` check. Add a middleware-like check in `use.js` and shop commands. Fly state stores: `expiresAt`, auto-clears after 30m.

### ISSUE 6: Dodge Button Collector
**Problem:** The `/use` command uses `deferReply()` → `editReply()`. Adding a button requires a different flow.
**Fix:** For dodge_check techniques, send the initial embed as a regular reply (not deferred), then follow up with button message. On button click, edit the original response.

---

## Phased Execution

### Phase 1: Foundation
**Goal:** No new systems yet. Just prep work.

**Step 1 — Expand `discord-utils.js`**
Add these exports:
- `pinMessage(message)` / `unpinMessage(message)`
- `editReply(interaction, content)`
- `renameChannel(channel, name, revertAfterMs)`
- `setChannelTopic(channel, topic)`
- `disconnectVoice(member)` / `disconnectAllVoice(channel)`
- `pullAllVoice(sourceChannel, targetChannel)`
- `reactRandom(message, count)` / `addMultipleReactions(message, emojis)`
- `searchMessageHistory(channel, word, targetUser)` — fetches messages, finds first match
- `createTempChannel(guild, name, deleteAfterMs)`
- `deleteChannel(channel)`
- `dmUser(user, content)`
- `bulkDeleteSlow(channel, count, delayMs)` — deletes messages one by one
- `setNickname(member, nickname)`
- `dodgeCheck(msgOrChannel, targetUser, durationMs)` — sends button, awaits click
- `createTemporaryRole(guild, name, color, deleteAfterMs)`

**Step 2 — Create `src/systems/discord-actions.js`**
Single exported function:
```
executeDiscordAction(action, { interaction, actor, target, channel, guild })
```
Supports array via `discord_actions` — iterate and execute each sequentially.

Action type map — all wrapped in try/catch, always fails silently:
| Type | Action |
|------|--------|
| `react` | `addReaction(interaction.message, action.emoji)` |
| `react_random` | `reactRandom(interaction.message, action.count)` |
| `unreact_all` | `removeReaction(interaction.message)` |
| `pin` | `pinMessage(interaction.message)` |
| `unpin` | `unpinMessage(targetLastMessage)` |
| `webhook` | `sendWebhook(channel, { name, avatar, content })` |
| `typing` | `interaction.channel.sendTyping()` + setTimeout |
| `edit_reply` | `editReply(interaction, action.content)` |
| `slowmode` | `setSlowmode(channel, action.seconds)`, revert after duration |
| `set_topic` | `setChannelTopic(channel, action.topic)` |
| `rename` | `renameChannel(channel, action.name, action.durationMs)` |
| `bulk_delete` | Fast: `channel.bulkDelete(count)`. Slow: `bulkDeleteSlow()` |
| `timeout` | `moderateMember(target, 'timeout', durationMs)` |
| `mute` | `moderateMember(target, 'mute', durationMs)` |
| `thread_create` | `createThread(channel, name, durationMinutes)` |
| `thread_archive` | Fetch thread, archive it |
| `role_add` | `assignRole(target, role, durationMs)` |
| `set_nickname` | `setNickname(target, action.nickname)` |
| `poll` | `createPoll(channel, question, duration, options)` |
| `disconnect_all_voice` | `disconnectAllVoice(actor.voice.channel)` |
| `pull_all_voice` | `pullAllVoice(guild, actor.voice.channel)` |
| `search_history` | `searchMessageHistory(channel, word, targetUser)` |
| `fly_away` | Register in fly state system, send confirmation |
| `thread_trap` | Create thread, add target member, archive after 20s |
| `dodge_check` | `dodgeCheck(channel, target.member, 2000)` |
| `create_temp_channel` | `createTempChannel(guild, name, deleteAfterMs)` |
| `dm_user` | `dmUser(target.user, action.content)` |
| `change_all_nicknames` | Iterate guild members, call `setNickname()` on each |
| `dm_everyone` | Iterate guild members, call `dmUser()` on each |

---

### Phase 2: Wire Combat

**Step 3 — Update `combat.js`**
- Change signature: `applyTechnique(actor, target, techniqueId, interaction = null)`
- After effects resolve + db persist, if `interaction`:
  ```js
  const actions = tech.discord_actions || (tech.discord_action ? [tech.discord_action] : []);
  for (const act of actions) {
    await executeDiscordAction(act, { interaction, actor, target, channel, guild });
  }
  ```
- Return a ctx object containing channel/guild for embed building

**Step 4 — Update `use.js`**
- Call `applyTechnique(actor, target, techniqueId, interaction)`
- Add fly check at top: `if (isFlying(discordId)) return reply 'You are flying...'`
- Add mahoraga redirect: if boss active in channel and target is the summoner, redirect damage to boss

---

### Phase 3: Technique Data

**Step 5 — Rewrite `src/data/techniques.js`**
All 53 techniques with proper `effects`, `discord_actions` array, correct cooldowns.

Cooldown conversion:
| Doc | Seconds |
|-----|---------|
| 10s | 10 |
| 15s | 15 |
| 18s | 18 |
| 20s | 20 |
| 25s | 25 |
| 30s | 30 |
| 35s | 35 |
| 40s | 40 |
| 1m | 60 |
| 5m | 300 |
| 10m | 600 |
| 20m | 1200 |
| 30m | 1800 |
| 45m | 2700 |
| 1h | 3600 |
| 2d | 172800 |
| 24h | 86400 |
| 72h | 259200 |
| 96h | 345600 |

---

### Phase 4: Systems

**Step 6 — Create `src/systems/fly-state.js`**
```js
const flying = new Map(); // discordId -> expiresAt

function setFlying(discordId, durationMs = 30 * 60 * 1000)
function isFlying(discordId) // checks + auto-expires stale
function getFlyTimeLeft(discordId) // ms remaining
```
Set interval to clean stale entries every 60s.

**Step 7 — Create `src/systems/mahoraga-boss.js`**
```js
const bosses = new Map(); // channelId -> { hp:2000, maxHp:2000, targetId, summonerId, expiresAt, aggro:Set }

function spawnMahoraga(summonerId, targetId, channelId) // 2000 HP, 24h timer
function getBoss(channelId)
function attackBoss(channelId, attackerId, damage) // returns { killed, aggroed, bossHp }
function checkExpired() // interval every 60s
```
On kill: reward all participants, target survives.
On expire: target is broken, loses all CE.
Aggro: if someone attacks, Mahoraga targets them next.

**Step 8 — Create `src/systems/technique-locker.js`**
```js
const locked = new Map(); // `${targetId}:${techniqueId}` -> expiresAt

function lockTechnique(targetId, techniqueId, durationMs = 172800000)
function isTechniqueLocked(targetId, techniqueId)
```
Check in `combat.js` before allowing technique use.

---

### Phase 5: Cleanup

**Step 9 — Update profile/inventory**
- Remove dead technique references from `profile.js`
- Remove from `inventory.js`
- Update `INNATE_POOL` in `techniques.js`

**Step 10 — DB Schema**
- Add `innate_removed BOOLEAN DEFAULT false` to players table
- Run migration

---

## File Inventory

| File | Size | Action |
|------|------|--------|
| `src/systems/discord-utils.js` | ~190 lines | Add ~15 functions |
| `src/systems/discord-actions.js` | NEW | ~150 lines dispatcher |
| `src/systems/combat.js` | ~200 lines | Add interaction param + actions loop |
| `src/commands/use.js` | ~80 lines | Pass interaction, add fly/mahoraga checks |
| `src/data/techniques.js` | ~840 lines | Full rewrite |
| `src/systems/fly-state.js` | NEW | ~40 lines |
| `src/systems/mahoraga-boss.js` | NEW | ~90 lines |
| `src/systems/technique-locker.js` | NEW | ~30 lines |
| `src/systems/effects.js` | ~400 lines | No changes needed |
| `src/events/interactionCreate.js` | ~60 lines | No changes needed |
| `src/index.js` | ~70 lines | May need mahoraga interval |
