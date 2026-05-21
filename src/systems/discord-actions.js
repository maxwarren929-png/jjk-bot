// Discord Action Dispatcher
// Maps technique discord_actions to actual Discord API calls

const {
  addReaction, removeReaction,
  pinMessage, unpinMessage,
  editReply, sendWebhook,
  setSlowmode, renameChannel, setChannelTopic,
  moderateMember,
  createThread, deleteChannel,
  assignRole, createTemporaryRole,
  setNickname, dmUser,
  createPoll,
  disconnectVoice, disconnectAllVoice, pullAllVoice,
  reactRandom, addMultipleReactions,
  searchMessageHistory,
  createTempChannel,
  bulkDeleteSlow,
  dodgeCheck,
} = require('./discord-utils');

function getMember(guild, userId) {
  return guild?.members?.cache?.get(userId) || null;
}

async function executeDiscordAction(action, ctx) {
  if (!action || !ctx) return false;
  const { interaction, actor, target, channel, guild } = ctx;
  if (!channel && interaction?.channel) ctx.channel = interaction.channel;
  if (!guild && interaction?.guild) ctx.guild = interaction.guild;

  const ch = ctx.channel || channel;
  const g = ctx.guild || guild;

  try {
    switch (action.type) {
      case 'react':
        return await addReaction(interaction?.message || interaction, action.emoji);

      case 'react_random':
        return await reactRandom(interaction?.message, action.count || 3);

      case 'unreact_all':
        return await removeReaction(interaction?.message);

      case 'pin':
        return await pinMessage(interaction?.message);

      case 'unpin':
        return await unpinMessage(interaction?.message);

      case 'webhook':
        return await sendWebhook(ch, { name: action.name || 'Cursed Spirit', content: action.content || '' });

      case 'typing':
        if (!ch) return false;
        try {
          await ch.sendTyping();
          if (action.duration) setTimeout(() => ch.sendTyping().catch(() => {}), action.duration * 1000);
        } catch { /* ok */ }
        return true;

      case 'edit_reply':
        return await editReply(interaction, action.content);

      case 'slowmode':
        if (!ch) return false;
        await setSlowmode(ch, action.seconds);
        if (action.duration && typeof action.duration === 'number') {
          setTimeout(async () => {
            try { await setSlowmode(ch, 0); } catch { /* ok */ }
          }, action.duration * 1000);
        }
        return true;

      case 'set_topic':
        return await setChannelTopic(ch, action.topic);

      case 'rename':
        return await renameChannel(ch, action.name, action.duration || 15000);

      case 'bulk_delete': {
        if (!ch) return false;
        let excludeId = null;
        try {
          const reply = await interaction.fetchReply();
          if (reply?.id) excludeId = reply.id;
        } catch { /* no reply yet */ }
        if (action.slow) {
          const deleted = await bulkDeleteSlow(ch, action.count || 10, 1000, excludeId);
          return deleted > 0;
        }
        const msgs = await ch.messages.fetch({ limit: (action.count || 10) + 1 });
        const toDelete = excludeId ? msgs.filter(m => m.id !== excludeId).first(action.count || 10) : msgs.first(action.count || 10);
        if (toDelete.length > 0) {
          try { await ch.bulkDelete(toDelete); return true; } catch { return false; }
        }
        return false;
      }

      case 'timeout': {
        const member = getMember(g, target?.discord_id || target?.id);
        if (!member) return false;
        return await moderateMember(member, 'timeout', (action.duration || 10) * 1000);
      }

      case 'mute': {
        const member = getMember(g, target?.discord_id || target?.id);
        if (!member) return false;
        return await moderateMember(member, 'mute', (action.duration || 60) * 1000);
      }

      case 'thread_create':
        return await createThread(ch, action.name || 'Thread', action.duration || 5);

      case 'thread_archive':
        if (!ch?.isThread?.()) return false;
        try { await ch.setArchived(true); return true; } catch { return false; }

      case 'role_add': {
        const member = getMember(g, target?.discord_id || target?.id);
        if (!member || !g) return false;
        const role = await createTemporaryRole(g, action.name || 'Role', action.color, action.duration);
        if (!role) return false;
        return await assignRole(member, role, action.duration);
      }

      case 'set_nickname': {
        const member = getMember(g, target?.discord_id || target?.id);
        if (!member) return false;
        return await setNickname(member, action.nickname || 'Transfigured');
      }

      case 'poll':
        return await createPoll(ch, action.question, action.duration || 60, action.options || ['Yes', 'No']);

      case 'disconnect_all_voice': {
        const vc = g?.members?.cache?.get(actor?.discord_id || actor?.id)?.voice?.channel;
        if (!vc) return false;
        return await disconnectAllVoice(vc);
      }

      case 'pull_all_voice': {
        const vc = g?.members?.cache?.get(actor?.discord_id || actor?.id)?.voice?.channel;
        if (!vc) return false;
        return await pullAllVoice(g, vc);
      }

      case 'search_history':
        return await searchMessageHistory(ch, action.word, target?.discord_id || target?.id);

      case 'fly_away': {
        const { setFlying } = require('./fly-state');
        const id = actor?.discord_id || actor?.id;
        if (!id) return false;
        setFlying(id, action.duration || 30 * 60 * 1000);
        return true;
      }

      case 'thread_trap': {
        const thread = await createThread(ch, action.name || `🐸 Inside the Toad — ${target?.username}`, 1);
        if (!thread) return false;
        const member = getMember(g, target?.discord_id || target?.id);
        if (member) {
          try { await thread.members.add(member); } catch { /* ok */ }
        }
        setTimeout(async () => {
          try { await thread.setArchived(true); } catch { /* ok */ }
        }, 20000);
        return true;
      }

      case 'dodge_check': {
        const tUser = interaction?.options?.getUser?.('target') || target?.user || target;
        return await dodgeCheck(ch, tUser, action.duration || 2000);
      }

      case 'create_temp_channel': {
        const created = await createTempChannel(g, action.name, action.duration);
        return !!created;
      }

      case 'dm_user':
        return await dmUser(target?.user || target, action.content);

      case 'change_all_nicknames': {
        if (!g) return false;
        for (const [, m] of g.members.cache) {
          try { await m.setNickname(action.nickname || '❓', 'Technique effect'); } catch { /* skip */ }
          await new Promise(r => setTimeout(r, 250));
        }
        return true;
      }

      case 'dm_everyone': {
        if (!g) return false;
        for (const [, m] of g.members.cache) {
          try { await m.send(action.content || ''); } catch { /* skip */ }
          await new Promise(r => setTimeout(r, 250));
        }
        return true;
      }

      case 'boss_spawn': {
        const { spawnMahoraga } = require('./mahoraga-boss');
        return await spawnMahoraga(actor, target, ch?.id);
      }

      case 'technique_lock': {
        const { lockTechnique } = require('./technique-locker');
        const id = target?.discord_id || target?.id;
        if (!id) return false;
        const techId = action.techniqueId || target?.innate_technique_id;
        if (!techId) return false;
        lockTechnique(id, techId, action.duration || 172800000);
        return true;
      }

      default:
        return false;
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] Discord action error:`, e);
    return false;
  }
}

async function executeDiscordActions(actions, ctx) {
  if (!actions) return;
  const arr = Array.isArray(actions) ? actions : [actions];
  for (const act of arr) {
    if (act) await executeDiscordAction(act, ctx);
  }
}

module.exports = { executeDiscordAction, executeDiscordActions };
