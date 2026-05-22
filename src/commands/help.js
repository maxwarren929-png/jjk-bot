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
      .setDescription('Commands organized by activity. Use `/` + command name for details.')
      .addFields(
        {
          name: '👤 Profile & Progression',
          value: [
            '`/profile` — View or create your sorcerer profile',
            '`/analyze <target>` — Scout another player\'s stats',
            '`/inspect <user>` — View another player\'s equipment and grade',
            '`/techniques` — View your techniques with mastery',
            '`/techniqueinfo <technique>` — Detailed technique stats',
            '`/rank` — View your PvP rating and leaderboard position',
            '`/lastfight` — View your most recent combat result',
            '`/share` — Share your last fight in chat',
            '`/record` — View detailed combat record',
            '`/cooldowns` — View all active cooldowns',
            '`/leaderboard` — Top players by wealth, wins, grade, kills',
            '`/history` — Recent PvP fight history',
            '`/rankup` — Grade progression requirements',
            '`/achievements` — Earned achievements and progress',
          ].join('\n'),
          inline: false,
        },
        {
          name: '⚔️ Combat & PvP',
          value: [
            '`/use <technique> <target>` — Attack a player with a technique',
            '`/duel <target> <stake>` — Challenge to a duel with yen pot',
            '`/spar <opponent>` — Practice combat vs AI (no penalty)',
            '`/domain` — Domain Expansion (Grade 2+, costs 150 CE)',
            '`/rob <target>` — Try to steal wallet yen (1h cooldown)',
            '`/hunt` — Hunt cursed spirits (30m cooldown)',
            '`/curse <target>` — Place a -20% damage debuff (2 min)',
            '`/curseinfo` — Check active curses on you',
            '`/rebuke` — Remove curses by spending CE',
            '`/bless <target> <amount>` — Heal another player with CE',
          ].join('\n'),
          inline: false,
        },
        {
          name: '💚 Recovery & Buffs',
          value: [
            '`/rest` — Rest 30s to recover 30% HP',
            '`/meditate` — Meditate 60s to recover 90 CE',
            '`/heal <hp>` — RCT: convert CE → HP (1:3 ratio)',
            '`/sacrifice <hp>` — Convert HP → CE (2:1 ratio)',
            '`/vow` — Binding Vow: HP for +25% damage next fight',
            '`/focus` — Sacrifice HP for 5min CE regen boost',
            '`/train start/status/cancel` — 2-hour training sessions',
          ].join('\n'),
          inline: false,
        },
        {
          name: '💰 Economy & Banking',
          value: [
            '`/daily` — Claim daily reward with streak bonus',
            '`/voterewards` — Claim voting reward (CE + yen)',
            '`/bank balance/deposit/withdraw/upgrade` — Manage bank',
            '`/vault balance/deposit/withdraw` — Death-protected storage',
            '`/lock create/claim/list` — Lock yen for 24h (5% interest)',
            '`/pay <user> <amount>` — Send yen to another player',
            '`/bankrob start/join/launch` — Group bank heist',
            '`/bounty place/list/cancel/check/top` — Bounty system',
            '`/appeal` — Pay 1.5x to clear all bounties on you',
            '`/gamble coinflip/dice/blackjack` — Test your luck',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🛒 Shop & Inventory',
          value: [
            '`/shop` — Browse and buy items',
            '`/buy <item> [quantity]` — Quick-buy with bulk support',
            '`/inventory view/use/sell/give/equip/unequip` — Manage items',
            '`/trash` — Delete an item (no refund)',
            '`/compact` — Combine 3 identical items into 1',
            '`/equipment` — View your current gear and bonuses',
            '`/enhance <slot>` — Upgrade equipped gear with CE',
            '`/iteminfo <item>` — Detailed stats on any item',
            '`/collection` — Browse all equipment and items',
          ].join('\n'),
          inline: false,
        },
        {
          name: '💼 Jobs & Activities',
          value: [
            '`/job apply/quit/info` — Manage your job',
            '`/job courier/bartender/chop/fish/reel/mine/ores/sell/smelt` — Job actions',
            '`/scavenge` — Search for items or yen (5m cooldown)',
            '`/patrol` — 15m passive yen generation',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🏰 Clans',
          value: [
            '`/clan create/invite/join/info/leave/transfer/kick` — Management',
            '`/clan rename/disband/invites/members` — Settings',
            '`/clan setpassive/setinviteonly/setdescription` — Leader settings',
            '`/clan deposit/withdraw/balance` — Clan bank',
          ].join('\n'),
          inline: false,
        },
        {
          name: '🔧 Utilities',
          value: [
            '`/info` — Bot and server information',
            '`/today` — Daily activity summary',
            '`/stats` — Server-wide statistics',
            '`/version` — Bot version, uptime, git info',
            '`/reset` — Delete your profile and start over',
            '`/remind <minutes> [message]` — Set a DM reminder',
            '`/whisper <target> <message>` — Anonymous DM (costs CE)',
          ].join('\n'),
          inline: false,
        },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
