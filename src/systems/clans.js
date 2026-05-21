const { db, sqlite } = require('../db/index');
const { clans, clan_members, clan_invites, players } = require('../db/schema');
const { eq, and } = require('drizzle-orm');

const CLAN_COST = 500;
const PASSIVE_COST = 2000;
const PASSIVE_OPTIONS = ['CE_REGEN', 'YEN_BOOST', 'DAMAGE_BOOST', 'DEATH_REDUCTION'];

function getClan(clanId) {
  return db.select().from(clans).where(eq(clans.id, clanId)).get();
}

function getPlayerClanBonus(playerId) {
  const member = getMembership(playerId);
  if (!member) return null;
  const clan = getClan(member.clan_id);
  return clan ? clan.passive_bonus : null;
}

function getClanByName(name) {
  return db.select().from(clans).where(eq(clans.name, name)).get();
}

function getMembership(playerId) {
  return db.select().from(clan_members).where(eq(clan_members.player_id, playerId)).get();
}

function getMembers(clanId) {
  return db.select().from(clan_members).where(eq(clan_members.clan_id, clanId)).all();
}

function createClan(player, name) {
  if (getMembership(player.discord_id)) return { error: 'You are already in a clan.' };
  if (getClanByName(name)) return { error: 'A clan with that name already exists.' };

  const passive = PASSIVE_OPTIONS[Math.floor(Math.random() * PASSIVE_OPTIONS.length)];
  let result;
  sqlite.transaction(() => {
    const freshPlayer = db.select().from(players).where(eq(players.discord_id, player.discord_id)).get();
    if (!freshPlayer || freshPlayer.yen < CLAN_COST) return;
    result = db.insert(clans).values({
      name,
      owner_id: player.discord_id,
      passive_bonus: passive,
      created_at: Date.now(),
    }).returning().get();

    db.insert(clan_members).values({
      clan_id: result.id,
      player_id: player.discord_id,
      role: 'Leader',
      joined_at: Date.now(),
    }).run();

    db.update(players).set({ yen: freshPlayer.yen - CLAN_COST, clan_id: result.id })
      .where(eq(players.discord_id, player.discord_id)).run();
  })();

  return { ok: true, clan: result };
}

function inviteToClan(leader, inviteeId) {
  const membership = getMembership(leader.discord_id);
  if (!membership || membership.role !== 'Leader') return { error: 'You are not a clan leader.' };
  const clan = getClan(membership.clan_id);
  const members = getMembers(clan.id);
  const limit = clan.member_limit || 20;
  if (members.length >= limit) return { error: 'Clan is full.' };

  db.insert(clan_invites).values({
    clan_id: clan.id,
    invitee_id: inviteeId,
    invited_by: leader.discord_id,
    created_at: Date.now(),
  }).run();

  return { ok: true, clan };
}

function joinClan(player, clanName) {
  if (getMembership(player.discord_id)) return { error: 'You are already in a clan.' };
  const clan = getClanByName(clanName);
  if (!clan) return { error: 'Clan not found.' };

  const hasInvite = db.select().from(clan_invites)
    .where(and(eq(clan_invites.clan_id, clan.id), eq(clan_invites.invitee_id, player.discord_id)))
    .get();

  if (clan.invite_only && !hasInvite) return { error: 'This clan is invite-only.' };

  sqlite.transaction(() => {
    db.insert(clan_members).values({
      clan_id: clan.id,
      player_id: player.discord_id,
      role: 'Member',
      joined_at: Date.now(),
    }).run();

    db.update(players).set({ clan_id: clan.id })
      .where(eq(players.discord_id, player.discord_id)).run();

    if (hasInvite) {
      db.delete(clan_invites)
        .where(and(eq(clan_invites.clan_id, clan.id), eq(clan_invites.invitee_id, player.discord_id)))
        .run();
    }
  })();

  return { ok: true, clan };
}

function leaveClan(player) {
  const membership = getMembership(player.discord_id);
  if (!membership) return { error: 'You are not in a clan.' };
  if (membership.role === 'Leader') return { error: 'Transfer leadership before leaving.' };

  sqlite.transaction(() => {
    db.delete(clan_members)
      .where(and(eq(clan_members.clan_id, membership.clan_id), eq(clan_members.player_id, player.discord_id)))
      .run();

    db.update(players).set({ clan_id: null })
      .where(eq(players.discord_id, player.discord_id)).run();
  })();

  return { ok: true };
}

