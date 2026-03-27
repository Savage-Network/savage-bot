'use strict';

const config = require('./config');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesMessage(content, item) {
  const trigger = String(item.trigger ?? '').trim();
  const response = String(item.response ?? '').trim();
  if (!trigger || !response) return false;

  const wholeWord = !!item.wholeWord;
  const caseSensitive = !!item.caseSensitive;

  if (wholeWord) {
    const re = new RegExp(
      `\\b${escapeRegex(trigger)}\\b`,
      caseSensitive ? '' : 'i'
    );
    return re.test(content);
  }

  const text = caseSensitive ? content : content.toLowerCase();
  const tr = caseSensitive ? trigger : trigger.toLowerCase();
  return text.includes(tr);
}

function registerAutoResponses(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const list = config.autoResponses();
    if (!list.length) return;

    const content = message.content;
    if (!content || !String(content).trim()) return;

    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      if (!matchesMessage(content, item)) continue;

      const reply = String(item.response).trim().slice(0, 2000);
      if (!reply) continue;

      await message.channel.send(reply).catch(() => {});
      break;
    }
  });
}

module.exports = { registerAutoResponses };
