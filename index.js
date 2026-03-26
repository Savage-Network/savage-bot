'use strict';

require('dotenv').config();
const { createClient } = require('./src/bot');
const config = require('./src/config');

const client = createClient();
client.login(config.token());
