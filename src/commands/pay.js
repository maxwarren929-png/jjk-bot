const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { transferYen } = require('../systems/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('Send yen to another player.')
    .addUserOption(opt => opt.setName('user').setDescription('Recipient').setRequired(true))
    .addIntegerOption(opt => opt.setName('amount').setDescription('Amount to send').setRequired(true).setMinValue(1)),

  async execute(interaction) {
    await interaction.deferReply();
    const senderId = interaction.user.id;
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (target.id === senderId) return interaction.editReply('❌ You cannot pay yourself.');

    const sender = db.select().from(players).where(eq(players.discord_id, senderId)).get();
    const recipient = db.select().from(players).where(eq(players.discord_id, target.id)).get();

    if (!sender) return interaction.editReply('❌ Run `/profile` first.');
    if (!recipient) return interaction.editReply(`❌ **${target.username}** has no profile.`);

    if (sender.yen < amount) return interaction.editReply(`❌ You only have **${sender.yen} 💰**.`);

    const result = transferYen(senderId, target.id, amount);
    if (result.error) return interaction.editReply(`❌ ${result.error}`);

    const freshSender = db.select().from(players).where(eq(players.discord_id, senderId)).get();
    const embed = new EmbedBuilder()
      .setTitle('💸 Transfer')
      .setColor(0x2ECC71)
      .setDescription(`${interaction.user.username} → ${target.username}`)
      .addFields(
        { name: 'Amount', value: `${amount} 💰`, inline: true },
        { name: 'Your Balance', value: `${freshSender?.yen || 0} 💰`, inline: true },
      );

    await interaction.editReply({ embeds: [embed] });
  },
};
