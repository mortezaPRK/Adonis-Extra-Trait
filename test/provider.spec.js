const test = require('japa');
const {ioc} = require('@adonisjs/fold');

const BINDINGS = [
  'Prk/Traits/CachedAttribute',
  'Prk/Traits/NoTimestamp',
  'Prk/Traits/Singleton',
  'Prk/Helper/RedisCustomCommand',
  'Prk/Helper/RedisCustomCommandDetail',
];

test.group('Provider', () => {
  test('Registration', (assert) => {
    assert.containsAllKeys(
        ioc._bindings,
        BINDINGS,
        'bindings not registered correctly',
    );
  });

  test('Boot with no redis', async (assert) => {
    const TraitProvider = require('../index');
    const provider = new TraitProvider(ioc);
    const {hash} = ioc.use('Prk/Helper/RedisCustomCommandDetail');
    const Config = ioc.use('Config');
    const Redis = ioc.use('Redis');

    const isRegistered = async () => (await Redis.script('exists', hash))[0] === 1;


    await Redis.script('flush');

    assert.isFalse(
        await isRegistered(),
        'redis did not flush',
    );

    const oldConfig = Config._config['redis'];

    /**
     * No Redis Config at all
     */
    delete Config._config['redis'];

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isFalse(
        await isRegistered(),
        'command should not be registered in redis',
    );

    /**
     * Redis Config with no `loadScript`
     */
    delete Config._config['redis']['loadScript'];

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isFalse(
        await isRegistered(),
        'command should not be registered in redis',
    );
  });

  test('Boot with redis', async (assert) => {
    const TraitProvider = require('../index');
    const provider = new TraitProvider(ioc);
    const {hash} = ioc.use('Prk/Helper/RedisCustomCommandDetail');
    const Config = ioc.use('Config');
    const Redis = ioc.use('Redis');
    const anotherRedis = Redis.connection('anotherLocal');

    const isRegistered = async (redis) => (await redis.script('exists', hash))[0] === 1;
    const cleanAll = () => Promise.all([
      Redis.script('flush'),
      anotherRedis.script('flush'),
    ]);

    await cleanAll();

    assert.isFalse(
        await isRegistered(Redis),
        'redis did not flush',
    );
    assert.isFalse(
        await isRegistered(anotherRedis),
        'second redis did not flush',
    );

    const oldConfig = Config._config['redis'];

    /**
     * `loadScript` for main Redis only
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = true;

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isTrue(
        await isRegistered(Redis),
        'command should be registered in redis with `loadScript` -> true',
    );
    assert.isFalse(
        await isRegistered(anotherRedis),
        'command should not be registered in second redis with `loadScript` -> true',
    );

    /**
     * `loadScript` with connection name (1)
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = 'local';

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isTrue(
        await isRegistered(Redis),
        'command should be registered in redis with `loadScript` -> local',
    );
    assert.isFalse(
        await isRegistered(anotherRedis),
        'command should not be registered in second redis with `loadScript` -> local',
    );

    /**
     * `loadScript` with connection name (2)
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = 'anotherLocal';

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isFalse(
        await isRegistered(Redis),
        'command should be registered in redis with `loadScript` -> anotherLocal',
    );
    assert.isTrue(
        await isRegistered(anotherRedis),
        'command should not be registered in second redis with `loadScript` -> anotherLocal',
    );

    /**
     * `loadScript` with array of connection names (1)
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = ['anotherLocal'];

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isFalse(
        await isRegistered(Redis),
        'command should be registered in redis with `loadScript` -> anotherLocal',
    );
    assert.isTrue(
        await isRegistered(anotherRedis),
        'command should not be registered in second redis with `loadScript` -> anotherLocal',
    );

    /**
     * `loadScript` with array of connection names (2)
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = ['local'];

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isTrue(
        await isRegistered(Redis),
        'command should be registered in redis with `loadScript` -> anotherLocal',
    );
    assert.isFalse(
        await isRegistered(anotherRedis),
        'command should not be registered in second redis with `loadScript` -> anotherLocal',
    );

    /**
     * `loadScript` with array of connection names (3)
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = ['anotherLocal', 'local'];

    await provider.boot();

    Config._config['redis'] = oldConfig;

    assert.isTrue(
        await isRegistered(Redis),
        'command should be registered in redis with `loadScript` -> anotherLocal',
    );
    assert.isTrue(
        await isRegistered(anotherRedis),
        'command should not be registered in second redis with `loadScript` -> anotherLocal',
    );

    /**
     * `loadScript` with empty array
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = [];

    let error;
    try {
      await provider.boot();
    } catch (e) {
      error = e;
    }
    assert.instanceOf(
        error,
        Error,
        'no error thrown with empty array',
    );
    assert.strictEqual(
        error.message,
        'Unknown option provided for loadScript',
        'another error thrown!',
    );

    Config._config['redis'] = oldConfig;

    /**
     * `loadScript` with empty array
     */
    await cleanAll();
    Config._config['redis']['loadScript'] = {};

    let errors;
    try {
      await provider.boot();
    } catch (e) {
      errors = e;
    }
    assert.instanceOf(
        errors,
        Error,
        'no error thrown with empty array',
    );
    assert.strictEqual(
        errors.message,
        'Unknown option provided for loadScript',
        'another error thrown!',
    );

    Config._config['redis'] = oldConfig;
  });
});
