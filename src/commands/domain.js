const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { db } = require('../db/index');
const { players } = require('../db/schema');
const { eq } = require('drizzle-orm');
const { getTechniqueById } = require('../systems/techniques');
const { activateDomain } = require('../systems/domain-state');

const RATE_LIMIT_MS = 30 * 1000;
const DOMAIN_COST = 150;
const DOMAIN_DURATION_MS = 5 * 60 * 1000;

const GRADE_ORDER = ['Grade 4', 'Grade 3', 'Grade 2', 'Grade 1', 'Semi-Special Grade', 'Special Grade'];
const MIN_GRADE_INDEX = GRADE_ORDER.indexOf('Grade 2');

const DOMAIN_LORE = {
  limitless:          { name: 'Unlimited Void', desc: 'The target is showered with infinite information — stimuli, knowledge, truth — until nothing matters. They are paralysed.' },
  ten_shadows:        { name: 'Chimera Shadow Garden', desc: 'Darkness swallows everything. Countless shadow shikigami materialize, limitless and obedient.' },
  boogie_woogie:      { name: 'Chaotic Exchange', desc: 'The very concept of position collapses. Past, present, and future locations flicker wildly.' },
  hairpin:            { name: 'Coffin of the Iron Mountain', desc: 'Time slows to a crawl. The 0.7 ratio point is everywhere — there is nowhere to stand that is safe.' },
  blood_manipulation: { name: 'Blood Sea', desc: 'The domain floods with crimson. Every breath draws blood into the lungs.' },
  puppet_manipulation:{ name: 'Marionette Theater', desc: 'Strings extend from every shadow. Nothing moves except by your permission.' },
  disaster_flames:    { name: 'Coffin of the Iron Mountain', desc: 'The temperature exceeds the surface of the sun. The air itself burns.' },
  disaster_plants:    { name: 'Disaster Forest', desc: 'An ancient forest appears, roots that extend to crush, vines that suffocate.' },
  cursed_speech:      { name: 'Inumaki\'s Domain', desc: 'Words echo infinitely. Every syllable becomes a command. Silence is impossible.' },
  idle_transfiguration:{ name: 'Self-Embodiment of Perfection', desc: 'Souls are rearranged at will. The body becomes irrelevant. Nothing is as it was.' },
  projection_sorcery: { name: 'Frame Cinema', desc: 'Time decomposes into 24 frames per second. Every frame is a choice. You have made them all.' },
  timekeeper:         { name: 'Temporal Collapse', desc: 'All timelines converge. Past actions replay. Future actions echo backward.' },
  veil_weaver:        { name: 'Absolute Barrier', desc: 'A perfect sphere of cursed energy. Nothing enters. Nothing leaves.' },
  null_void:          { name: 'Void of Negation', desc: 'The domain exists between states — neither is nor is not. Techniques dissolve on contact.' },
  dismantle:          { name: 'Malevolent Shrine', desc: 'A barrierless domain of pure destruction. Slashes rain ceaselessly — there is nowhere to hide.' },
  star_rage:          { name: 'Star Rage: Infinite Mass', desc: 'Virtual mass approaches infinity. Every strike carries the weight of a star.' },
  deadly_sentencing:  { name: 'Deadly Sentencing', desc: 'The courtroom manifests. All are judged. There is no appeal.' },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('domain')
    .setDescription('Unleash your Domain Expansion. Costs 150 CE. Requires Grade 2 or higher.'),

  async execute(interaction) {
    await interaction.deferReply();
    const discordId = interaction.user.id;
    const player = db.select().from(players).where(eq(players.discord_id, discordId)).get();

    if (!player) { await interaction.editReply('❌ Run `/profile` first.'); return; }
    if (player.is_broken) { await interaction.editReply('❌ You are **Broken** and cannot use Domain Expansion.'); return; }

    const gradeIndex = GRADE_ORDER.indexOf(player.grade);
    if (gradeIndex < MIN_GRADE_INDEX) {
      await interaction.editReply(`❌ Domain Expansion requires **Grade 2** or higher. You are **${player.grade}**.`); return;
    }
    if (player.ce < DOMAIN_COST) {
      await interaction.editReply(`❌ Not enough CE. Domain costs **150 CE**, you have **${player.ce}**.`); return;
    }

    const now = Date.now();
    if (player.last_domain_at && now - player.last_domain_at < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (now - player.last_domain_at)) / 1000);
      await interaction.editReply(`⏳ Domain cooldown: **${wait}s** remaining.`); return;
    }

    const innate = getTechniqueById(player.innate_technique_id);
    const lore = DOMAIN_LORE[player.innate_technique_id] || { name: `${innate?.name || 'Unknown'} Domain`, desc: 'The cursed energy coalesces into a pocket reality.' };

    db.update(players).set({ ce: player.ce - DOMAIN_COST, last_domain_at: now })
      .where(eq(players.discord_id, discordId)).run();
    activateDomain(discordId);

    // Create a temporary channel
    let domainChannel = null;
    try {
      domainChannel = await interaction.guild.channels.create({
        name: `🔮-${interaction.user.username}-domain`,
        type: ChannelType.GuildText,
        parent: interaction.channel.parentId ?? undefined,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          },
        ],
        reason: 'Domain Expansion',
      });
    } catch {
      // Fall back to posting in the current channel
    }

    const domainEmbed = new EmbedBuilder()
      .setTitle(`🔮 DOMAIN EXPANSION: ${lore.name.toUpperCase()}`)
      .setColor(0x7B2FBE)
      .setDescription(`*The world shatters. Reality is replaced.*\n\n${lore.desc}\n\n**All attacks deal 1.25× damage inside this domain.**`)
      .addFields(
        { name: '👁️ Sorcerer', value: interaction.user.username, inline: true },
        { name: '💜 CE Spent', value: '150', inline: true },
        { name: '⏱️ Duration', value: '5 minutes', inline: true },
      )
      .setFooter({ text: 'The channel will be deleted when the domain collapses.' });

    if (domainChannel) {
      await domainChannel.send({ embeds: [domainEmbed] });
      await interaction.editReply({ content: `🔮 Domain opened: ${domainChannel}`, embeds: [] });
      setTimeout(async () => {
        try { await domainChannel.delete(); } catch { /* already gone */ }
      }, DOMAIN_DURATION_MS);
    } else {
      await interaction.editReply({ embeds: [domainEmbed] });
    }
  },
};
