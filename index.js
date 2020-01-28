const {ServiceProvider} = require('@adonisjs/fold');

// eslint-disable-next-line max-len
const REDIS_COMMAND = 'if tonumber(redis.call(\'get\', KEYS[1]) or 0) < tonumber(KEYS[2]) then redis.call(\'set\', KEYS[1], KEYS[2]); redis.call(\'set\', KEYS[3], KEYS[4]) end';
const REDIS_COMMAND_HASH = 'b02dd40a22f1e5e726ed5b6c7676f2803b7333fc';
const REDIS_COMMAND_KEYS = 4;

class TraitProvider extends ServiceProvider {
  register() {
    this.app.bind('Prk/Traits/CachedAttribute', () => {
      const CachedAttribute = require('./src/traits/CachedAttribute');
      return new CachedAttribute(REDIS_COMMAND_HASH, REDIS_COMMAND_KEYS);
    });
    this.app.bind('Prk/Traits/NoTimestamp', () => {
      return new (require('./src/traits/NoTimestamp'));
    });
    this.app.bind('Prk/Traits/Singleton', () => {
      return new (require('./src/traits/Singleton'));
    });

    this.app.singleton('Prk/Helper/RedisCustomCommand', () => {
      return async (redisClient) => {
        await redisClient.script('load', REDIS_COMMAND);
      };
    });

    this.app.singleton('Prk/Helper/RedisCustomCommandDetail', () => ({
      command: REDIS_COMMAND,
      hash: REDIS_COMMAND_HASH,
      numOfKeys: REDIS_COMMAND_KEYS,
    }));
  }

  async boot() {
    const Config = this.app.use('Config');
    const loadScript = Config.get('redis.loadScript', null);

    /**
     * Not Registered
     */
    if (loadScript == null) {
      return;
    }

    const loader = this.app.use('Prk/Helper/RedisCustomCommand');
    const Redis = this.app.use('Redis');

    /**
     * use Redis Provider
     */
    if (loadScript === true) {
      return loader(Redis);
    }

    /**
     * use Redis Provider, with another connection name
     */
    if (typeof(loadScript) === 'string') {
      return loader(Redis.connection(loadScript));
    }

    /**
     * use Redis Provider, with another connection names
     */
    if (Array.isArray(loadScript) && loadScript.length > 0) {
      return Promise.all(loadScript.map((ls) => loader(Redis.connection(ls))));
    }

    throw new Error('Unknown option provided for loadScript');
  }
}

module.exports = TraitProvider;
