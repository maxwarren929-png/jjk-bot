// Discord API interaction helpers for techniques
// These are safe-to-call wrappers — they catch failures gracefully

async function addReaction(message, emoji) {
  if (!message) return false;
  try {
    await message.react(emoji);
    return true;
  } catch {
    return false;
  }
}

async function removeReaction(message, emoji, user) {
  if (!message) return false;
  try {
    if (user) await message.reactions.cache.get(emoji)?.users.remove(user);
    else await message.reactions.removeAll();
    return true;
  } catch {
    return false;
  }
}

function countReactions(message) {
  if (!message?.reactions) return 0;
  return message.reactions.cache.reduce((sum, r) => sum + r.count, 0);
}

async function createThread(channel, name, durationMinutes = 5) {
  if (!channel) return null;
  try {
    const thread = await channel.threads.create({
      name,
      autoArchiveDuration: 60,
      reason: 'Technique effect',
    });
    setTimeout(async () => {
      try { await thread.delete(); } catch { /* ok */ }
    }, durationMinutes * 60 * 1000);
    return thread;
  } catch {
    return null;
  }
}

async function moderateMember(member, action, durationMs) {
  if (!member?.moderatable) return false;
  try {
    if (action === 'timeout') {
      await member.timeout(durationMs, 'Technique effect');
      return true;
    }
    if (action === 'deafen') {
      if (member.voice?.channel) {
        await member.voice.setDeaf(true, 'Technique effect');
        setTimeout(() => member.voice.setDeaf(false).catch(() => {}), durationMs);
        return true;
      }
    }
    if (action === 'mute') {
      if (member.voice?.channel) {
        await member.voice.setMute(true, 'Technique effect');
        setTimeout(() => member.voice.setMute(false).catch(() => {}), durationMs);
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

async function assignRole(member, role, durationMs) {
  if (!member?.roles) return false;
  try {
    await member.roles.add(role);
    if (durationMs) {
      setTimeout(async () => {
        try { await member.roles.remove(role); } catch { /* ok */ }
      }, durationMs);
    }
    return true;
  } catch {
    return false;
  }
}

async function removeRole(member, role) {
  if (!member?.roles) return false;
  try {
    await member.roles.remove(role);
    return true;
  } catch {
    return false;
  }
}

async function sendWebhook(channel, options) {
  if (!channel) return null;
  try {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(w => w.name === 'CE Bot');
    if (!webhook) {
      webhook = await channel.createWebhook({ name: 'CE Bot' });
    }
    await webhook.send({ content: options.content, username: options.name || options.username || 'Cursed Spirit' });
    return true;
  } catch {
    return false;
  }
}

async function createPoll(channel, question, duration, options) {
  if (!channel) return null;
  try {
    const poll = await channel.send({
      poll: {
        question: { text: question },
        answers: options.map(o => ({ text: o })),
        duration,
      },
    });
    return poll;
  } catch {
    return null;
  }
}

function getHighestRoleColor(member) {
  if (!member?.roles) return null;
  const colored = member.roles.cache
    .filter(r => r.color !== 0)
    .sort((a, b) => b.position - a.position);
  return colored.first()?.color || null;
}

function getRolePosition(member) {
  if (!member?.roles) return 0;
  return member.roles.highest?.position || 0;
}

async function setSlowmode(channel, seconds) {
  if (!channel?.setRateLimitPerUser) return false;
  try {
    await channel.setRateLimitPerUser(seconds, 'Technique effect');
    return true;
  } catch {
    return false;
  }
}

async function moveVoiceMember(member, channel) {
  if (!member?.voice) return false;
  try {
    await member.voice.setChannel(channel);
    return true;
  } catch {
    return false;
  }
}

async function sendEphemeral(interaction, content) {
  if (!interaction) return;
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, ephemeral: true });
    } else {
      await interaction.reply({ content, ephemeral: true });
    }
  } catch { /* ok */ }
}

// ── NEW HELPERS ─────────────────────────────────────────────────────────────

async function pinMessage(message) {
  if (!message?.pin) return false;
  try { await message.pin(); return true; } catch { return false; }
}

async function unpinMessage(message) {
  if (!message?.unpin) return false;
  try { await message.unpin(); return true; } catch { return false; }
}

async function editReply(interaction, content) {
  if (!interaction) return false;
  try { await interaction.editReply(content); return true; } catch { return false; }
}

async function renameChannel(channel, name, durationMs) {
  if (!channel?.edit) return false;
  try {
    const original = channel.name;
    await channel.edit({ name, reason: 'Technique effect' });
    if (durationMs) {
      setTimeout(async () => {
        try { await channel.edit({ name: original }); } catch { /* ok */ }
      }, durationMs);
    }
    return true;
  } catch { return false; }
}

async function setChannelTopic(channel, topic) {
  if (!channel?.edit) return false;
  try { await channel.edit({ topic, reason: 'Technique effect' }); return true; } catch { return false; }
}

async function disconnectVoice(member) {
  if (!member?.voice?.channel) return false;
  try { await member.voice.disconnect(); return true; } catch { return false; }
}

