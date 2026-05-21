require('dotenv').config();

// Validate required env vars
const requiredEnv = ['DISCORD_TOKEN', 'CLIENT_ID'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    console.error(`   Copy .env.example to .env and fill in the values.`);
    process.exit(1);
  }
}

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.MessageContent] });
client.commands = new Collection();

// Load commands
let loadedCmds = 0;
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data && cmd.execute) { client.commands.set(cmd.data.name, cmd); loadedCmds++; }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Failed to load command ${file}:`, err.message);
  }
}

// Load events
let loadedEvts = 0;
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  try {
    const event = require(path.join(eventsPath, file));
    if (event.once) client.once(event.name, (...args) => event.execute(...args, client));
    else client.on(event.name, (...args) => event.execute(...args, client));
    loadedEvts++;
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Failed to load event ${file}:`, err.message);
  }
}

console.log(`📜 Loaded ${loadedCmds} commands, ${loadedEvts} events`);

// Passive CE regen every 5 minutes
const { regenAllPlayers, checkAndNotifyCompletedTraining } = require('./systems/training');
setInterval(() => regenAllPlayers(), 5 * 60 * 1000);

// Training completion check every 30 seconds
setInterval(() => checkAndNotifyCompletedTraining(client), 30 * 1000);

process.on('SIGINT', () => { console.log('\n⚠️  SIGINT received. Shutting down gracefully...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\n⚠️  SIGTERM received. Shutting down gracefully...'); process.exit(0); });
process.on('unhandledRejection', (reason, promise) => {
  console.error(`[${new Date().toISOString()}] ❌ Unhandled Rejection at:`, promise, 'reason:', reason?.stack || reason);
});
process.on('warning', warn => {
  if (warn.name === 'DeprecationWarning') return;
  console.error(`[${new Date().toISOString()}] ⚠️  ${warn.name}: ${warn.message}`);
});

client.login(process.env.DISCORD_TOKEN);
