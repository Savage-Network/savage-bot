'use strict';

require('dotenv').config();
const { registerSlashCommands } = require('./src/bot');

registerSlashCommands().catch((e) => {
  console.error(e);
  process.exit(1);
});