async function disconnectAllVoice(channel) {
  if (!channel?.members) return false;
  try {
    for (const [, m] of channel.members) {
      try { await m.voice.disconnect(); } catch { /* skip */ }
    }
    return true;
  } catch { return false; }
}

async function pullAllVoice(guild, targetChannel) {
  if (!guild) return false;
  try {
    for (const [, member] of guild.members.cache) {
      if (member.voice?.channel && member.voice.channel !== targetChannel) {
        try { await member.voice.setChannel(targetChannel); } catch { /* skip */ }
      }
    }
    return true;
  } catch { return false; }
}

async function reactRandom(message, count = 3) {
  if (!message) return false;
  const pool = ['🔥', '⚡', '💀', '👁️', '🌀', '💥', '🩸', '🌊', '🦠', '🔮'];
  try {
    for (let i = 0; i < count; i++) {
      const emoji = pool[Math.floor(Math.random() * pool.length)];
      try { await message.react(emoji); } catch { /* skip */ }
    }
    return true;
  } catch { return false; }
}

async function addMultipleReactions(message, emojis) {
  if (!message || !emojis?.length) return false;
  try {
    for (const emoji of emojis) {
      try { await message.react(emoji); } catch { /* skip */ }
    }
    return true;
  } catch { return false; }
}

async function searchMessageHistory(channel, word, targetUserId) {
  if (!channel || !word) return null;
  try {
    let found = null;
    let lastId;
    for (let i = 0; i < 5; i++) {
      const options = { limit: 100, ...(lastId ? { before: lastId } : {}) };
      const messages = await channel.messages.fetch(options);
      if (messages.size === 0) break;
      const match = messages.find(m =>
        m.author.id === targetUserId && m.content.toLowerCase().includes(word.toLowerCase())
      );
      if (match) { found = match; break; }
      lastId = messages.last().id;
    }
    return found;
  } catch { return null; }
}

async function createTempChannel(guild, name, deleteAfterMs) {
  if (!guild) return null;
  try {
    const channel = await guild.channels.create({ name, reason: 'Technique effect' });
    if (deleteAfterMs) {
      setTimeout(async () => {
        try { await channel.delete(); } catch { /* ok */ }
      }, deleteAfterMs);
    }
    return channel;
  } catch { return null; }
}

async function deleteChannel(channel) {
  if (!channel?.delete) return false;
  try { await channel.delete(); return true; } catch { return false; }
}

async function dmUser(user, content) {
  if (!user) return false;
  try {
    await user.send(content);
    return true;
  } catch { return false; }
}

async function bulkDeleteSlow(channel, count, delayMs = 1000, excludeId = null) {
  if (!channel?.messages) return false;
  try {
    let deleted = 0;
    for (let i = 0; i < count; i++) {
      const msgs = await channel.messages.fetch({ limit: 1 });
      const msg = msgs.first();
      if (!msg || msg.id === excludeId) break;
      try { await msg.delete(); deleted++; } catch { break; }
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
    }
    return deleted;
  } catch { return false; }
}

async function setNickname(member, nickname) {
  if (!member?.setNickname) return false;
  try { await member.setNickname(nickname, 'Technique effect'); return true; } catch { return false; }
}

async function createTemporaryRole(guild, name, color, deleteAfterMs) {
  if (!guild) return null;
  try {
    const role = await guild.roles.create({
      name, color: color || null, reason: 'Technique effect',
      permissions: [],
    });
    if (deleteAfterMs) {
      setTimeout(async () => {
        try { await role.delete(); } catch { /* ok */ }
      }, deleteAfterMs);
    }
    return role;
  } catch { return null; }
}

async function dodgeCheck(channel, targetUser, durationMs = 2000) {
  if (!channel) return false;
  try {
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dodge').setLabel('Dodge').setStyle(ButtonStyle.Primary),
    );
    const msg = await channel.send({ content: `⚠️ **DODGE!** Press within ${durationMs / 1000}s to avoid damage!`, components: [row] });
    const filter = i => i.customId === 'dodge' && i.user.id === targetUser.id;
    try {
      await msg.awaitMessageComponent({ filter, time: durationMs });
      await msg.edit({ content: '✅ **Dodged!** No damage taken.', components: [] });
      return true;
    } catch {
      await msg.edit({ content: '💥 **Failed to dodge!**', components: [] });
      return false;
    }
  } catch { return false; }
}

module.exports = {
  addReaction,
  removeReaction,
  countReactions,
  createThread,
  moderateMember,
  assignRole,
  removeRole,
  sendWebhook,
  createPoll,
  getHighestRoleColor,
  getRolePosition,
  setSlowmode,
  moveVoiceMember,
  sendEphemeral,
  pinMessage,
  unpinMessage,
  editReply,
  renameChannel,
  setChannelTopic,
  disconnectVoice,
  disconnectAllVoice,
  pullAllVoice,
  reactRandom,
  addMultipleReactions,
  searchMessageHistory,
  createTempChannel,
  deleteChannel,
  dmUser,
  bulkDeleteSlow,
  setNickname,
  createTemporaryRole,
  dodgeCheck,
};
