'use strict';

const config = require('./config');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Lista compilada: regex para wholeWord ou needle para substring.
 * @typedef {{ response: string, wholeWord: boolean, caseSensitive: boolean, re?: RegExp, needle?: string }} CompiledItem
 */

/** @type {CompiledItem[]|null} */
let compiled = null;
/** Referência ao array devolvido por config.autoResponses() na última compilação */
let compiledSourceRef = null;

function compileFromConfig() {
  const list = config.autoResponses();
  if (!list.length) return [];

  /** @type {CompiledItem[]} */
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const trigger = String(item.trigger ?? '').trim();
    const response = String(item.response ?? '').trim();
    if (!trigger || !response) continue;

    const wholeWord = !!item.wholeWord;
    const caseSensitive = !!item.caseSensitive;
    const entry = {
      response: response.slice(0, 2000),
      wholeWord,
      caseSensitive,
    };

    if (wholeWord) {
      try {
        entry.re = new RegExp(
          `\\b${escapeRegex(trigger)}\\b`,
          caseSensitive ? '' : 'i'
        );
      } catch {
        continue;
      }
    } else {
      entry.needle = caseSensitive ? trigger : trigger.toLowerCase();
    }
    out.push(entry);
  }
  return out;
}

function getCompiled() {
  const raw = config.autoResponses();
  if (raw === compiledSourceRef && compiled) return compiled;
  compiledSourceRef = raw;
  compiled = compileFromConfig();
  return compiled;
}

function matchesMessage(content, item) {
  if (item.wholeWord && item.re) {
    return item.re.test(content);
  }
  const text = item.caseSensitive ? content : content.toLowerCase();
  return text.includes(item.needle);
}

function registerAutoResponses(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const list = getCompiled();
    if (!list.length) return;

    const content = message.content;
    if (!content || !String(content).trim()) return;

    for (const item of list) {
      if (!matchesMessage(content, item)) continue;
      await message.channel.send(item.response).catch(() => {});
      break;
    }
  });
}

module.exports = { registerAutoResponses };
