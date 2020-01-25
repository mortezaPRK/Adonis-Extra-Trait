const path = require('path');

const SQLITE_DB_PATH = path.join(__dirname, 'test.sqlite3');

const DB_CONFIG = {
  connection: process.env.APP_DB || 'sqlite3',

  sqlite3: {
    client: 'sqlite3',
    connection: {
      filename: SQLITE_DB_PATH,
    },
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
      password: process.env.APP_PG_PASSSWORD || 'postgres',
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
    host: process.env.APP_REDIS_HOST || 'redis',
    port: process.env.APP_REDIS_PORT || '6379',
    password: null,
    db: 1,
    keyPrefix: '',
  },
};


module.exports = {
  redis: REDIS_CONFIG,
  database: DB_CONFIG,
  sqliteFilePath: SQLITE_DB_PATH,
};
