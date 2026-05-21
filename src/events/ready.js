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
    const uptimeSec = process.uptime();
    let gitInfo = '';
    try { gitInfo = require('child_process').execSync('git log --oneline -1', { cwd: __dirname, encoding: 'utf8' }).trim().split(' ')[0]; } catch {}
    const uptimeStr = uptimeSec >= 86400 ? `${Math.floor(uptimeSec / 86400)}d ${Math.floor((uptimeSec % 86400) / 3600)}h` :
      uptimeSec >= 3600 ? `${Math.floor(uptimeSec / 3600)}h ${Math.floor((uptimeSec % 3600) / 60)}m` :
      `${Math.floor(uptimeSec / 60)}m ${Math.floor(uptimeSec % 60)}s`;
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  ✅ Logged in as ${client.user.tag}`);
    console.log(`  🕐 Launched    ${now.toLocaleString()}`);
    console.log(`  ⏱ Uptime      ${uptimeStr}`);
    if (gitInfo) console.log(`  📌 Commit      ${gitInfo}`);
    console.log(`  📶 Ping        ${ping}ms`);
    console.log(`  🌐 Servers     ${guildCount}`);
    console.log(`  📜 Commands    ${cmdCount}`);
    console.log(`  👤 Players     ${playerCount}`);
    console.log(`  ⚔️ Techniques  ${techCount}`);
    console.log(`  🏰 Clans       ${clanCount}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  },
};
