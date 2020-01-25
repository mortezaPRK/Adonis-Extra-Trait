const test = require('japa');
const {ioc} = require('@adonisjs/fold');

const Model = ioc.use('Model');

// eslint-disable-next-line max-len
const REDIS_COMMAND = 'if tonumber(redis.call(\'get\', KEYS[1]) or 0) < tonumber(KEYS[2]) then redis.call(\'set\', KEYS[1], KEYS[2]); redis.call(\'set\', KEYS[3], KEYS[4]) end';

const {CachedAttribute, Singleton} = require('../index');

const registerCustomCommand = async (redisClient) => {
  await redisClient.script('flush');
  await redisClient.script('load', REDIS_COMMAND);
};

test.group('CachedAttribute', (group) => {
  group.before(async () => {
    const Database = ioc.use('Database');
    await Database.schema.createTable('users', (table) => {
      table.increments();
      table.integer('f1').notNullable();
      table.string('f2').notNullable();
      table.bool('f3').notNullable();
      table.timestamps();
    });
    await Database.close();
  });

  group.afterEach(async () => {
    const Database = ioc.use('Database');
    await Database.table('users').truncate();
    await Database.close();

    const Redis = ioc.use('Redis');
    await Promise.all([
      Redis.del('cached_attrs_User'),
      Redis.del('cached_attrs_User_lock'),
      Redis.connection('anotherLocal').del('cached_attrs_User'),
      Redis.connection('anotherLocal').del('cached_attrs_User_lock'),
    ]);
    await Redis.quit(['local', 'anotherLocal']);
  });

  group.after(async () => {
    const Database = ioc.use('Database');
    await Database.schema.dropTable('users');
    await Database.close();
  });

  test('Fail with non array field', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            CachedAttribute,
            {
              fields: 'f1',
            },
        );
      }
    }
    let error;
    try {
      User._bootIfNotBooted();
    } catch (e) {
      error = e;
    }
    assert.instanceOf(
        error,
        Error,
        `model with non-array 'fields' should fail`,
    );

    assert.match(
        error.message,
        /.*: fields should be a non-empty array$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Fail with empty field', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            CachedAttribute,
            {
              fields: [],
            },
        );
      }
    }
    let error;
    try {
      User._bootIfNotBooted();
    } catch (e) {
      error = e;
    }
    assert.instanceOf(
        error,
        Error,
        `model with empty array 'fields' should fail`,
    );

    assert.match(
        error.message,
        /.*: fields should be a non-empty array$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Fail with no Singleton', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    let error;
    try {
      User._bootIfNotBooted();
    } catch (e) {
      error = e;
    }
    assert.instanceOf(
        error,
        Error,
        `model without Singleton trait should fail`,
    );

    assert.match(
        error.message,
        /.*: shoud be Singleton$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Fail with defered Singleton', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
        this.addTrait(
            Singleton,
        );
      }
    }
    let error;
    try {
      User._bootIfNotBooted();
    } catch (e) {
      error = e;
    }
    assert.instanceOf(
        error,
        Error,
        `model with differed Singleton trait should fail`,
    );

    assert.match(
        error.message,
        /.*: shoud be Singleton$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Registeration', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }

    User._bootIfNotBooted();
    assert.isTrue(
        User.isSingleton,
        `expected model to have isSingleton with 'true' as value`,
    );

    assert.isArray(
        User.$hooks.before._handlers['update'],
        'hook for beforeUpdate not registered!',
    );

    assert.lengthOf(
        User.$hooks.before._handlers['update'],
        1,
        'hook for beforeUpdate not registered correctly!',
    );

    assert.isArray(
        User.$hooks.after._handlers['create'],
        'hook for afterCreate not registered!',
    );

    assert.lengthOf(
        User.$hooks.after._handlers['create'],
        1,
        'hook for afterCreate not registered correctly!',
    );

    assert.isFunction(
        User.warmUp,
        'warmUp not registered!',
    );

    assert.isFunction(
        User.getCached,
        'getCached not registered!',
    );

    assert.strictEqual(
        User.cachedName,
        'cached_attrs_User',
        'cachedName is not set correctly',
    );
  });

  test('Fail on Empty DB', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    User._bootIfNotBooted();

    let error;
    try {
      await User.warmUp();
    } catch (e) {
      error = e;
    }

    assert.instanceOf(
        error,
        Error,
        'expcted warmUp to error if Database is empty',
    );
    assert.match(
        error.message,
        /.*: nothing to get$/m,
        `Unknown error was thrown!`,
    );

    error = null;
    try {
      await User.getCached();
    } catch (e) {
      error = e;
    }

    assert.instanceOf(
        error,
        Error,
        'expcted getCached to error if Database is empty',
    );
    assert.match(
        error.message,
        /.*: nothing to get$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Hook for afterCreate', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();

    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    const user = await User.create(attrs);

    const redisValue = await Redis.get(User.cachedName);
    const redisLockValue = await Redis.get(`${User.cachedName}_lock`);

    assert.strictEqual(
        user.id,
        +redisLockValue,
        'lock value is incorrect',
    );
    let redisValueParsed;
    try {
      redisValueParsed = JSON.parse(redisValue);
    } catch (e) {
      assert.fail(`wrong value set in Redis ${redisValue} (${e.message})`);
    }

    assert.deepEqual(
        {
          f1: attrs.f1,
          f2: attrs.f2,
        },
        redisValueParsed,
        `Serializations error`,
    );
  });

  test('Race Condition', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();
    let i = 0;
    const users = [...new Array(100)].map(() => {
      i++;
      return {
        f1: i,
        f2: (i * 2).toString(),
        f3: i % 2 === 0,
      };
    });

    await Promise.all(users.map((d) => User.create(d)));

    const lastSaveValues = {
      f1: 100,
      f2: '200',
    };

    const lastById = await User.query().orderBy('id', 'desc').first();
    const redisValue = await Redis.get(User.cachedName);

    let redisValueParsed;
    try {
      redisValueParsed = JSON.parse(redisValue);
    } catch (e) {
      assert.fail(`value set incorreclty: (${redisValue}) -> ${e.message}`);
    }

    assert.deepEqual(
        {
          f1: lastById.f1,
          f2: lastById.f2,
        },
        redisValueParsed,
        'Redis values differs from DB',
    );

    assert.deepEqual(
        lastSaveValues,
        redisValueParsed,
        'Redis values differs from last saved values',
    );
  }).timeout(0);

  test('Warm up', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    const user = await User.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleteing',
    );

    const warmUpValue = await User.warmUp();

    assert.deepEqual(
        cachedAttrs,
        warmUpValue,
        'warmUp returns wrong value',
    );

    const redisValue = await Redis.get(User.cachedName);

    const redisValueParsed = JSON.parse(redisValue);

    assert.deepEqual(
        redisValueParsed,
        cachedAttrs,
        'warmUp saved incorrect values',
    );

    assert.deepEqual(
        await Redis.get(`${User.cachedName}_lock`),
        user.id.toString(),
        'warm up saved incorrect lock value',
    );
  });

  test('Get cached with redis value', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await User.create(attrs);

    const redisValue = await Redis.get(User.cachedName);

    const redisValueParsed = JSON.parse(redisValue);

    const byStaticMethod = await User.getCached();

    assert.deepEqual(
        byStaticMethod,
        redisValueParsed,
        `getCached returned wrong values`,
    );

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleteing',
    );

    await User.warmUp();

    assert.deepEqual(
        redisValueParsed,
        await User.getCached(),
        'getCached returns wrong values when warmed up',
    );

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleteing',
    );

    assert.deepEqual(
        redisValueParsed,
        await User.getCached(),
        'getCached returns wrong values when redis is empty',
    );
  });

  test('Get cached without redis value', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await User.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleteing',
    );

    assert.deepEqual(
        cachedAttrs,
        await User.getCached(),
        'getCached returns wrong values when warmed up',
    );
  });

  test('Get cached without redis value (warmed up)', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await User.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleteing',
    );

    await User.warmUp();

    assert.deepEqual(
        cachedAttrs,
        await User.getCached(),
        'getCached returns wrong values when warmed up',
    );
  });

  test('Warm up', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    const user = await User.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleteing',
    );

    const warmUpValue = await User.warmUp();

    assert.deepEqual(
        cachedAttrs,
        warmUpValue,
        'warmUp returns wrong value',
    );

    const redisValue = await Redis.get(User.cachedName);

    const redisValueParsed = JSON.parse(redisValue);

    assert.deepEqual(
        redisValueParsed,
        cachedAttrs,
        'warmUp saved incorrect values',
    );

    assert.deepEqual(
        await Redis.get(`${User.cachedName}_lock`),
        user.id.toString(),
        'warm up saved incorrect lock value',
    );
  });

  test('Should use custom redis if specified', async (assert) => {
    const Redis = ioc.use('Redis');
    const secondRedis = Redis.connection('anotherLocal');
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
              redis: secondRedis,
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    await registerCustomCommand(secondRedis);
    User._bootIfNotBooted();

    const cachedAttrs = {
      f1: 1,
      f2: 'lorem ipsum',
    };

    await User.create({
      ...cachedAttrs,
      f3: true,
    });

    const redisValue = await Redis.get(User.cachedName);

    assert.isNull(
        redisValue,
        `should be null when specified another redis connection`,
    );

    const secondRedisValue = await secondRedis.get(User.cachedName);

    assert.deepEqual(
        cachedAttrs,
        JSON.parse(secondRedisValue),
        `values saved incorrectly in second redis`,
    );
  });

  test.failing('Will not work in transaction', async (assert) => {
    const Redis = ioc.use('Redis');
    const Database = ioc.use('Database');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            Singleton,
        );
        this.addTrait(
            CachedAttribute,
            {
              fields: ['f1', 'f2'],
            },
        );
      }
    }
    await registerCustomCommand(Redis);
    User._bootIfNotBooted();

    const cachedAttrs = {
      f1: 1,
      f2: 'lorem ipsum',
    };

    await User.create({
      ...cachedAttrs,
      f3: true,
    });

    const trx = await Database.beginTransaction();
    await User.create({
      f1: 2,
      f2: 'ipsum lorem',
      f3: false,
    }, trx);
    await trx.rollback();

    const redisValue = await Redis.get(User.cachedName);
    const redisLockValue = await Redis.get(`${User.cachedName}_lock`);

    const redisValueParsed = JSON.parse(redisValue);

    assert.deepEqual(
        {
          lock: 1,
          ...cachedAttrs,
        },
        {
          lock: +redisLockValue,
          ...redisValueParsed,
        },
        `values saved incorrectly in transaction redis`,
    );
  });
});