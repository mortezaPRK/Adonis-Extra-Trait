const {ServiceProvider} = require('@adonisjs/fold');

// eslint-disable-next-line max-len
const REDIS_COMMAND = 'if tonumber(redis.call(\'get\', KEYS[1]) or 0) < tonumber(KEYS[2]) then redis.call(\'set\', KEYS[1], KEYS[2]); redis.call(\'set\', KEYS[3], KEYS[4]) end';

class TraitProvider extends ServiceProvider {
  register() {
    this.app.bind('Prk/Traits/CachedAttribute', () => {
      return new (require('./src/traits/CachedAttribute'));
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
    if (Array.isArray(loadScript)) {
      return Promise.all(loadScript.map((ls) => loader(Redis.connection(ls))));
    }

    throw new Error('unknown option');
  }
}

module.exports = TraitProvider;
