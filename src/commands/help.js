const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all available commands.'),

  async execute(interaction) {
    await interaction.deferReply();

    const embed = new EmbedBuilder()
      .setTitle('📖 Cursed Energy Bot — Commands')
      .setColor(0x9B59B6)
      .addFields(
        {
           name: '👤 Profile & Progression',
          value: '`/profile` — View or create your sorcerer profile (shows equipment)\n'
               + '`/techniques` — View your techniques with mastery\n'
               + '`/techniqueinfo <technique>` — Detailed technique stats\n'
               + '`/rank` — View your PvP rating and leaderboard position\n'
               + '`/lastfight` — View your most recent combat result\n'
               + '`/cooldowns` — View all active cooldowns\n'
               + '`/rest` — Rest for 30s to recover 30% HP\n'
               + '`/meditate` — Meditate for 60s to recover 90 CE in bursts\n'
               + '`/train start <type>` — Begin a 2-hour training session\n'
               + '`/train status` — Check training progress\n'
               + '`/train cancel` — Cancel current training (no refund)\n'
               + '`/reset` — Permanently delete your profile and start over\n'
               + '`/leaderboard` — Top players by wealth, wins, grade, or bounty kills\n'
               + '`/rankup` — Check grade progression requirements',
          inline: false,
        },
        {
          name: '⚔️ Combat',
          value: '`/use <technique> <target>` — Use a technique on someone\n'
               + '`/domain` — Domain Expansion (Grade 2+, costs 150 CE)\n'
               + '`/rob <target>` — Try to steal wallet yen (1h cooldown)\n'
               + '`/hunt` — Hunt cursed spirits for CE, yen, and items (30m cooldown)',
          inline: false,
        },
        {
           name: '🏦 Economy',
          value: '`/daily claim` — Claim daily reward (streak bonus)\n'
               + '`/daily info` — Check daily streak and next claim\n'
               + '`/shop` — Browse and buy items\n'
               + '`/buy <item> [quantity]` — Quick-buy with bulk support\n'
               + '`/stats` — Server-wide statistics\n'
               + '`/voterewards` — Claim daily voting reward (CE + yen)\n'
               + '`/enhance <slot>` — Upgrade equipped gear with CE\n'
               + '`/bank balance/deposit/withdraw/upgrade` — Manage your cursed bank account\n'
               + '`/bankrob start/join/launch` — Group bank heist\n'
               + '`/pay <user> <amount>` — Send yen\n'
               + '`/bounty place/list/cancel/check/top/placed` — Place, view, cancel, or top bounties\n'
               + '`/gamble coinflip/dice/blackjack` — Test your luck',
          inline: false,
        },
        {
          name: '💼 Jobs',
          value: '`/job apply/quit/info` — Manage your job\n'
               + '`/job courier/bartender/chop/fish/reel/mine/ores/sell/smelt` — Job actions',
          inline: false,
        },
        {
          name: '⚔️ Clans',
          value: '`/clan create/invite/join/info/leave/transfer/kick/rename/disband/invites/members` — Management\n'
               + '`/clan setpassive/setinviteonly/setdescription` — Leader settings\n'
               + '`/clan deposit/withdraw/balance` — Clan bank (withdraw leader only)',
          inline: false,
        },
        {
           name: '📦 Inventory & Equipment',
          value: '`/inventory view/use/sell/give` — Manage and gift your items\n'
               + '`/inventory equip/unequip` — Equip weapons and armor from your inventory\n'
               + '`/equipment` — Quick view your current gear and bonuses\n'
               + '`/iteminfo <item>` — View detailed stats on any item\n'
               + '`/collection` — Browse all equipment and items\n'
               + 'Use **HP Potion** & **CE Elixir** to heal instantly. Equip **cursed tools** for combat bonuses.',
          inline: false,
        },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
