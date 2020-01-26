const test = require('japa');
const {ioc} = require('@adonisjs/fold');

const Model = ioc.use('Model');

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
    await Database.close();
  });

  group.afterEach(async () => {
    const Database = ioc.use('Database');
    await Database.table('users').truncate();
    await Database.table('posts').truncate();
    await Database.close();

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
    await Database.close();
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
    let i = 0;
    const posts = [...new Array(100)].map(() => {
      i++;
      return {
        f1: i,
        f2: (i * 2).toString(),
        f3: i % 2 === 0,
      };
    });

    await Promise.all(posts.map((d) => Post.create(d)));

    const lastSaveValues = {
      f1: 100,
      f2: '200',
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
