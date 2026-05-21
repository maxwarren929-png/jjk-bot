const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

const COST = 10;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whisper')
    .setDescription('Send an anonymous message to another player (costs 10 CE).')
    .addUserOption(o => o.setName('target').setDescription('Who to whisper').setRequired(true))
    .addStringOption(o => o.setName('message').setDescription('Your message (max 200 chars)').setRequired(true).setMaxLength(200)),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const targetUser = interaction.options.getUser('target');
    const message = interaction.options.getString('message');
    if (targetUser.id === interaction.user.id) return interaction.editReply('❌ You cannot whisper to yourself.');

    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');
    if (player.ce < COST) return interaction.editReply(`❌ Need **${COST} CE** to whisper.`);

    db.update(players).set({ ce: player.ce - COST }).where(eq(players.discord_id, interaction.user.id)).run();

    const embed = new EmbedBuilder()
      .setTitle('👻 Anonymous Whisper')
      .setColor(0x9B59B6)
      .setDescription(message)
      .setFooter({ text: 'Someone sent you this anonymously.' });
    targetUser.send({ embeds: [embed] }).catch(() => {});
    await interaction.editReply('✅ Your anonymous whisper has been sent.');
  },
};
