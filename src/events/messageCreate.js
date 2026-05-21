const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Ignore bot messages
    if (message.author.bot) return;

    const player = db.select().from(players).where(eq(players.discord_id, message.author.id)).get();
    if (!player) return;

    // Check if actively training
    if (player.training_until && player.training_until > Date.now()) {
      const type = player.training_type;
      db.update(players)
        .set({ training_until: null, training_type: null })
        .where(eq(players.discord_id, message.author.id))
        .run();

      try {
        const msg = await message.channel.send({
          content: `💥 **${message.author.username}** spoke during training and **failed** their ${type} session! All progress lost. Focus next time.`,
        });
        setTimeout(() => msg.delete().catch(() => {}), 10_000);
      } catch { /* can't send */ }
    }

    // Check if courier is active
    if (player.job === 'courier') {
      try {
        const data = JSON.parse(player.job_data || '{}');
        if (data.courier_until && data.courier_until > Date.now()) {
          data.courier_until = null;
          data.courier_pay = null;
          db.update(players)
            .set({ job_data: JSON.stringify(data) })
            .where(eq(players.discord_id, message.author.id))
            .run();

          const msg = await message.channel.send({
            content: `📦 **${message.author.username}** sent a message during delivery — the package was lost! **0 💰** earned.`,
          });
          setTimeout(() => msg.delete().catch(() => {}), 10_000);
        }
      } catch { /* bad json */ }
    }
  },
};
