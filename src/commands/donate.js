const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { EQUIPMENT_ITEMS } = require('../data/equipment');

const USEABLE_ITEMS = {
  HP_RESTORE_100: { name: 'HP Potion', desc: 'Restores 100 HP.' },
  CE_RESTORE_50: { name: 'CE Elixir', desc: 'Restores 50 CE.' },
  CE_RESTORE_30: { name: 'Small CE Elixir', desc: 'Restores 30 CE.' },
  EXIT_BROKEN: { name: 'Healing Vial', desc: 'Heals 50 HP and removes Broken.' },
};

const ALL_ITEMS = { ...USEABLE_ITEMS };
for (const [k, v] of Object.entries(EQUIPMENT_ITEMS)) {
  ALL_ITEMS[k] = { name: v.name, equip: true };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('donate')
    .setDescription('Give an item from your inventory to another player.')
    .addUserOption(o => o.setName('target').setDescription('Recipient').setRequired(true))
    .addStringOption(o => o.setName('item').setDescription('Item to donate').setRequired(true).setAutocomplete(true)),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.respond([]);
    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    const items = job.__items || [];
    const matches = items.filter(k => {
      const def = ALL_ITEMS[k];
      return def && def.name.toLowerCase().includes(focused);
    });
    await interaction.respond(matches.slice(0, 25).map(k => ({ name: ALL_ITEMS[k].name, value: k })));
  },

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const targetUser = interaction.options.getUser('target');
    const itemKey = interaction.options.getString('item');

    if (targetUser.id === userId) return interaction.editReply('❌ You cannot donate to yourself. Use `/inventory` instead.');
    if (targetUser.bot) return interaction.editReply('❌ You cannot donate to a bot.');

    const def = ALL_ITEMS[itemKey];
    if (!def) return interaction.editReply(`❌ Unknown item: **${itemKey}**.`);

    let transferred = false;
    let failReason = '';
    sqlite.transaction(() => {
      const giver = db.select().from(players).where(eq(players.discord_id, userId)).get();
      const receiver = db.select().from(players).where(eq(players.discord_id, targetUser.id)).get();
      if (!giver) { failReason = '❌ Run `/profile` first.'; return; }
      if (!receiver) { failReason = `❌ **${targetUser.username}** has no profile.`; return; }
      const giverJob = (() => { try { return JSON.parse(giver.job_data || '{}'); } catch { return {}; } })();
      const giverItems = giverJob.__items || [];
      const idx = giverItems.indexOf(itemKey);
      if (idx === -1) { failReason = `❌ You don't have **${def.name}**.`; return; }
      giverItems.splice(idx, 1);
      const recvJob = (() => { try { return JSON.parse(receiver.job_data || '{}'); } catch { return {}; } })();
      if (!recvJob.__items) recvJob.__items = [];
      recvJob.__items.push(itemKey);
      db.update(players).set({ job_data: JSON.stringify(giverJob) }).where(eq(players.discord_id, userId)).run();
      db.update(players).set({ job_data: JSON.stringify(recvJob) }).where(eq(players.discord_id, targetUser.id)).run();
      transferred = true;
    })();

    if (!transferred) return interaction.editReply(failReason);

    const embed = new EmbedBuilder()
      .setTitle('🎁 Item Donated')
      .setColor(0x9B59B6)
      .setDescription(`**${def.name}** given to **${targetUser.username}**.`);
    await interaction.editReply({ embeds: [embed] });
  },
};
