const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { startTraining, completeTraining, cancelTraining } = require('../systems/training');

const TRAINING_LORE = {
  Meditation:  '🧘 You sit in silence, forcing your cursed energy through rigid channels until it flows freely.',
  Movies:      '🎬 You dissect recordings of high-grade sorcerers, studying movement and technique until dawn.',
  Physical:    '💪 You push your body past its limits, shattering and rebuilding. Again. Again.',
  Manuals:     '📖 You pore over forbidden technique scrolls by candlelight, searching for the pattern.',
  Isolation:   '🌑 You seal yourself away. No distractions. Just you and the cursed energy that wants to kill you.',
};

const TRAINING_REWARD_TEXT = {
  Meditation: '**+15 Max CE** — your capacity grows.',
  Physical:   '**+15 Max HP** — your body is harder than yesterday.',
  Movies:     '**+20 Technique XP** — your eye for combat sharpens.',
  Manuals:    '**Potential unlock** — a variant technique stirs in your memory.',
  Isolation:  '**+3 passive CE regen** — the silence taught you patience.',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('train')
    .setDescription('Begin a 2-hour training session.')
    .addSubcommand(sub => sub
      .setName('start')
      .setDescription('Begin a 2-hour training session.')
      .addStringOption(opt =>
        opt.setName('type')
          .setDescription('What to train')
          .setRequired(true)
          .addChoices(
            { name: 'Meditation (+15 Max CE)', value: 'Meditation' },
            { name: 'Movies (+20 Technique XP)', value: 'Movies' },
            { name: 'Physical (+15 Max HP)', value: 'Physical' },
            { name: 'Manuals (chance to unlock variant)', value: 'Manuals' },
            { name: 'Isolation (+3 passive CE regen)', value: 'Isolation' },
          )))
    .addSubcommand(sub => sub
      .setName('status')
      .setDescription('Check your current training status.'))
    .addSubcommand(sub => sub
      .setName('cancel')
      .setDescription('Cancel your current training session (no refund).')),

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    const discordId = interaction.user.id;

    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    if (!player) {
      await interaction.editReply('❌ No profile found. Run `/profile` first.');
      return;
    }

    if (sub === 'status') {
      // Check if previous training completed but not claimed
      const completed = completeTraining(player);
      if (completed) {
        const rewardText = completed.type === 'Meditation' ? '+15 Max CE' :
          completed.type === 'Physical' ? '+15 Max HP' :
          completed.type === 'Isolation' ? '+3 passive CE regen' : 'claimed';
        await interaction.editReply(`✅ Training complete! **${completed.type}** finished. Reward: ${rewardText}`);
        return;
      }

      if (player.training_until && player.training_until > Date.now()) {
        const remain = Math.ceil((player.training_until - Date.now()) / 60000);
        const elapsedPct = 1 - (player.training_until - Date.now()) / (2 * 60 * 60 * 1000);
        const barFilled = Math.round(Math.max(0, Math.min(1, elapsedPct)) * 10);
        const progressBar = '🟪'.repeat(barFilled) + '⬛'.repeat(10 - barFilled);
        const embed = new EmbedBuilder()
          .setTitle('🏋️ Training Status')
          .setColor(0x3498DB)
          .addFields(
            { name: 'Regimen', value: player.training_type, inline: true },
            { name: 'Progress', value: progressBar, inline: false },
            { name: 'Remaining', value: `**${remain}m**`, inline: true },
            { name: 'Reward', value: TRAINING_REWARD_TEXT[player.training_type] || 'Unknown', inline: false },
          );
        await interaction.editReply({ embeds: [embed] });
        return;
      }

      await interaction.editReply('❌ No active training. Start one with `/train start`.');
      return;
    }

    if (sub === 'cancel') {
      const completed = completeTraining(player);
      if (completed) {
        await interaction.editReply(`✅ Training was already finished! **${completed.type}** — reward claimed.`);
        return;
      }
      const result = cancelTraining(player);
      if (result.error) { await interaction.editReply(`❌ ${result.error}`); return; }
      await interaction.editReply(`✅ **${player.training_type}** training cancelled. No refund — you can start a new session anytime.`);
      return;
    }

    const type = interaction.options.getString('type');

    // Check if previous training is done
    const completed = completeTraining(player);
    if (completed) {
      // player refetched below
    }

    const fresh = db.select().from(players).where(eq(players.discord_id, discordId)).get();
    const result = startTraining(fresh, type);
    if (result.error) {
      await interaction.editReply(`❌ ${result.error}`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('🏋️ Training Begun')
      .setColor(0x3498DB)
      .setDescription(TRAINING_LORE[type])
      .addFields(
        { name: 'Regimen', value: type, inline: true },
        { name: 'Reward', value: TRAINING_REWARD_TEXT[type], inline: false },
        { name: 'Completes', value: `<t:${Math.floor(result.until / 1000)}:R>`, inline: true },
      )
      .setFooter({ text: 'You will be notified when your training is complete.' });

    await interaction.editReply({ embeds: [embed] });
  },
};
