const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remind')
    .setDescription('Set a timer to remind you about something.')
    .addIntegerOption(o => o.setName('minutes').setDescription('Minutes from now').setRequired(true).setMinValue(1).setMaxValue(1440))
    .addStringOption(o => o.setName('message').setDescription('What to remind you about').setRequired(false).setMaxLength(200)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const userId = interaction.user.id;
    const minutes = interaction.options.getInteger('minutes');
    const customMsg = interaction.options.getString('message') || 'Your timer is up!';
    const ms = minutes * 60 * 1000;
    const at = Date.now() + ms;

    setTimeout(async () => {
      try {
        const user = await interaction.client.users.fetch(userId);
        if (user) {
          await user.send(`⏰ **Reminder:** ${customMsg} (set <t:${Math.floor(at / 1000)}:R> by you).`);
        }
      } catch { }
    }, ms);

    await interaction.editReply(`✅ Reminder set! I'll ping you in **${minutes}m** via DM.`);
  },
};
