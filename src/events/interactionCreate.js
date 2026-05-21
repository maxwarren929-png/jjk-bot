module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction, client) {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      try {
        await command.execute(interaction);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Command error [${interaction.commandName}]:`, err);
        try {
          const msg = { content: '❌ Something went wrong executing that command.', flags: 64 };
          if (interaction.replied || interaction.deferred) await interaction.followUp(msg);
          else await interaction.reply(msg);
        } catch (fallbackErr) {
          console.error('Failed to send error reply:', fallbackErr.message);
        }
      }
    } else if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;
      try {
        await command.autocomplete(interaction);
      } catch (err) {
        console.error(`Autocomplete error [${interaction.commandName}]:`, err);
      }
    }
  },
};
