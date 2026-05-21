const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, sqlite } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');

// ── Constants ────────────────────────────────────────────────────────────────
const JOBS = ['courier', 'bartender', 'lumberjack', 'fisherman', 'miner'];
const JOB_DESC = {
  courier: 'Deliver packages for pay. Don\'t message anyone during delivery or it fails.',
  bartender: 'Mix drinks from memory. Get the ingredients in the right order.',
  lumberjack: 'Chop wood for small pay. Costs HP. 20 chops per day.',
  fisherman: 'Cast your line and wait. Better catches at higher rod levels.',
  miner: 'Dig for ores. Smelt for double-or-nothing.',
};

// ── Courier ──────────────────────────────────────────────────────────────────
const COURIER_PAY = { short: 80, medium: 200, long: 500 };
const COURIER_TIME = { short: 900000, medium: 2700000, long: 7200000 };

// ── Bartender ────────────────────────────────────────────────────────────────
const DRINKS = [
  { name: 'Mojito', ingredients: ['Mint', 'Lime', 'Rum', 'Soda'] },
  { name: 'Martini', ingredients: ['Gin', 'Vermouth', 'Olive'] },
  { name: 'Old Fashioned', ingredients: ['Bourbon', 'Sugar', 'Bitters', 'Orange'] },
  { name: 'Margarita', ingredients: ['Tequila', 'Lime', 'Triple Sec'] },
  { name: 'Cosmo', ingredients: ['Vodka', 'Cranberry', 'Lime', 'Triple Sec'] },
  { name: 'Negroni', ingredients: ['Gin', 'Campari', 'Vermouth'] },
  { name: 'Daiquiri', ingredients: ['Rum', 'Lime', 'Sugar'] },
  { name: 'Mule', ingredients: ['Vodka', 'Ginger Beer', 'Lime'] },
];
const DECOY_INGREDIENTS = ['Coconut', 'Milk', 'Mint', 'Honey', 'Grenadine', 'Ice', 'Soda', 'Salt', 'Pepper', 'Cucumber', 'Basil', 'Apple', 'Peach', 'Coffee', 'Cream'];

const bartenderGames = new Map();

// ── Fisherman ────────────────────────────────────────────────────────────────
const fisherCasts = new Map();
const FISH_TABLE = [
  { name: 'Old Boot', minRod: 0, value: 5 },
  { name: 'Trash Fish', minRod: 0, value: 10 },
  { name: 'Carp', minRod: 0, value: 30 },
  { name: 'Salmon', minRod: 0, value: 80 },
  { name: 'Tuna', minRod: 1, value: 200 },
  { name: 'Swordfish', minRod: 2, value: 500 },
  { name: 'Golden Koi', minRod: 3, value: 1500 },
  { name: 'Mythic Serpent', minRod: 4, value: 4000 },
];

