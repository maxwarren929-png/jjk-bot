const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db } = require('../db/index');
const { players, clans: clansTable, clan_members } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { createClan, inviteToClan, joinClan, leaveClan, getClanByName, getMembership, getMembers, getClan, transferLeadership, kickFromClan, renameClan, disbandClan, getPendingInvites, setPassive, setInviteOnly, setDescription, getClanBalance, depositClanBank, withdrawClanBank, PASSIVE_OPTIONS, PASSIVE_COST } = require('../systems/clans');

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
      .addUserOption(o => o.setName('user').setDescription('New leader').setRequired(true)))
    .addSubcommand(sub => sub.setName('kick').setDescription('Kick a member from your clan (leader only)')
      .addUserOption(o => o.setName('user').setDescription('Member to kick').setRequired(true)))
    .addSubcommand(sub => sub.setName('rename').setDescription('Rename your clan (leader only)')
      .addStringOption(o => o.setName('name').setDescription('New clan name').setRequired(true)))
    .addSubcommand(sub => sub.setName('disband').setDescription('Permanently delete your clan (leader only). All members ejected.'))
    .addSubcommand(sub => sub.setName('invites').setDescription('View pending clan invites (leader only).'))
    .addSubcommand(sub => sub.setName('members').setDescription('View detailed member list with join dates')
      .addStringOption(o => o.setName('name').setDescription('Clan name').setRequired(true)))
    .addSubcommand(sub => sub.setName('setpassive').setDescription('Change your clan passive bonus (leader only, costs 2000 yen).')
      .addStringOption(o => o.setName('passive').setDescription('New passive bonus').setRequired(true)
        .addChoices(
          { name: 'CE_REGEN: +10% CE regen', value: 'CE_REGEN' },
          { name: 'YEN_BOOST: +10% fight yen', value: 'YEN_BOOST' },
          { name: 'DAMAGE_BOOST: +5% damage', value: 'DAMAGE_BOOST' },
          { name: 'DEATH_REDUCTION: -10% death penalty', value: 'DEATH_REDUCTION' },
        )))
    .addSubcommand(sub => sub.setName('setinviteonly').setDescription('Toggle invite-only mode (leader only).')
      .addBooleanOption(o => o.setName('enabled').setDescription('Invite-only on or off').setRequired(true)))
    .addSubcommand(sub => sub.setName('setdescription').setDescription('Set your clan description (leader only, max 200 chars).')
      .addStringOption(o => o.setName('text').setDescription('New description').setRequired(true)))
    .addSubcommand(sub => sub.setName('deposit').setDescription('Deposit yen into your clan bank.')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to deposit').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('withdraw').setDescription('Withdraw yen from the clan bank (leader only).')
      .addIntegerOption(o => o.setName('amount').setDescription('Amount to withdraw').setRequired(true).setMinValue(1)))
    .addSubcommand(sub => sub.setName('balance').setDescription('View your clan bank balance.'))
    .addSubcommand(sub => sub.setName('list').setDescription('Browse all clans.'))
    .addSubcommand(sub => sub.setName('top').setDescription('View the clan leaderboard ranked by total member wealth.')),

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
      const limit = clan.member_limit || 20;
      const memberList = members.map(m => `${m.role === 'Leader' ? '👑' : '🔹'} <@${m.player_id}>`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${clan.name}`)
        .setColor(0x3498DB)
        .addFields(
          { name: '👑 Leader', value: leader ? `<@${leader.player_id}>` : 'Unknown', inline: true },
          { name: '📊 Members', value: `${members.length}/${limit}`, inline: true },
          { name: '🎁 Passive Bonus', value: PASSIVE_DESC[clan.passive_bonus] || clan.passive_bonus, inline: true },
          { name: '🔒 Invite Only', value: clan.invite_only ? 'Yes' : 'No', inline: true },
          { name: '📅 Founded', value: `<t:${Math.floor(clan.created_at / 1000)}:D>`, inline: true },
        );
      if (clan.description) embed.addFields({ name: '📝 Description', value: clan.description, inline: false });
      embed.addFields({ name: '👥 Member List', value: memberList.slice(0, 1024) || 'None', inline: false });
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'members') {
      const name = interaction.options.getString('name').trim();
      const clan = getClanByName(name);
      if (!clan) { await interaction.editReply('❌ Clan not found.'); return; }
      const members = getMembers(clan.id);
      if (members.length === 0) { await interaction.editReply('❌ This clan has no members.'); return; }
      const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${clan.name} — Members`)
        .setColor(0x3498DB)
        .setDescription(members.map(m =>
          `${m.role === 'Leader' ? '👑' : '🔹'} <@${m.player_id}> — ${m.role} (joined <t:${Math.floor(m.joined_at / 1000)}:R>)`
        ).join('\n'));
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'leave') {
      const membership = getMembership(interaction.user.id);
      if (!membership) { await interaction.editReply('❌ You are not in a clan.'); return; }
      const clan = getClan(membership.clan_id);
      const clanName = clan?.name || 'your clan';
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('leave_confirm').setLabel(`✅ Leave ${clanName}`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('leave_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      const leaveMsg = await interaction.editReply({
        content: `Are you sure you want to leave **${clanName}**?`,
        components: [confirmRow],
      });
      const col = leaveMsg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 30_000, max: 1 });
      col.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'leave_cancel') {
          await interaction.editReply({ content: '✅ Leave cancelled.', components: [] });
          return;
        }
        const result = leaveClan(player);
        if (result.error) {
          await interaction.editReply({ content: `❌ ${result.error}`, components: [] });
          return;
        }
        await interaction.editReply({ content: '✅ You have left your clan.', components: [] });
      });
      col.on('end', (_, reason) => {
        if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
      });
    } else if (sub === 'invites') {
      const membership = getMembership(interaction.user.id);
      if (!membership || membership.role !== 'Leader') {
        await interaction.editReply('❌ Only clan leaders can view pending invites.');
        return;
      }
      const pending = getPendingInvites(membership.clan_id);
      if (pending.length === 0) {
        await interaction.editReply('📭 No pending invites.');
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('📨 Pending Clan Invites')
        .setColor(0x3498DB)
        .setDescription(pending.map(inv => `<@${inv.invitee_id}> — invited <t:${Math.floor(inv.created_at / 1000)}:R>`).join('\n'));
      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'setpassive') {
      const passiveId = interaction.options.getString('passive');
      const result = setPassive(player, passiveId);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      const embed = new EmbedBuilder()
        .setTitle('⚔️ Clan Passive Changed')
        .setColor(0x2ECC71)
        .setDescription(`**${result.oldPassive}** → **${result.newPassive}** (cost: ${PASSIVE_COST} 💰)`)
        .addFields({ name: '🎁 New Passive', value: PASSIVE_DESC[result.newPassive] || result.newPassive, inline: false });
      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'setinviteonly') {
      const enabled = interaction.options.getBoolean('enabled');
      const result = setInviteOnly(player, enabled);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply(`✅ **${result.name}** is now ${enabled ? '🔒 invite-only' : '🔓 open to all'}.`);
    } else if (sub === 'setdescription') {
      const text = interaction.options.getString('text');
      const result = setDescription(player, text);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply(`✅ **${result.name}** description updated.`);
    } else if (sub === 'disband') {
      const membership = getMembership(interaction.user.id);
      if (!membership || membership.role !== 'Leader') {
        await interaction.editReply('❌ You are not a clan leader.');
        return;
      }
      const clan = getClan(membership.clan_id);
      if (!clan) { await interaction.editReply('❌ Clan not found.'); return; }
      const confirmComp = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('disband_confirm').setLabel(`💥 Disband ${clan.name}`).setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('disband_cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      await interaction.editReply({
        content: `☠️ **Are you sure?** Disbanding **${clan.name}** will permanently delete it and eject all ${getMembers(clan.id).length} members. There is no undo.`,
        components: [confirmComp],
      });
      const col = interaction.channel.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 30_000, max: 1 });
      col.on('collect', async btn => {
        await btn.deferUpdate();
        if (btn.customId === 'disband_cancel') {
          await interaction.editReply({ content: '✅ Disband cancelled.', components: [] });
          return;
        }
        await interaction.editReply({ content: `💥 Clan **${clan.name}** has been disbanded. All members ejected.`, components: [] });
        disbandClan(player);
      });
      col.on('end', (_, reason) => {
        if (reason === 'time') interaction.editReply({ components: [] }).catch(() => {});
      });
    } else if (sub === 'deposit') {
      const amount = interaction.options.getInteger('amount');
      const result = depositClanBank(player, amount);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      const membership = getMembership(discordId);
      const clan = getClan(membership.clan_id);
      const newBalance = getClanBalance(clan.id);
      await interaction.editReply(`✅ Deposited **${result.amount} 💰** into **${clan.name}**'s bank. Clan balance: **${newBalance} 💰**.`);

    } else if (sub === 'withdraw') {
      const amount = interaction.options.getInteger('amount');
      const result = withdrawClanBank(player, amount);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      const membership = getMembership(discordId);
      const clan = getClan(membership.clan_id);
      const newBalance = getClanBalance(clan.id);
      await interaction.editReply(`✅ Withdrew **${result.amount} 💰** from **${clan.name}**'s bank. Clan balance: **${newBalance} 💰**.`);

    } else if (sub === 'balance') {
      const membership = getMembership(discordId);
      if (!membership) { await interaction.editReply('❌ You are not in a clan.'); return; }
      const clan = getClan(membership.clan_id);
      const balance = getClanBalance(clan.id);
      const embed = new EmbedBuilder()
        .setTitle(`🏦 ${clan.name} — Bank Balance`)
        .setColor(0xF1C40F)
        .addFields(
          { name: '💰 Total Balance', value: `${balance.toLocaleString()} 💰`, inline: true },
          { name: 'Members', value: `${getMembers(clan.id).length}`, inline: true },
        );
      await interaction.editReply({ embeds: [embed] });

    } else if (sub === 'list') {
      const allClans = db.select().from(clansTable).all();
      if (!allClans.length) {
        await interaction.editReply('❌ No clans exist yet.');
        return;
      }

      const rows = allClans.map(c => {
        const members = db.select().from(clan_members).where(eq(clan_members.clan_id, c.id)).all();
        const count = members.length;
        const lock = c.invite_only ? '🔒' : '🔓';
        const passive = PASSIVE_DESC[c.passive_bonus] || c.passive_bonus;
        return `${lock} **${c.name}** — ${count} member${count !== 1 ? 's' : ''} — ${passive}`;
      });

      const desc = rows.join('\n');
      const embed = new EmbedBuilder()
        .setTitle('⚔️ All Clans')
        .setColor(0x3498DB)
        .setDescription(desc.length > 4000 ? desc.slice(0, 3997) + '...' : desc);

      await interaction.editReply({ embeds: [embed] });
    } else if (sub === 'top') {
      const allClans = db.select().from(clansTable).all();
      if (!allClans.length) {
        await interaction.editReply('❌ No clans exist yet.');
        return;
      }

      const ranked = allClans.map(c => {
        const members = db.select().from(clan_members).where(eq(clan_members.clan_id, c.id)).all();
        const memberDiscordIds = members.map(m => m.player_id);
        let totalWealth = 0;
        let memberCount = members.length;
        for (const mid of memberDiscordIds) {
          const p = db.select().from(players).where(eq(players.discord_id, mid)).get();
          if (p) totalWealth += p.yen + (p.bank_balance || 0);
        }
        return { name: c.name, totalWealth, memberCount, id: c.id };
      })
        .sort((a, b) => b.totalWealth - a.totalWealth)
        .slice(0, 10);

      const embed = new EmbedBuilder()
        .setTitle('🏆 Clan Leaderboard')
        .setColor(0xF1C40F)
        .setDescription(ranked.map((r, i) => {
          const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
          return `${medal} **${r.name}** — ${r.totalWealth.toLocaleString()} 💰 (${r.memberCount} member${r.memberCount !== 1 ? 's' : ''})`;
        }).join('\n'));

      await interaction.editReply({ embeds: [embed] });
    }
  },
};
