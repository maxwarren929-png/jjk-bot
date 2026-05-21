const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Manage your DM notification preferences.')
    .addSubcommand(sub => sub.setName('view').setDescription('View your current notification settings.'))
    .addSubcommand(sub => sub
      .setName('toggle')
      .setDescription('Toggle a notification category on/off.')
      .addStringOption(opt => opt.setName('category').setDescription('Which notifications to toggle').setRequired(true)
        .addChoices(
          { name: '💀 Death notifications (when you lose a fight)', value: 'death' },
          { name: '🗡️ Robbery notifications (when someone robs you)', value: 'robbery' },
          { name: '💰 Bounty notifications (when a bounty is placed on you)', value: 'bounty' },
          { name: '🏋️ Training notifications (when training completes)', value: 'training' },
        ))),

  async execute(interaction) {
    await interaction.deferReply();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    const sub = interaction.options.getSubcommand();
    const job = (() => { try { return JSON.parse(player.job_data || '{}'); } catch { return {}; } })();
    if (!job.__notifications) job.__notifications = { death: true, robbery: true, bounty: true, training: true };

    if (sub === 'view') {
      const status = job.__notifications;
      const lines = Object.entries(status).map(([k, v]) => `• **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v ? '✅ On' : '❌ Off'}`);
      const embed = new EmbedBuilder()
        .setTitle('🔔 Notification Settings')
        .setColor(0x3498DB)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Use /notifications toggle <category> to change.' });
      return interaction.editReply({ embeds: [embed] });
    }

    if (sub === 'toggle') {
      const category = interaction.options.getString('category');
      const current = job.__notifications[category];
      job.__notifications[category] = !current;
      sqlite.transaction(() => {
        const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (!fresh) return;
        const fJob = (() => { try { return JSON.parse(fresh.job_data || '{}'); } catch { return {}; } })();
        fJob.__notifications = job.__notifications;
        db.update(players).set({ job_data: JSON.stringify(fJob) }).where(eq(players.discord_id, interaction.user.id)).run();
      })();
      const embed = new EmbedBuilder()
        .setTitle('🔔 Notification Updated')
        .setColor(0x2ECC71)
        .setDescription(`**${category.charAt(0).toUpperCase() + category.slice(1)}** notifications are now **${job.__notifications[category] ? '✅ ON' : '❌ OFF'}**.`);
      await interaction.editReply({ embeds: [embed] });
    }
  },
};
