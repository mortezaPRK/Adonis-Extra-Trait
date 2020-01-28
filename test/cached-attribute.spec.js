const test = require('japa');
const {ioc} = require('@adonisjs/fold');

const Model = ioc.use('Model');

const sequence = (max, random) => {
  let i = 1;
  const values = [...new Array(max)].map(() => i++).map((j) => [j, j.toString()]);
  if (!random) {
    return values;
  }

  const randomValues = [];
  let length = max;
  [...new Array(max)].forEach(() => {
    randomValues.push(values.splice(Math.floor(Math.random() * length), 1)[0]);
    length--;
  });
  return randomValues;
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
    await Database.schema.createTable('posts', (table) => {
      table.increments('pk');
      table.integer('f1').notNullable();
      table.string('f2').notNullable();
      table.bool('f3').notNullable();
      table.timestamps();
    });
  });

  group.afterEach(async () => {
    const Database = ioc.use('Database');
    await Database.table('users').truncate();
    await Database.table('posts').truncate();

    const Redis = ioc.use('Redis');
    await Promise.all([
      Redis.del('cached_attrs_User'),
      Redis.del('cached_attrs_User_lock'),
      Redis.connection('anotherLocal').del('cached_attrs_User'),
      Redis.connection('anotherLocal').del('cached_attrs_User_lock'),
      Redis.del('cached_attrs_Post'),
      Redis.del('cached_attrs_Post_lock'),
      Redis.connection('anotherLocal').del('cached_attrs_Post'),
      Redis.connection('anotherLocal').del('cached_attrs_Post_lock'),
    ]);
    await Redis.quit(['local', 'anotherLocal']);
  });

  group.after(async () => {
    const Database = ioc.use('Database');
    await Database.schema.dropTable('users');
    await Database.schema.dropTable('posts');
  });

  test('Redis custom command SHA', async (assert) => {
    const Redis = ioc.use('Redis');
    const {command, hash} = ioc.use('Prk/Helper/RedisCustomCommandDetail');
    const commandHash = await Redis.script('load', command);

    assert.strictEqual(
        commandHash,
        hash,
        'hash for redis command is incorrect',
    );
  });

  test('Redis custom command', async (assert) => {
    const Redis = ioc.use('Redis');
    const {command, hash, numOfKeys} = ioc.use('Prk/Helper/RedisCustomCommandDetail');

    await Redis.script('load', command);

    const lockName = 'lorem';
    const cacheName = 'ipsum';
    const lockValue = 10;
    const cacheValue = {
      a: 1,
      b: 'b',
      c: true,
      d: [1, 'b', false, []],
      e: {
        a: 1,
        b: 'b',
        c: true,
        d: [1, 'b', false, []],
        e: {},
      },
    };

    await Promise.all([
      Redis.del(cacheName),
      Redis.del(lockName),
    ]);

    await Redis.evalsha(hash, numOfKeys, lockName, lockValue, cacheName, JSON.stringify(cacheValue));

    const redisValueRaw = await Redis.get(cacheName);

    assert.deepEqual(
        JSON.parse(redisValueRaw),
        cacheValue,
        'cache value not saved correctly',
    );
    const redisLockValue = await Redis.get(lockName);

    assert.strictEqual(
        +redisLockValue,
        lockValue,
        'cache value not saved correctly',
    );
  });

  test('Redis custom command logic for lock', async (assert) => {
    const Redis = ioc.use('Redis');
    const {command, hash, numOfKeys} = ioc.use('Prk/Helper/RedisCustomCommandDetail');

    await Redis.script('load', command);

    const lockName = 'lorem';
    const cacheName = 'ipsum';

    await Promise.all([
      Redis.del(cacheName),
      Redis.del(lockName),
    ]);

    const save = async (lockValue, cacheValue) => Redis.evalsha(
        hash,
        numOfKeys,
        lockName,
        lockValue,
        cacheName,
        cacheValue,
    );

    const redisLockValue = async () => Redis.get(lockName);
    const redisCacheValue = async () => Redis.get(cacheName);

    /**
     * Saving when empty
     */
    await save(5, '5');
    assert.strictEqual(
        +(await redisLockValue()),
        5,
        'lock value not saved',
    );
    assert.strictEqual(
        await redisCacheValue(),
        '5',
        'cache value not saved',
    );

    /**
     * Saving with lower lock
     */
    await save(4, '4');
    assert.strictEqual(
        +(await redisLockValue()),
        5,
        'lock value changed when older one was greater!',
    );
    assert.strictEqual(
        await redisCacheValue(),
        '5',
        'cache value not saved while lock value is not',
    );

    /**
     * Saving with higher lock
     */
    await save(6, '6');
    assert.strictEqual(
        +(await redisLockValue()),
        6,
        'lock value not updated with higher value',
    );
    assert.strictEqual(
        await redisCacheValue(),
        '6',
        'cache value not saved while lock value updated!',
    );
  });

  test('Redis custom command concurrency', async (assert) => {
    const Redis = ioc.use('Redis');
    const {command, hash, numOfKeys} = ioc.use('Prk/Helper/RedisCustomCommandDetail');

    await Redis.script('load', command);

    const lockName = 'lorem';
    const cacheName = 'ipsum';

    const save = async (lockValue, cacheValue) => Redis.evalsha(
        hash,
        numOfKeys,
        lockName,
        lockValue,
        cacheName,
        cacheValue,
    );

    const redisLockValue = async () => Redis.get(lockName);
    const redisCacheValue = async () => Redis.get(cacheName);

    /**
     * Run 5, 10, 30, 60, 100 concurrent redis command
     * with values in a sequence (1,2,3,....)
     */
    for (const num of [5, 10, 30, 60, 100]) {
      await Promise.all([Redis.del(cacheName), Redis.del(lockName)]);
      const values = sequence(num);
      await Promise.all(values.map((i) => save(...i)));

      assert.strictEqual(
          +(await redisLockValue()),
          num,
          `expected lock to be ${num} in sequence of ${num}`,
      );
      assert.strictEqual(
          await redisCacheValue(),
          num.toString(),
          `value saved incorrectly for sequence of ${num}`,
      );
    }

    /**
     * Run 5, 10, 30, 60, 100 concurrent redis command
     * with values in a random sequence (12,7,2,66,....)
     */
    for (const num of [5, 10, 30, 60, 100]) {
      await Promise.all([Redis.del(cacheName), Redis.del(lockName)]);
      const values = sequence(num, true);
      await Promise.all(values.map((i) => save(...i)));

      assert.strictEqual(
          +(await redisLockValue()),
          num,
          `expected lock to be ${num} in random sequence of ${num}`,
      );

      assert.strictEqual(
          await redisCacheValue(),
          num.toString(),
          `value saved incorrectly for random sequence of ${num}`,
      );
    }
  });

  test('Fail with non array field', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: 'f1'});
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
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: []});
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
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
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
        /.*: should be Singleton$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Fail with deferred Singleton', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
        this.addTrait('@provider:Prk/Traits/Singleton');
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
        /.*: should be Singleton$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Registration', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
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
        Object.getOwnPropertyDescriptor(User, 'warmUp')['get'],
        'warmUp not registered!',
    );

    assert.isFunction(
        Object.getOwnPropertyDescriptor(User, 'cached')['get'],
        'cached not registered!',
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
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
    User._bootIfNotBooted();

    let error;
    try {
      await User.warmUp;
    } catch (e) {
      error = e;
    }

    assert.instanceOf(
        error,
        Error,
        'expected warmUp to error if Database is empty',
    );
    assert.match(
        error.message,
        /.*: nothing to get$/m,
        `Unknown error was thrown!`,
    );

    error = null;
    try {
      await User.cached;
    } catch (e) {
      error = e;
    }

    assert.instanceOf(
        error,
        Error,
        'expected cached to error if Database is empty',
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
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
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
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
    User._bootIfNotBooted();
    const users = sequence(10).map(([i, j]) => ({f1: i, f2: j, f3: i % 2 === true}));

    await Promise.all(users.map((d) => User.create(d)));

    const lastSaveValues = {
      f1: 10,
      f2: '10',
    };

    const lastById = await User.query().orderBy('id', 'desc').first();
    const redisValue = await Redis.get(User.cachedName);

    let redisValueParsed;
    try {
      redisValueParsed = JSON.parse(redisValue);
    } catch (e) {
      assert.fail(`value set incorrectly: (${redisValue}) -> ${e.message}`);
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

  test('Get cached with redis value', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
    User._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await User.create(attrs);

    const redisValue = await Redis.get(User.cachedName);

    const redisValueParsed = JSON.parse(redisValue);

    const byStaticMethod = await User.cached;

    assert.deepEqual(
        byStaticMethod,
        redisValueParsed,
        `cached returned wrong values`,
    );

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleting',
    );

    await User.warmUp;

    assert.deepEqual(
        redisValueParsed,
        await User.cached,
        'cached returns wrong values when warmed up',
    );

    await Redis.del(User.cachedName);

    assert.isNull(
        await Redis.get(User.cachedName),
        'Redis values should be null after deleting',
    );

    assert.deepEqual(
        redisValueParsed,
        await User.cached,
        'cached returns wrong values when redis is empty',
    );
  });

  test('Get cached without redis value', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
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
        'Redis values should be null after deleting',
    );

    assert.deepEqual(
        cachedAttrs,
        await User.cached,
        'cached returns wrong values when warmed up',
    );
  });

  test('Get cached without redis value (warmed up)', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
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
        'Redis values should be null after deleting',
    );

    await User.warmUp;

    assert.deepEqual(
        cachedAttrs,
        await User.cached,
        'cached returns wrong values when warmed up',
    );
  });

  test('Warm up', async (assert) => {
    const Redis = ioc.use('Redis');

    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
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
        'Redis values should be null after deleting',
    );

    const warmUpValue = await User.warmUp;

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

  test('Hook for afterCreate (non-default PK)', async (assert) => {
    const Redis = ioc.use('Redis');

    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();

    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    const post = await Post.create(attrs);

    const redisValue = await Redis.get(Post.cachedName);
    const redisLockValue = await Redis.get(`${Post.cachedName}_lock`);

    assert.strictEqual(
        post.pk,
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

  test('Race Condition (non-default PK)', async (assert) => {
    const Redis = ioc.use('Redis');

    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();
    const posts = sequence(10).map(([i, j]) => ({f1: i, f2: j, f3: i%2 === 0}));

    await Promise.all(posts.map((d) => Post.create(d)));

    const lastSaveValues = {
      f1: 10,
      f2: '10',
    };

    const lastByPK = await Post.query().orderBy('pk', 'desc').first();
    const redisValue = await Redis.get(Post.cachedName);

    let redisValueParsed;
    try {
      redisValueParsed = JSON.parse(redisValue);
    } catch (e) {
      assert.fail(`value set incorrectly: (${redisValue}) -> ${e.message}`);
    }

    assert.deepEqual(
        {
          f1: lastByPK.f1,
          f2: lastByPK.f2,
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

  test('Get cached with redis value (non-default PK)', async (assert) => {
    const Redis = ioc.use('Redis');

    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await Post.create(attrs);

    const redisValue = await Redis.get(Post.cachedName);

    const redisValueParsed = JSON.parse(redisValue);

    const byStaticMethod = await Post.cached;

    assert.deepEqual(
        byStaticMethod,
        redisValueParsed,
        `cached returned wrong values`,
    );

    await Redis.del(Post.cachedName);

    assert.isNull(
        await Redis.get(Post.cachedName),
        'Redis values should be null after deleting',
    );

    await Post.warmUp;

    assert.deepEqual(
        redisValueParsed,
        await Post.cached,
        'cached returns wrong values when warmed up',
    );

    await Redis.del(Post.cachedName);

    assert.isNull(
        await Redis.get(Post.cachedName),
        'Redis values should be null after deleting',
    );

    assert.deepEqual(
        redisValueParsed,
        await Post.cached,
        'cached returns wrong values when redis is empty',
    );
  });

  test('Get cached without redis value (non-default PK)', async (assert) => {
    const Redis = ioc.use('Redis');

    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await Post.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(Post.cachedName);

    assert.isNull(
        await Redis.get(Post.cachedName),
        'Redis values should be null after deleting',
    );

    assert.deepEqual(
        cachedAttrs,
        await Post.cached,
        'cached returns wrong values when warmed up',
    );
  });

  test('Get cached without redis value (warmed up) (non-default PK)', async (assert) => {
    const Redis = ioc.use('Redis');

    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    await Post.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(Post.cachedName);

    assert.isNull(
        await Redis.get(Post.cachedName),
        'Redis values should be null after deleting',
    );

    await Post.warmUp;

    assert.deepEqual(
        cachedAttrs,
        await Post.cached,
        'cached returns wrong values when warmed up',
    );
  });

  test('Warm up (non-default PK)', async (assert) => {
    const Redis = ioc.use('Redis');

    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();
    const attrs = {
      f1: 128,
      f2: 'lorem ipsum',
      f3: false,
    };
    const post = await Post.create(attrs);

    const cachedAttrs = {
      f1: attrs.f1,
      f2: attrs.f2,
    };

    await Redis.del(Post.cachedName);

    assert.isNull(
        await Redis.get(Post.cachedName),
        'Redis values should be null after deleting',
    );

    const warmUpValue = await Post.warmUp;

    assert.deepEqual(
        cachedAttrs,
        warmUpValue,
        'warmUp returns wrong value',
    );

    const redisValue = await Redis.get(Post.cachedName);

    const redisValueParsed = JSON.parse(redisValue);

    assert.deepEqual(
        redisValueParsed,
        cachedAttrs,
        'warmUp saved incorrect values',
    );

    assert.deepEqual(
        await Redis.get(`${Post.cachedName}_lock`),
        post.pk.toString(),
        'warm up saved incorrect lock value',
    );
  });

  test('Should use custom redis if specified', async (assert) => {
    const Redis = ioc.use('Redis');
    const secondRedis = Redis.connection('anotherLocal');
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2'], redis: secondRedis});
      }
    }
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
        this.addTrait('@provider:Prk/Traits/Singleton');
        this.addTrait('@provider:Prk/Traits/CachedAttribute', {fields: ['f1', 'f2']});
      }
    }
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