// ── Miner ────────────────────────────────────────────────────────────────────
const ORES = [
  { id: 'iron', name: 'Iron Ore', baseValue: 20 },
  { id: 'gold', name: 'Gold Ore', baseValue: 100 },
  { id: 'gem', name: 'Gemstone', baseValue: 300 },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function jobData(player) {
  try { return JSON.parse(player.job_data || '{}'); } catch { return {}; }
}

function saveJobData(userId, data) {
  db.update(players).set({ job_data: JSON.stringify(data) }).where(eq(players.discord_id, userId)).run();
}

function getRodLevel(player) {
  return jobData(player).rodLevel || 1;
}

function todayReset(player) {
  const ref = player.last_daily_at || player.created_at || Date.now();
  const last = new Date(ref);
  const now = new Date();
  return last.getDate() !== now.getDate() || last.getMonth() !== now.getMonth() || last.getFullYear() !== now.getFullYear();
}

// ── Module ───────────────────────────────────────────────────────────────────

module.exports = {
  data: new SlashCommandBuilder()
    .setName('job')
    .setDescription('Work for a living.')
    .addSubcommand(sub => sub
      .setName('apply')
      .setDescription('Apply for a job.')
      .addStringOption(opt => opt.setName('job').setDescription('Which job').setRequired(true)
        .addChoices(...JOBS.map(j => ({ name: j.charAt(0).toUpperCase() + j.slice(1), value: j })))))
    .addSubcommand(sub => sub.setName('quit').setDescription('Quit your current job.'))
    .addSubcommand(sub => sub.setName('info').setDescription('Check your current job status.'))
    .addSubcommand(sub => sub
      .setName('courier')
      .setDescription('Take a delivery (Courier only).')
      .addStringOption(opt => opt.setName('distance').setDescription('Delivery distance').setRequired(true)
        .addChoices({ name: 'Short (15m)', value: 'short' }, { name: 'Medium (45m)', value: 'medium' }, { name: 'Long (2h)', value: 'long' })))
    .addSubcommand(sub => sub.setName('bartender').setDescription('Take a drink order (Bartender only).'))
    .addSubcommand(sub => sub.setName('chop').setDescription('Chop wood for yen (Lumberjack only).'))
    .addSubcommand(sub => sub.setName('fish').setDescription('Cast your line (Fisherman only).'))
    .addSubcommand(sub => sub.setName('reel').setDescription('Reel in your catch (Fisherman only).'))
    .addSubcommand(sub => sub.setName('mine').setDescription('Dig for ores (Miner only).'))
    .addSubcommand(sub => sub.setName('sell').setDescription('Sell all your ores.'))
    .addSubcommand(sub => sub
      .setName('smelt')
      .setDescription('Smelt an ore — double or nothing.')
      .addStringOption(opt => opt.setName('ore').setDescription('Which ore to smelt').setRequired(true)
        .addChoices(
          { name: 'Iron Ore', value: 'iron' },
          { name: 'Gold Ore', value: 'gold' },
          { name: 'Gemstone', value: 'gem' },
        )))
    .addSubcommand(sub => sub.setName('ores').setDescription('View your ore inventory (Miner only).')),
  // smelt is handled via buttons from /mine or /sell

  async execute(interaction) {
    await interaction.deferReply();
    const sub = interaction.options.getSubcommand();
    const player = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!player) return interaction.editReply('❌ Run `/profile` first.');

    if (sub === 'apply') return apply(interaction, player);
    if (sub === 'quit') return quit(interaction, player);
    if (sub === 'info') return info(interaction, player);
    if (sub === 'courier') return courier(interaction, player);
    if (sub === 'bartender') return bartender(interaction, player);
    if (sub === 'chop') return chop(interaction, player);
    if (sub === 'fish') return fish(interaction, player);
    if (sub === 'reel') return reel(interaction, player);
    if (sub === 'mine') return mine(interaction, player);
    if (sub === 'smelt') return smelt(interaction, player);
    if (sub === 'ores') return ores(interaction, player);
    if (sub === 'sell') return sell(interaction, player);
  },
};

async function requireJob(interaction, player, job) {
  if (player.job !== job) {
    await interaction.editReply(`❌ You are not a **${job}**. Apply with \`/job apply ${job}\`.`);
    return false;
  }
  return true;
}

// ── Apply / Quit / Info ─────────────────────────────────────────────────────

async function apply(interaction, player) {
  const job = interaction.options.getString('job');
  if (player.job) return interaction.editReply(`❌ You already have a job: **${player.job}**. Quit first with \`/job quit\`.`);
  db.update(players).set({ job, job_data: '{}' }).where(eq(players.discord_id, interaction.user.id)).run();
  const embed = new EmbedBuilder()
    .setTitle('✅ Job Application Accepted')
    .setColor(0x2ECC71)
    .setDescription(`You are now a **${job}**!`)
    .addFields({ name: '📋 Description', value: JOB_DESC[job], inline: false });
  await interaction.editReply({ embeds: [embed] });
}

async function quit(interaction, player) {
  if (!player.job) return interaction.editReply('❌ You don\'t have a job.');
  db.update(players).set({ job: null, job_data: '{}' }).where(eq(players.discord_id, interaction.user.id)).run();
  await interaction.editReply(`✅ Quit **${player.job}**.`);
}

