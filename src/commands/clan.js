const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { createClan, inviteToClan, joinClan, leaveClan, getClanByName, getMembership, getMembers, getClan, transferLeadership } = require('../systems/clans');

const PASSIVE_DESC = {
  CE_REGEN:        '+10% CE regeneration per tick',
  YEN_BOOST:       '+10% yen earned from fights',
  DAMAGE_BOOST:    '+5% damage on all attacks',
  DEATH_REDUCTION: '-10% yen penalty on death',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('Clan management.')
    .addSubcommand(sub => sub.setName('create').setDescription('Create a new clan (costs 500 yen)')
      .addStringOption(o => o.setName('name').setDescription('Clan name').setRequired(true)))
    .addSubcommand(sub => sub.setName('invite').setDescription('Invite a player to your clan')
      .addUserOption(o => o.setName('user').setDescription('Player to invite').setRequired(true)))
    .addSubcommand(sub => sub.setName('join').setDescription('Join an open clan or accept an invite')
      .addStringOption(o => o.setName('name').setDescription('Clan name').setRequired(true)))
    .addSubcommand(sub => sub.setName('info').setDescription('View clan info')
      .addStringOption(o => o.setName('name').setDescription('Clan name').setRequired(true)))
    .addSubcommand(sub => sub.setName('leave').setDescription('Leave your current clan'))
    .addSubcommand(sub => sub.setName('transfer').setDescription('Transfer clan leadership to another member')
      .addUserOption(o => o.setName('user').setDescription('New leader').setRequired(true))),

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();

    if (!player && sub !== 'info') {
      await interaction.editReply('❌ Run `/profile` first.'); return;
    }

    if (sub === 'create') {
      const name = interaction.options.getString('name').trim();
      if (name.length < 2 || name.length > 32) {
        await interaction.editReply('❌ Clan name must be 2–32 characters.'); return;
      }
      const result = createClan(player, name);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      const embed = new EmbedBuilder().setTitle(`⚔️ Clan Created: ${result.clan.name}`)
        .setColor(0x3498DB)
        .addFields(
          { name: 'Passive Bonus', value: PASSIVE_DESC[result.clan.passive_bonus] || result.clan.passive_bonus, inline: true },
          { name: 'Leader', value: interaction.user.username, inline: true },
        );
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'invite') {
      const target = interaction.options.getUser('user');
      const result = inviteToClan(player, target.id);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply(`✅ Invited **${target.username}** to **${result.clan.name}**. They can run \`/clan join ${result.clan.name}\` to accept.`);

    } else if (sub === 'join') {
      const name = interaction.options.getString('name').trim();
      const result = joinClan(player, name);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply(`✅ You joined **${result.clan.name}**!`);

    } else if (sub === 'info') {
      const name = interaction.options.getString('name').trim();
      const clan = getClanByName(name);
      if (!clan) { await interaction.editReply('❌ Clan not found.'); return; }
      const members = getMembers(clan.id);
      const leader = members.find(m => m.role === 'Leader');
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${clan.name}`)
        .setColor(0x3498DB)
        .addFields(
          { name: 'Leader', value: leader ? `<@${leader.player_id}>` : 'Unknown', inline: true },
          { name: 'Members', value: `${members.length}/${clan.member_limit}`, inline: true },
          { name: 'Passive Bonus', value: PASSIVE_DESC[clan.passive_bonus] || clan.passive_bonus, inline: true },
          { name: 'Invite Only', value: clan.invite_only ? 'Yes' : 'No', inline: true },
        );
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'leave') {
      const result = leaveClan(player);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply('✅ You have left your clan.');
    } else if (sub === 'transfer') {
      const target = interaction.options.getUser('user');
      const result = transferLeadership(player, target.id);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply(`✅ Transferred clan leadership to **${target.username}**.`);
    }
  },
};
