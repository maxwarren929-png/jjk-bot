const { db } = require('../db/index');
const { players, techniques, clans } = require('../db/schema');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    const guildCount = client.guilds.cache.size;
    const cmdCount = client.commands?.size || 0;
    let playerCount = 0, techCount = 0, clanCount = 0;
    try {
      playerCount = db.select().from(players).all().length;
      techCount = db.select().from(techniques).all().length;
      clanCount = db.select().from(clans).all().length;
    } catch { /* db not ready */ }
    const now = new Date();
    const ping = client.ws.ping;
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  ✅ Logged in as ${client.user.tag}`);
    console.log(`  🕐 Launched    ${now.toLocaleString()}`);
    console.log(`  📶 Ping        ${ping}ms`);
    console.log(`  🌐 Servers     ${guildCount}`);
    console.log(`  📜 Commands    ${cmdCount}`);
    console.log(`  👤 Players     ${playerCount}`);
    console.log(`  ⚔️ Techniques  ${techCount}`);
    console.log(`  🏰 Clans       ${clanCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  },
};
