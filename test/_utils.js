const fs = require('fs');
const path = require('path');

/**
 *
 * Reads a value from env, with prefixed `APP_` to avoid
 *  any possible conflict with other env vars
 *
 * @param {string} envName
 * @param {string} defaultValue
 * @return {string}
 */
const e = (envName, defaultValue) => (process.env[`APP_${envName}`] || defaultValue).trim();

/**
 * Remove a file by full path, whether file exists or not
 * @param {string} fileName
 * @return {Promise<void>}
 */
const removeTempFile = (fileName) => new Promise((resolve) => fs.unlink(fileName, () => resolve()));

/**
 * Configuration object for Sqlite
 * @property {object} connectionConfig - connection config for knex
 * @property {string|null} journalPath - path of sqlite journal
 * @property {bool} inMemory - whether sqlite is in memory or disk
 */
const {connectionConfig, journalPath, inMemory} = (() => {
  let connectionConfig = e('SQLITE_DB_PATH', ':memory:');
  const inMemory = connectionConfig === ':memory:';

  let journalPath;

  if (!inMemory) {
    if (!connectionConfig.startsWith('/')) {
      connectionConfig = path.join(__dirname, connectionConfig);
    }
    journalPath = connectionConfig + '-journal';
    connectionConfig = {filename: connectionConfig};
  }
  return {
    connectionConfig,
    journalPath,
    inMemory,
  };
})();

/**
 * Generated list of file path to included to test
 */
const testFiles = (() => {
  const envFiles = process.env.TEST_FILES;
  if (envFiles == null) {
    return ['test/*.spec.js'];
  }
  return envFiles.trim().split(',').map((i) => i.trim());
})();

/**
 * same as 'Adonis' config/database.js file
 */
const DB_CONFIG = {
  connection: e('DB', 'sqlite3'),

  sqlite3: {client: 'sqlite3', connection: connectionConfig},

  mysql: {
    client: 'mysql',
    connection: {
      user: e('MYSQL_USER', 'root'),
      password: e('MYSQL_PASSWORD', 'root'),
      database: e('MYSQL_DATABASE', 'default'),
    },
  },

  pg: {
    client: 'pg',
    connection: {
      user: e('PG_USER', 'postgres'),
      password: e('PG_PASSWORD', 'postgres'),
      database: e('PG_DATABASE', 'default'),
    },
  },
};

/**
 * same as 'Adonis' config/redis.js file
 */
const REDIS_CONFIG = {
  connection: 'local',
  local: {
    host: e('REDIS_HOST', 'redis'),
    port: e('REDIS_PORT', '6379'),
    password: null,
    db: 0,
    keyPrefix: '',
  },
  anotherLocal: {
    host: e('REDIS_HOST', 'redis2'),
    port: e('REDIS_PORT', '6379'),
    password: null,
    db: 0,
    keyPrefix: '',
  },
};


module.exports = {
  redisConfig: REDIS_CONFIG,
  databaseConfig: DB_CONFIG,
  sqliteConfig: {
    inMemory,
    journalPath,
    filePath: inMemory ? null : connectionConfig.filename,
  },
  redisConnectionNames: Object.keys(REDIS_CONFIG).filter((i) => i !== 'connection'),
  testFiles,
  removeTempFile,
};
