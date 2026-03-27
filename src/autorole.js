'use strict';

const config = require('./config');

function registerAutorole(client) {
  client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;

    const roleId = config.autoroleRoleId();
    if (!roleId) return;

    const role = member.guild.roles.cache.get(roleId);
    if (!role) {
      console.warn('[autorole] Cargo não encontrado:', roleId);
      return;
    }

    try {
      await member.roles.add(role, 'Autorole SavageMC');
    } catch (err) {
      console.warn('[autorole]', err.message);
    }
  });
}

module.exports = { registerAutorole };
