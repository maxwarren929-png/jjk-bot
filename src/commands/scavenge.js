const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const COOLDOWN = 5 * 60 * 1000;

const LOOT_TABLE = [
  { type: 'yen', min: 10, max: 100, weight: 60, label: 'some yen' },
  { type: 'hp_potion', weight: 25, label: 'an HP Potion', itemKey: 'HP_RESTORE_100' },
  { type: 'ce_elixir', weight: 10, label: 'a CE Elixir', itemKey: 'CE_RESTORE_50' },
  { type: 'cursed_item', weight: 5, label: 'a Cursed Relic!', itemKey: 'CURSED_BLADE' },
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('scavenge')
    .setDescription('Search the area for items or yen.'),

  async execute(interaction) {
    await interaction.deferReply();
    const userId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, userId)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const now = Date.now();

    const totalWeight = LOOT_TABLE.reduce((s, i) => s + i.weight, 0);
    let roll = Math.floor(Math.random() * totalWeight);
    let loot = LOOT_TABLE[0];
    for (const entry of LOOT_TABLE) {
      roll -= entry.weight;
      if (roll < 0) { loot = entry; break; }
    }

    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, userId)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      if (fresh.last_scavenge_at && now - fresh.last_scavenge_at < COOLDOWN) {
        const secs = Math.ceil((COOLDOWN - (now - fresh.last_scavenge_at)) / 1000);
        result = `⏳ Scavenge cooldown: **${secs}s** remaining.`;
        return;
      }
      const freshJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      if (loot.type === 'yen') {
        const amount = Math.floor(Math.random() * (loot.max - loot.min + 1)) + loot.min;
        db.update(players).set({ yen: fresh.yen + amount, last_scavenge_at: now }).where(eq(players.discord_id, userId)).run();
        result = { desc: `**${amount} 💰**`, label: loot.label };
      } else {
        if (!freshJob.__items) freshJob.__items = [];
        freshJob.__items.push(loot.itemKey);
        db.update(players).set({ job_data: JSON.stringify(freshJob), last_scavenge_at: now }).where(eq(players.discord_id, userId)).run();
        result = { desc: loot.label, label: loot.label };
      }
    })();
    if (typeof result === 'string') return interaction.editReply(result);

    if (!result) return interaction.editReply('❌ Something went wrong. Try again.');

    const embed = new EmbedBuilder()
      .setTitle('🔍 Scavenge')
      .setColor(0xE67E22)
      .setDescription(`You found **${result.label}**!`);
    await interaction.editReply({ embeds: [embed] });
  },
};
