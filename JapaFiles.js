const fs = require('fs');
const {configure} = require('japa');

const iocResolver = require('@adonisjs/lucid/lib/iocResolver');
const fold = require('@adonisjs/fold');
const {Config, setupResolver} = require('@adonisjs/sink');

const LucidProvider = require('@adonisjs/lucid/providers/LucidProvider');
const RedisProvider = require('@adonisjs/redis/providers/RedisProvider');
const TraitProvider = require('.');

const {database, redis, sqliteFilePath} = require('./test-config');

const testFiles = () => {
  const envFiles = process.env.TEST_FILES;
  if (envFiles == null) {
    return ['test/*.spec.js'];
  }
  return envFiles.trim().split(',').map((i) => i.trim());
};

configure({
  files: testFiles(),
  bail: process.env.TEST_BAIL == null,
  before: [
    () => {
      // Resolver
      iocResolver.setFold(fold);
      setupResolver();
    },
    () => {
      // Config
      fold.ioc.singleton('Adonis/Src/Config', () => new Config());
      fold.ioc.alias('Adonis/Src/Config', 'Config');
    },
    () => {
      const config = fold.ioc.use('Config');
      config.set('database', database);
      config.set('redis', {...redis, loadScript: ['local', 'anotherLocal']});
    },
    async () => {
      // Database
      const provider = new LucidProvider(fold.ioc);
      provider.register();
      await provider.boot();
    },
    () => {
      // Redis
      const provider = new RedisProvider(fold.ioc);
      provider.register();
    },
    async () => {
      // Main
      const provider = new TraitProvider(fold.ioc);
      provider.register();
      await provider.boot();
    },
  ],
  after: [
    async () => {
      const Database = fold.ioc.use('Database');
      const Redis = fold.ioc.use('Redis');
      await Database.close();
      await Redis.quit(['local', 'anotherLocal']);

      if (fs.existsSync(sqliteFilePath)) {
        fs.unlinkSync(sqliteFilePath);
      }
      const journal = `${sqliteFilePath}-journal`;
      if (fs.existsSync(journal)) {
        fs.unlinkSync(journal);
      }
    },
  ],
});
