const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { failTraining } = require('../systems/training');

module.exports = {
  name: 'messageCreate',
  once: false,
  async execute(message, client) {
    // Ignore bot messages
    if (message.author.bot) return;

    const player = db.select().from(players).where(eq(players.discord_id, message.author.id)).get();
    if (!player) return;

    // Check if actively training
    const failedTraining = failTraining(player);
    if (failedTraining) {
      try {
        const msg = await message.channel.send({
          content: `💥 **${message.author.username}** spoke during training and **failed** their ${failedTraining.type} session! All progress lost. Focus next time.`,
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
