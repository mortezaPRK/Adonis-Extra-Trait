const path = require('path');

let SQLITE = (process.env.SQLITE_DB_PATH || ':memory:').trim();

if (SQLITE !== ':memory:') {
  if (!SQLITE.startsWith('/')) {
    SQLITE = path.join(__dirname, SQLITE);
  }
  SQLITE = {filename: SQLITE};
}

const DB_CONFIG = {
  connection: process.env.APP_DB || 'sqlite3',

  sqlite3: {
    client: 'sqlite3',
    connection: SQLITE,
  },

  mysql: {
    client: 'mysql',
    connection: {
      user: process.env.APP_MYSQL_USER || 'root',
      password: process.env.APP_MYSQL_PASSWORD || 'root',
      database: process.env.APP_MYSQL_DATABASE || 'default',
    },
  },

  pg: {
    client: 'pg',
    connection: {
      user: process.env.APP_PG_USER || 'postgres',
      password: process.env.APP_PG_PASSWORD || 'postgres',
      database: process.env.APP_PG_DATABASE || 'default',
    },
  },
};

const REDIS_CONFIG = {
  connection: 'local',
  local: {
    host: process.env.APP_REDIS_HOST || 'redis',
    port: process.env.APP_REDIS_PORT || '6379',
    password: null,
    db: 0,
    keyPrefix: '',
  },
  anotherLocal: {
    host: process.env.APP_REDIS_HOST || 'redis2',
    port: process.env.APP_REDIS_PORT || '6379',
    password: null,
    db: 0,
    keyPrefix: '',
  },
};


module.exports = {
  redis: REDIS_CONFIG,
  database: DB_CONFIG,
  sqliteFilePath: SQLITE,
};
