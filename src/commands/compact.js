const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const COMPACTABLE = [
  { name: '🔇 Binding Ring', value: 'SILENCE_NEXT' },
  { name: '🗡️ Split Soul Katana', value: 'BONUS_DAMAGE_20' },
  { name: '💜 CE Potion', value: 'CE_RESTORE_50' },
  { name: '❤️‍🔥 HP Potion', value: 'HP_RESTORE_100' },
  { name: '💚 CE Elixir', value: 'CE_RESTORE_30' },
  { name: '🧪 Healing Vial', value: 'EXIT_BROKEN' },
];

const NEEDED = 3;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('compact')
    .setDescription('Combine 3 identical items into 1 to save inventory space.')
    .addStringOption(o => o.setName('item').setDescription('Item to compact').setRequired(true)
      .addChoices(...COMPACTABLE.map(i => ({ name: i.name, value: i.value })))),

  async execute(interaction) {
    await interaction.deferReply();
    const itemKey = interaction.options.getString('item');
    let result = null;
    sqlite.transaction(() => {
      const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      if (!fresh) { result = '❌ Run `/profile` first.'; return; }
      const job = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
      const items = job.__items || [];
      const count = items.filter(i => i === itemKey).length;
      if (count < NEEDED) { result = `❌ Need **${NEEDED}** of this item to compact, you have **${count}**.`; return; }
      let removed = 0;
      for (let i = items.length - 1; i >= 0 && removed < NEEDED - 1; i--) {
        if (items[i] === itemKey) { items.splice(i, 1); removed++; }
      }
      job.__items = items;
      db.update(players).set({ job_data: JSON.stringify(job) }).where(eq(players.discord_id, interaction.user.id)).run();
      result = { ok: true, saved: NEEDED - 1 };
    })();
    if (typeof result === 'string') return interaction.editReply(result);
    if (!result) return interaction.editReply('❌ Something went wrong.');
    const embed = new EmbedBuilder()
      .setTitle('📦 Compact')
      .setColor(0x3498DB)
      .setDescription(`Combined **${NEEDED}** items → **1**. Freed **${result.saved}** inventory slot(s).`);
    await interaction.editReply({ embeds: [embed] });
  },
};
