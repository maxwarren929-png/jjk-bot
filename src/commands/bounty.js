const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players, bounties } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { placeBounty, listBounties, cancelBounties } = require('../systems/bounties');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('bounty')
    .setDescription('Place or view bounties on players.')
    .addSubcommand(sub => sub
      .setName('place')
      .setDescription('Place a bounty on a player (reward paid from your wallet).')
      .addUserOption(o => o.setName('target').setDescription('Who to place the bounty on').setRequired(true))
      .addIntegerOption(o => o.setName('amount').setDescription('Bounty amount').setRequired(true).setMinValue(50)))
    .addSubcommand(sub => sub.setName('list').setDescription('List all active bounties.'))
    .addSubcommand(sub => sub
      .setName('cancel')
      .setDescription('Cancel all your bounties on a target (refunded to your wallet).')
      .addUserOption(o => o.setName('target').setDescription('Who to cancel bounties on').setRequired(true)))
    .addSubcommand(sub => sub.setName('check').setDescription('Check if anyone has placed bounties on you'))
    .addSubcommand(sub => sub.setName('top').setDescription('View the highest individual bounties.'))
    .addSubcommand(sub => sub.setName('placed').setDescription('View all bounties placed by a specific player')
      .addUserOption(o => o.setName('user').setDescription('The player who placed the bounties').setRequired(true)))
    .addSubcommand(sub => sub.setName('target').setDescription('View all bounties on a specific player')
      .addUserOption(o => o.setName('user').setDescription('The target player').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();

    if (sub === 'place') {
      const targetUser = interaction.options.getUser('target');
      const amount = interaction.options.getInteger('amount');
      const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      if (!player) return interaction.editReply('❌ Run `/profile` first.');

      const result = placeBounty(interaction.user.id, targetUser.id, amount);
      if (result.error) return interaction.editReply(`❌ ${result.error}`);

      const embed = new EmbedBuilder()
        .setTitle('💰 Bounty Placed')
        .setColor(0xE74C3C)
        .setDescription(`**${result.amount} 💰** bounty placed on **${result.targetName}**`)
        .addFields(
          { name: 'Placed By', value: interaction.user.username, inline: true },
          { name: 'Amount', value: `${result.amount} 💰`, inline: true },
        );
      const bTarget = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
      const bJob = (() => { try { return JSON.parse(bTarget?.job_data || '{}'); } catch { return {}; } })();
      const bPrefs = bJob.__notifications || {};
      if (bPrefs.bounty !== false) {
        targetUser.send(`☠️ A bounty of **${result.amount} 💰** has been placed on you by **${interaction.user.username}**!`).catch(() => {});
      }
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const bounties = listBounties();
      if (bounties.length === 0) return interaction.editReply('❌ No active bounties.');

      const sorted = bounties.sort((a, b) => b.total - a.total);
      const all = db.select().from(bounties).all();
      const countMap = {};
      for (const b of all) {
        countMap[b.target_id] = (countMap[b.target_id] || 0) + 1;
      }
      const embed = new EmbedBuilder()
        .setTitle(`💰 Active Bounties (${bounties.length} targets)`)
        .setColor(0xF1C40F)
        .setDescription(sorted.map(b => `<@${b.targetId}> — **${b.total.toLocaleString()} 💰** (${countMap[b.targetId] || 0} bounty${(countMap[b.targetId] || 0) !== 1 ? 'ies' : 'y'})`).join('\n'));
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'cancel') {
      const targetUser = interaction.options.getUser('target');
      const result = cancelBounties(interaction.user.id, targetUser.id);
      if (result.error) return interaction.editReply(`❌ ${result.error}`);

      const embed = new EmbedBuilder()
        .setTitle('💰 Bounties Cancelled')
        .setColor(0x2ECC71)
        .setDescription(`Cancelled **${result.count}** bounty/bounties on **${targetUser.username}** — refunded **${result.total} 💰**`);
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'check') {
      const myBounties = db.select().from(bounties).where(eq(bounties.target_id, interaction.user.id)).all();
      if (myBounties.length === 0) return interaction.editReply('✅ No bounties on you. You\'re safe... for now.');
      const total = myBounties.reduce((sum, b) => sum + b.amount, 0);
      const byPlacer = {};
      for (const b of myBounties) {
        if (!byPlacer[b.placed_by_id]) byPlacer[b.placed_by_id] = 0;
        byPlacer[b.placed_by_id] += b.amount;
      }
      const placerList = Object.entries(byPlacer).map(([id, amt]) => `<@${id}> — **${amt.toLocaleString()} 💰**`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('🎯 Active Bounties on You')
        .setColor(0xE74C3C)
        .setDescription(`**${myBounties.length}** bounty/bounties totalling **${total.toLocaleString()} 💰**`)
        .addFields(
          { name: '👤 Hunters', value: placerList, inline: false },
          { name: '⚠️ Warning', value: 'If someone defeats you, your killer collects.', inline: false },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'top') {
      const all = db.select().from(bounties).all();
      if (all.length === 0) return interaction.editReply('❌ No bounties have been placed yet.');
      const sorted = all.sort((a, b) => b.amount - a.amount).slice(0, 10);
      const embed = new EmbedBuilder()
        .setTitle('🏆 Top Bounties')
        .setColor(0xF1C40F)
        .setDescription(sorted.map((b, i) =>
          `${i + 1}. <@${b.target_id}> — **${b.amount.toLocaleString()} 💰** (by <@${b.placed_by_id}>)`
        ).join('\n'));
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'placed') {
      const targetUser = interaction.options.getUser('user');
      const theirBounties = db.select().from(bounties).where(eq(bounties.placed_by_id, targetUser.id)).all();
      if (theirBounties.length === 0) return interaction.editReply(`❌ **${targetUser.username}** hasn't placed any bounties.`);
      const total = theirBounties.reduce((sum, b) => sum + b.amount, 0);
      const embed = new EmbedBuilder()
        .setTitle(`💰 Bounties Placed by ${targetUser.username}`)
        .setColor(0xF1C40F)
        .setDescription(theirBounties.map((b, i) =>
          `${i + 1}. <@${b.target_id}> — **${b.amount.toLocaleString()} 💰**`
        ).join('\n'))
        .setFooter({ text: `Total: ${total.toLocaleString()} 💰 across ${theirBounties.length} bounty/bounties` });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'target') {
      const targetUser = interaction.options.getUser('user');
      const targetBounties = db.select().from(bounties).where(eq(bounties.target_id, targetUser.id)).all();
      if (targetBounties.length === 0) return interaction.editReply(`✅ No bounties on **${targetUser.username}**.`);
      const total = targetBounties.reduce((sum, b) => sum + b.amount, 0);
      const embed = new EmbedBuilder()
        .setTitle(`🎯 Bounties on ${targetUser.username}`)
        .setColor(0xE74C3C)
        .setDescription(targetBounties.map((b, i) =>
          `${i + 1}. **${b.amount.toLocaleString()} 💰** — placed by <@${b.placed_by_id}> <t:${Math.floor(b.created_at / 1000)}:R>`
        ).join('\n'))
        .setFooter({ text: `Total: ${total.toLocaleString()} 💰 across ${targetBounties.length} bounty/bounties` });
      return interaction.editReply({ embeds: [embed] });
    }
  },
};