async function info(interaction, player) {
  if (!player.job) return interaction.editReply('❌ You don\'t have a job. Apply with `/job apply`.');

  const data = jobData(player);
  const embed = new EmbedBuilder()
    .setTitle(`💼 ${player.job.charAt(0).toUpperCase() + player.job.slice(1)}`)
    .setColor(0x3498DB)
    .setDescription(JOB_DESC[player.job]);

  if (player.job === 'courier') {
    if (data.courier_until && data.courier_until > Date.now()) {
      const remain = Math.ceil((data.courier_until - Date.now()) / 60000);
      embed.addFields({ name: '📦 Active Delivery', value: `${remain}m remaining — **${data.courier_pay} 💰**`, inline: false });
    } else if (data.courier_until && data.courier_until <= Date.now() && data.courier_pay) {
      const pay = data.courier_pay;
      data.courier_until = null;
      data.courier_pay = null;
      saveJobData(interaction.user.id, data);
      sqlite.transaction(() => {
        const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (fresh) db.update(players).set({ yen: fresh.yen + pay }).where(eq(players.discord_id, interaction.user.id)).run();
      })();
      embed.addFields({ name: '✅ Delivery Complete', value: `Earned **${pay} 💰**`, inline: false });
    } else {
      embed.addFields({ name: '📦 Status', value: 'Idle — take a delivery with `/job courier`', inline: false });
    }
  }

  if (player.job === 'lumberjack') {
    const chops = todayReset(player) ? 0 : (data.lumberjack_chops || 0);
    embed.addFields({ name: '🪓 Chops Today', value: `${chops}/20`, inline: true });
  }

  if (player.job === 'fisherman') {
    const rod = data.rodLevel || 1;
    const cast = fisherCasts.get(interaction.user.id);
    embed.addFields(
      { name: '🎣 Rod Level', value: `${rod}`, inline: true },
      { name: '🎯 Cast Active', value: cast && cast.catchAt > Date.now() ? 'Yes' : 'No', inline: true },
    );
  }

  if (player.job === 'miner') {
    const digs = todayReset(player) ? 0 : (data.miner_digs || 0);
    const inv = data.miner_ores || { iron: 0, gold: 0, gem: 0 };
    const total = Object.values(inv).reduce((a, b) => a + b, 0);
    embed.addFields(
      { name: '⛏️ Digs Today', value: `${digs}/10`, inline: true },
      { name: '📦 Raw Ore', value: `${total} pieces`, inline: true },
    );
  }

  if (player.job === 'bartender') {
    embed.addFields({ name: '🍸 Status', value: 'Ready — take an order with `/job bartender`', inline: false });
  }

  await interaction.editReply({ embeds: [embed] });
}

// ── Courier ──────────────────────────────────────────────────────────────────

