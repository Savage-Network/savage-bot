'use strict';

/** Texto de copyright em todos os embeds (pt-BR). */
const COPYRIGHT = '© SavageMC · Todos os direitos reservados';

/**
 * @param {{ text?: string; iconURL?: string } | null | undefined} [existing]
 * @returns {{ text: string; iconURL?: string }}
 */
function footer(existing) {
  const t = existing?.text && String(existing.text).trim();
  if (t) {
    const out = { text: `${t} · ${COPYRIGHT}` };
    if (existing.iconURL) out.iconURL = existing.iconURL;
    return out;
  }
  return { text: COPYRIGHT };
}

module.exports = { COPYRIGHT, footer };