function renameClan(leader, newName) {
  const membership = getMembership(leader.discord_id);
  if (!membership || membership.role !== 'Leader') return { error: 'You are not a clan leader.' };
  if (newName.length < 2 || newName.length > 32) return { error: 'Clan name must be 2–32 characters.' };
  if (getClanByName(newName)) return { error: 'A clan with that name already exists.' };

  const clan = getClan(membership.clan_id);
  db.update(clans).set({ name: newName }).where(eq(clans.id, clan.id)).run();
  return { ok: true, oldName: clan.name, newName };
}

function disbandClan(leader) {
  const membership = getMembership(leader.discord_id);
  if (!membership || membership.role !== 'Leader') return { error: 'You are not a clan leader.' };
  const clan = getClan(membership.clan_id);

  const members = getMembers(clan.id);
  sqlite.transaction(() => {
    db.delete(clan_invites).where(eq(clan_invites.clan_id, clan.id)).run();
    for (const m of members) {
      db.update(players).set({ clan_id: null }).where(eq(players.discord_id, m.player_id)).run();
    }
    db.delete(clan_members).where(eq(clan_members.clan_id, clan.id)).run();
    db.delete(clans).where(eq(clans.id, clan.id)).run();
  })();

  return { ok: true, name: clan.name };
}

function kickFromClan(leader, targetId) {
  const membership = getMembership(leader.discord_id);
  if (!membership || membership.role !== 'Leader') return { error: 'You are not a clan leader.' };
  if (targetId === leader.discord_id) return { error: 'You cannot kick yourself.' };

  const targetMembership = getMembership(targetId);
  if (!targetMembership || targetMembership.clan_id !== membership.clan_id) {
    return { error: 'Target player is not in your clan.' };
  }
  if (targetMembership.role === 'Leader') return { error: 'Cannot kick the clan leader. Transfer leadership first.' };

  const clan = getClan(membership.clan_id);
  sqlite.transaction(() => {
    db.delete(clan_members)
      .where(and(eq(clan_members.clan_id, clan.id), eq(clan_members.player_id, targetId)))
      .run();
    db.update(players).set({ clan_id: null })
      .where(eq(players.discord_id, targetId)).run();
  })();

  return { ok: true, clan, targetId };
}

function transferLeadership(leader, targetId) {
  const membership = getMembership(leader.discord_id);
  if (!membership || membership.role !== 'Leader') return { error: 'You are not a clan leader.' };
  if (targetId === leader.discord_id) return { error: 'You cannot transfer leadership to yourself.' };

  const targetMembership = getMembership(targetId);
  if (!targetMembership || targetMembership.clan_id !== membership.clan_id) {
    return { error: 'Target player is not in your clan.' };
  }

  const clan = getClan(membership.clan_id);
  sqlite.transaction(() => {
    db.update(clan_members).set({ role: 'Member' })
      .where(and(eq(clan_members.clan_id, clan.id), eq(clan_members.player_id, leader.discord_id)))
      .run();
    db.update(clan_members).set({ role: 'Leader' })
      .where(and(eq(clan_members.clan_id, clan.id), eq(clan_members.player_id, targetId)))
      .run();
    db.update(clans).set({ owner_id: targetId }).where(eq(clans.id, clan.id)).run();
  })();

  return { ok: true, clan };
}

function getPendingInvites(clanId) {
  return db.select().from(clan_invites).where(eq(clan_invites.clan_id, clanId)).all();
}

function setPassive(leader, passiveId) {
  const membership = getMembership(leader.discord_id);
  if (!membership || membership.role !== 'Leader') return { error: 'You are not a clan leader.' };
  if (!PASSIVE_OPTIONS.includes(passiveId)) return { error: 'Invalid passive bonus.' };
  const clan = getClan(membership.clan_id);
  if (clan.passive_bonus === passiveId) return { error: `Your clan already has **${passiveId}** as its passive.` };
  let result;
  sqlite.transaction(() => {
    const fresh = db.select().from(players).where(eq(players.discord_id, leader.discord_id)).get();
    if (!fresh || fresh.yen < PASSIVE_COST) { result = { error: `Not enough yen. Need **${PASSIVE_COST} 💰**, have **${(fresh?.yen || 0).toLocaleString()} 💰**.` }; return; }
    db.update(players).set({ yen: fresh.yen - PASSIVE_COST }).where(eq(players.discord_id, leader.discord_id)).run();
    db.update(clans).set({ passive_bonus: passiveId }).where(eq(clans.id, clan.id)).run();
    result = { ok: true, oldPassive: clan.passive_bonus, newPassive: passiveId };
  })();
  return result;
}

module.exports = { getClan, getClanByName, getMembership, getMembers, createClan, inviteToClan, joinClan, leaveClan, transferLeadership, kickFromClan, renameClan, disbandClan, getPlayerClanBonus, getPendingInvites, setPassive, PASSIVE_OPTIONS, PASSIVE_COST };
