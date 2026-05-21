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
                + '`/analyze <target>` — Scout another player\'s combat stats\n'
                + '`/cooldowns` — View all active cooldowns\n'
               + '`/rest` — Rest for 30s to recover 30% HP\n'
               + '`/meditate` — Meditate for 60s to recover 90 CE in bursts\n'
               + '`/train start <type>` — Begin a 2-hour training session\n'
               + '`/train status` — Check training progress\n'
               + '`/train cancel` — Cancel current training (no refund)\n'
               + '`/reset` — Permanently delete your profile and start over\n'
                + '`/leaderboard` — Top players by wealth, wins, grade, or bounty kills\n'
                + '`/history` — View your recent PvP fight history\n'
               + '`/rankup` — Check grade progression requirements\n'
               + '`/achievements` — View your earned achievements and progress',
          inline: false,
        },
        {
          name: '⚔️ Combat',
          value: '`/use <technique> <target>` — Use a technique on someone\n'
               + '`/spar <opponent>` — Practice combat against AI (no rewards/penalties)\n'
               + '`/domain` — Domain Expansion (Grade 2+, costs 150 CE)\n'
                + '`/rob <target>` — Try to steal wallet yen (1h cooldown)\n'
                + '`/hunt` — Hunt cursed spirits for CE, yen, and items (30m cooldown)\n'
                + '`/curse <target>` — Place a debuff on a player (-20% dmg, 2 min)\n'
                + '`/curseinfo` — Check your active curses and debuffs\n'
                + '`/rebuke` — Remove active curses by spending CE\n'
                + '`/sacrifice <hp>` — Convert HP to CE (2:1 ratio)\n'
                + '`/bless <target> <amount>` — Heal a player by spending CE',
          inline: false,
        },
        {
           name: '🏦 Economy & Info',
          value: '`/daily claim` — Claim daily reward (streak bonus)\n'
               + '`/daily info` — Check daily streak and next claim\n'
               + '`/shop` — Browse and buy items\n'
               + '`/buy <item> [quantity]` — Quick-buy with bulk support\n'
               + '`/stats` — Server-wide statistics\n'
                + '`/info` — Bot and server information\n'
                + '`/version` — Show bot version, uptime, and git info\n'
               + '`/today` — Daily activity summary\n'
               + '`/voterewards` — Claim daily voting reward (CE + yen)\n'
               + '`/enhance <slot>` — Upgrade equipped gear with CE\n'
               + '`/bank balance/deposit/withdraw/upgrade` — Manage your cursed bank account\n'
               + '`/bankrob start/join/launch` — Group bank heist\n'
                + '`/pay <user> <amount>` — Send yen\n'
                + '`/donate <target> <item>` — Give an inventory item to another player\n'
                + '`/scavenge` — Search for items or yen (5m cooldown)\n'
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