async function courier(interaction, player) {
  if (!await requireJob(interaction, player, 'courier')) return;

  const data = jobData(player);
  if (data.courier_until && data.courier_until > Date.now()) {
    const remain = Math.ceil((data.courier_until - Date.now()) / 60000);
    return interaction.editReply(`❌ Already on a delivery. **${remain}m** remaining.`);
  }

  // Payout any completed delivery
  if (data.courier_until && data.courier_until <= Date.now() && data.courier_pay) {
    const pay = data.courier_pay;
    data.courier_until = null;
    data.courier_pay = null;
    saveJobData(interaction.user.id, data);
    sqlite.transaction(() => {
      const f = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      if (f) db.update(players).set({ yen: f.yen + pay }).where(eq(players.discord_id, interaction.user.id)).run();
    })();
    await interaction.editReply(`✅ Previous delivery completed! Earned **${pay} 💰**. You can now take a new one.`);
    return;
  }

  const distance = interaction.options.getString('distance');
  const pay = COURIER_PAY[distance];
  const duration = COURIER_TIME[distance];
  const until = Date.now() + duration;

  data.courier_until = until;
  data.courier_pay = pay;
  saveJobData(interaction.user.id, data);

  setTimeout(async () => {
    try {
      const p = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
      const currentData = jobData(p);
      if (currentData.courier_until === until && currentData.courier_pay === pay) {
        currentData.courier_until = null;
        currentData.courier_pay = null;
        sqlite.transaction(() => {
          saveJobData(interaction.user.id, currentData);
          const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
          db.update(players).set({ yen: (fresh?.yen || 0) + pay }).where(eq(players.discord_id, interaction.user.id)).run();
        })();
        try { await interaction.channel.send(`📦 **${interaction.user.username}** completed their delivery! **+${pay} 💰**`); } catch (err) { console.error(`[${new Date().toISOString()}] job.js: courier announce failed — ${err.message}`); }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] job.js: courier timeout handler failed — ${err.message}`);
    }
  }, duration);

  const embed = new EmbedBuilder()
    .setTitle('📦 Delivery Accepted')
    .setColor(0x3498DB)
    .setDescription(`Delivering a **${distance}** package for **${pay} 💰**`)
    .addFields(
      { name: '⏱️ ETA', value: `<t:${Math.floor(until / 1000)}:R>`, inline: true },
      { name: '⚠️ Warning', value: 'Sending ANY message during delivery will fail it.', inline: false },
    );
  await interaction.editReply({ embeds: [embed] });
}

// ── Bartender ────────────────────────────────────────────────────────────────

async function bartender(interaction, player) {
  if (!await requireJob(interaction, player, 'bartender')) return;
  if (bartenderGames.has(interaction.user.id)) return interaction.editReply('❌ You already have an active order. Finish it first.');

  const drink = DRINKS[Math.floor(Math.random() * DRINKS.length)];
  const allIngredients = [...new Set([...drink.ingredients, ...DECOY_INGREDIENTS.sort(() => Math.random() - 0.5).slice(0, 6)])];
  const shuffled = [...allIngredients].sort(() => Math.random() - 0.5);

  const game = { drink, expected: drink.ingredients, clicked: [], ingredients: shuffled };
  bartenderGames.set(interaction.user.id, game);

  const embed = new EmbedBuilder()
    .setTitle('🍸 Drink Order')
    .setColor(0xE67E22)
    .setDescription(`**${drink.name}**\n\nIngredients in order:\n${drink.ingredients.map((ig, i) => `${i + 1}. ${ig}`).join('\n')}`)
    .setFooter({ text: 'Click the buttons in the correct order.' });

  const row = new ActionRowBuilder();
  for (const ig of shuffled.slice(0, 5)) {
    row.addComponents(new ButtonBuilder().setCustomId(`bj_${ig}`).setLabel(ig).setStyle(ButtonStyle.Secondary));
  }
  const row2 = new ActionRowBuilder();
  for (const ig of shuffled.slice(5)) {
    row2.addComponents(new ButtonBuilder().setCustomId(`bj_${ig}`).setLabel(ig).setStyle(ButtonStyle.Secondary));
  }

  const msg = await interaction.editReply({ embeds: [embed], components: row2.components.length ? [row, row2] : [row] });

  const col = msg.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 60000 });
  col.on('collect', async btn => {
    await btn.deferUpdate();
    const g = bartenderGames.get(interaction.user.id);
    if (!g) return;

    const ig = btn.customId.replace('bj_', '');
    g.clicked.push(ig);

    const pos = g.clicked.length - 1;
    const correct = g.expected[pos];

    if (ig !== correct) {
      bartenderGames.delete(interaction.user.id);
      col.stop();
      const fail = new EmbedBuilder()
        .setTitle('❌ Wrong Order!')
        .setColor(0xE74C3C)
        .setDescription(`You added **${ig}** but the recipe needed **${correct}**. Drink ruined.`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bt_try').setLabel('🍸 Try Again').setStyle(ButtonStyle.Primary),
      );
      const failedMsg = await interaction.editReply({ embeds: [fail], components: [row] });
      try {
        const again = await failedMsg.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === 'bt_try',
          time: 30_000,
        });
        await again.deferUpdate();
        const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (!fresh || fresh.job !== 'bartender') return again.editReply({ content: '❌ You are no longer a bartender.', embeds: [], components: [] });
        return bartender(interaction, fresh);
      } catch { failedMsg.edit({ components: [] }).catch(() => {}); }
      return;
    }

    if (g.clicked.length === g.expected.length) {
      bartenderGames.delete(interaction.user.id);
      col.stop();
      const tip = Math.floor(Math.random() * 100) + 100;
      sqlite.transaction(() => {
        const f = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (f) db.update(players).set({ yen: f.yen + tip }).where(eq(players.discord_id, interaction.user.id)).run();
      })();
      const win = new EmbedBuilder()
        .setTitle('✅ Perfect Serve!')
        .setColor(0x2ECC71)
        .setDescription(`**${g.drink.name}** served correctly! Tip: **${tip} 💰**`);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bt_again').setLabel('🍸 Another Order').setStyle(ButtonStyle.Success),
      );
      const winMsg = await interaction.editReply({ embeds: [win], components: [row] });
      try {
        const again = await winMsg.awaitMessageComponent({
          filter: i => i.user.id === interaction.user.id && i.customId === 'bt_again',
          time: 30_000,
        });
        await again.deferUpdate();
        const fresh = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
        if (!fresh || fresh.job !== 'bartender') return again.editReply({ content: '❌ You are no longer a bartender.', embeds: [], components: [] });
        return bartender(interaction, fresh);
      } catch { winMsg.edit({ components: [] }).catch(() => {}); }
      return;
    }
  });
  col.on('end', (_, reason) => {
    if (reason === 'time') {
      bartenderGames.delete(interaction.user.id);
      interaction.editReply({ components: [] }).catch(() => {});
    }
  });
}

// ── Lumberjack ───────────────────────────────────────────────────────────────

async function chop(interaction, player) {
  if (!await requireJob(interaction, player, 'lumberjack')) return;
  if (player.hp <= 2) return interaction.editReply('❌ Too exhausted. HP too low to chop.');

  const data = jobData(player);
  const chops = todayReset(player) ? 0 : (data.lumberjack_chops || 0);
  if (chops >= 20) return interaction.editReply('❌ Daily chop limit reached (20). Resets on daily claim.');

  const axeLvl = data.axeLevel || 1;
  const earned = Math.floor(Math.random() * (axeLvl * 2)) + axeLvl;

  data.lumberjack_chops = chops + 1;
  saveJobData(interaction.user.id, data);
  let newHp;
  sqlite.transaction(() => {
    const fPlayer = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fPlayer) return;
    newHp = Math.max(1, fPlayer.hp - 2);
    db.update(players).set({ yen: fPlayer.yen + earned, hp: newHp }).where(eq(players.discord_id, interaction.user.id)).run();
  })();

  const embed = new EmbedBuilder()
    .setTitle('🪓 Chop!')
    .setColor(0x8B4513)
    .setDescription(`Found **${earned} 💰**`)
    .addFields(
      { name: '📦 Today', value: `${chops + 1}/20`, inline: true },
      { name: '❤️ HP', value: `${newHp || 0}/${player.max_hp}`, inline: true },
    );
  await interaction.editReply({ embeds: [embed] });
}

// ── Fisherman ────────────────────────────────────────────────────────────────

async function fish(interaction, player) {
  if (!await requireJob(interaction, player, 'fisherman')) return;

  const existing = fisherCasts.get(interaction.user.id);
  if (existing && existing.catchAt > Date.now()) {
    const remain = Math.ceil((existing.catchAt - Date.now()) / 60000);
    return interaction.editReply(`❌ Line already cast. Ready to reel in **${remain}m**.`);
  }
  if (existing && Date.now() < existing.expiresAt) {
    return interaction.editReply('❌ You have a pending catch! Use `/job reel`.');
  }

  const wait = Math.floor(Math.random() * 3) + 2;
  const catchAt = Date.now() + wait * 60000;
  const expiresAt = catchAt + 10 * 60000;
  fisherCasts.set(interaction.user.id, { catchAt, expiresAt });

  const embed = new EmbedBuilder()
    .setTitle('🎣 Line Cast')
    .setColor(0x3498DB)
    .setDescription(`You cast your line. Something will bite in **${wait} min**.`)
    .addFields({ name: '⏱️ Reel In', value: `<t:${Math.floor(catchAt / 1000)}:R>`, inline: false });
  await interaction.editReply({ embeds: [embed] });
}

async function reel(interaction, player) {
  if (!await requireJob(interaction, player, 'fisherman')) return;

  const cast = fisherCasts.get(interaction.user.id);
  if (!cast) return interaction.editReply('❌ No line cast. Use `/job fish` first.');

  if (Date.now() < cast.catchAt) {
    const remain = Math.ceil((cast.catchAt - Date.now()) / 60000);
    return interaction.editReply(`❌ Too early! Wait **${remain}m** for a bite.`);
  }
  if (Date.now() > cast.expiresAt) {
    fisherCasts.delete(interaction.user.id);
    return interaction.editReply('❌ The fish got away. Cast again with `/job fish`.');
  }

  fisherCasts.delete(interaction.user.id);
  const rodLevel = getRodLevel(player);
  const available = FISH_TABLE.filter(f => f.minRod <= rodLevel);
  const weighted = available.flatMap(f => Array(rodLevel + (f.minRod === 0 ? 3 : 1)).fill(f));
  const catch_ = weighted[Math.floor(Math.random() * weighted.length)];

  sqlite.transaction(() => {
    const f = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (f) db.update(players).set({ yen: f.yen + catch_.value }).where(eq(players.discord_id, interaction.user.id)).run();
  })();

  const embed = new EmbedBuilder()
    .setTitle('🎣 Catch!')
    .setColor(0x2ECC71)
    .setDescription(`You caught a **${catch_.name}**! Sold for **${catch_.value} 💰**`);
  await interaction.editReply({ embeds: [embed] });
}

// ── Miner ────────────────────────────────────────────────────────────────────

async function doMine(msg, player) {
  const data = jobData(player);
  const digs = todayReset(player) ? 0 : (data.miner_digs || 0);

  const ore = ORES[Math.floor(Math.random() * ORES.length)];
  const ores = data.miner_ores || { iron: 0, gold: 0, gem: 0 };
  ores[ore.id] = (ores[ore.id] || 0) + 1;
  data.miner_digs = digs + 1;
  data.miner_ores = ores;
  saveJobData(player.discord_id, data);

  const embed = new EmbedBuilder()
    .setTitle('⛏️ Mined!')
    .setColor(0x95A5A6)
    .setDescription(`Found **${ore.name}** (worth ${ore.baseValue} 💰 raw)`)
    .addFields(
      { name: '📦 Inventory', value: `Iron: ${ores.iron} | Gold: ${ores.gold} | Gem: ${ores.gem}`, inline: false },
      { name: '⛏️ Digs Today', value: `${digs + 1}/10`, inline: true },
    )
    .setFooter({ text: 'Sell raw: /job sell | Smelt for double: /job smelt <ore>' });

  if (digs + 1 < 10) {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mine_again').setLabel('⛏️ Mine Again').setStyle(ButtonStyle.Primary),
    );
    const updated = await msg.edit({ embeds: [embed], components: [row] });

    try {
      const btn = await updated.awaitMessageComponent({
        filter: i => i.user.id === player.discord_id && i.customId === 'mine_again',
        time: 30_000,
      });
      await btn.deferUpdate();
      const fresh = db.select().from(players).where(eq(players.discord_id, player.discord_id)).get();
      if (!fresh || fresh.job !== 'miner') return btn.editReply({ content: '❌ You are no longer a miner.', embeds: [], components: [] });
      const freshDigs = todayReset(fresh) ? 0 : (jobData(fresh).miner_digs || 0);
      if (freshDigs >= 10) return btn.editReply({ content: '❌ Daily dig limit reached (10).', embeds: [], components: [] });
      return doMine(updated, fresh);
    } catch {
      msg.edit({ components: [] }).catch(() => {});
    }
  } else {
    await msg.edit({ embeds: [embed] });
  }
}

async function mine(interaction, player) {
  if (!await requireJob(interaction, player, 'miner')) return;

  const data = jobData(player);
  const digs = todayReset(player) ? 0 : (data.miner_digs || 0);
  if (digs >= 10) return interaction.editReply('❌ Daily dig limit reached (10). Resets on daily claim.');

  const msg = await interaction.fetchReply();
  return doMine(msg, player);
}

async function smelt(interaction, player) {
  if (!await requireJob(interaction, player, 'miner')) return;

  const oreId = interaction.options.getString('ore');
  const ore = ORES.find(o => o.id === oreId);
  if (!ore) return interaction.editReply('❌ Unknown ore.');

  const data = jobData(player);
  const ores = data.miner_ores || {};
  if (!ores[oreId] || ores[oreId] <= 0) return interaction.editReply(`❌ You don't have any **${ore.name}** to smelt.`);

  ores[oreId] -= 1;
  const success = Math.random() < 0.5;
  const value = success ? ore.baseValue * 2 : 0;

  data.miner_ores = ores;
  saveJobData(interaction.user.id, data);
  sqlite.transaction(() => {
    const fPlayer = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fPlayer) return;
    db.update(players).set({ yen: fPlayer.yen + value }).where(eq(players.discord_id, interaction.user.id)).run();
  })();

  const embed = new EmbedBuilder()
    .setTitle(success ? '🔥 Smelt Success!' : '💥 Smelt Failed!')
    .setColor(success ? 0x2ECC71 : 0xE74C3C)
    .setDescription(success
      ? `Refined **${ore.name}** → sold for **${value} 💰** (2x!)`
      : `**${ore.name}** was destroyed in the process. Lost **${ore.baseValue} 💰**.`);
  await interaction.editReply({ embeds: [embed] });
}

async function sell(interaction, player) {
  if (!await requireJob(interaction, player, 'miner')) return;

  const data = jobData(player);
  const ores = data.miner_ores || {};

  let total = 0;
  for (const ore of ORES) {
    const qty = ores[ore.id] || 0;
    total += qty * ore.baseValue;
  }

  if (total === 0) return interaction.editReply('❌ No ores to sell. Use `/job mine`.');

  data.miner_ores = { iron: 0, gold: 0, gem: 0 };
  saveJobData(interaction.user.id, data);
  sqlite.transaction(() => {
    const fPlayer = db.select().from(players).where(eq(players.discord_id, interaction.user.id)).get();
    if (!fPlayer) return;
    db.update(players).set({ yen: fPlayer.yen + total }).where(eq(players.discord_id, interaction.user.id)).run();
  })();

  const embed = new EmbedBuilder()
    .setTitle('💰 Ores Sold')
    .setColor(0x2ECC71)
    .setDescription(`Sold all raw ore for **${total} 💰**`);
  await interaction.editReply({ embeds: [embed] });
}

async function ores(interaction, player) {
  if (!await requireJob(interaction, player, 'miner')) return;
  const data = jobData(player);
  const ores = data.miner_ores || {};
  const digs = todayReset(player) ? 0 : (data.miner_digs || 0);
  const list = ORES.map(o => {
    const qty = ores[o.id] || 0;
    return `${o.name}: **${qty}** (${qty * o.baseValue} 💰 raw)`;
  }).join('\n');
  const totalOres = Object.values(ores).reduce((a, b) => a + b, 0);
  const totalValue = ORES.reduce((s, o) => s + (ores[o.id] || 0) * o.baseValue, 0);
  const embed = new EmbedBuilder()
    .setTitle('⛏️ Ore Inventory')
    .setColor(0x95A5A6)
    .setDescription(list)
    .setFooter({ text: `Total: ${totalOres} ores worth ${totalValue} 💰 | Digs: ${digs}/10` });
  await interaction.editReply({ embeds: [embed] });
}
