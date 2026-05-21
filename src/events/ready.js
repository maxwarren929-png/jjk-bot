module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`✅ Logged in as ${client.user.tag} | Serving ${client.guilds.cache.size} server(s)`);
  },
};
