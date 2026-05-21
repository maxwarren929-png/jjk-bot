const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
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
      .addUserOption(o => o.setName('target').setDescription('Who to cancel bounties on').setRequired(true))),

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
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'list') {
      const bounties = listBounties();
      if (bounties.length === 0) return interaction.editReply('❌ No active bounties.');

      const sorted = bounties.sort((a, b) => b.total - a.total);
      const embed = new EmbedBuilder()
        .setTitle(`💰 Active Bounties (${bounties.length})`)
        .setColor(0xF1C40F)
        .setDescription(sorted.map(b => `<@${b.targetId}> — **${b.total.toLocaleString()} 💰**`).join('\n'));
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
  },
};
