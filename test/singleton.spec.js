const test = require('japa');
const {ioc} = require('@adonisjs/fold');

const Model = ioc.use('Model');


test.group('Singleton', (group) => {
  group.before(async () => {
    const Database = ioc.use('Database');
    await Database.schema.createTable('users', (table) => {
      table.increments();
      table.timestamps();
    });
    await Database.schema.createTable('posts', (table) => {
      table.increments('pk');
      table.timestamps();
    });
  });

  group.afterEach(async () => {
    const Database = ioc.use('Database');
    await Database.table('users').truncate();
    await Database.table('posts').truncate();
  });

  group.after(async () => {
    const Database = ioc.use('Database');
    await Database.schema.dropTable('users');
    await Database.schema.dropTable('posts');
  });

  test('Registration', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            '@provider:Prk/Traits/Singleton',
        );
      }
    }
    User._bootIfNotBooted();

    assert.isTrue(
        User.isSingleton,
        `expected model to have isSingleton with 'true' as value`,
    );

    assert.isFunction(
        Object.getOwnPropertyDescriptor(User, 'current')['get'],
        'current not registered!',
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
  });

  test('Get current by static method', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            '@provider:Prk/Traits/Singleton',
        );
      }
    }
    User._bootIfNotBooted();

    await Promise.all([...(new Array(5))].map(() => User.create()));

    const total = await User.getCount();

    assert.strictEqual(
        +total,
        5,
        'there should be 5 models in DB',
    );

    const lastById = await User.query().orderBy('id', 'desc').first();

    assert.strictEqual(
        lastById.id,
        5,
        'last model should have id with value of 5',
    );

    const byStaticMethod = await User.current;

    assert.deepEqual(
        lastById,
        byStaticMethod,
    );
  }).timeout(3000);

  test('Get current by static method with non-default PK', async (assert) => {
    class Post extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
      }
      static get primaryKey() {
        return 'pk';
      }
    }
    Post._bootIfNotBooted();

    await Promise.all([...(new Array(5))].map(() => Post.create()));

    const total = await Post.getCount();

    assert.strictEqual(
        +total,
        5,
        'there should be 5 models in DB',
    );

    const lastByPK = await Post.query().orderBy('pk', 'desc').first();

    assert.strictEqual(
        lastByPK.pk,
        5,
        'last model should have id with value of 5',
    );

    const byStaticMethod = await Post.current;

    assert.deepEqual(
        lastByPK,
        byStaticMethod,
    );
  }).timeout(3000);

  test('Fail on update', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton');
      }
    }
    User._bootIfNotBooted();
    const user = await User.create();
    let error = null;
    try {
      await user.save();
    } catch (e) {
      error = e;
    }

    assert.instanceOf(
        error,
        Error,
        'there should be an error thrown when updating `Singleton`',
    );
    assert.match(
        error.message,
        /.*: Singleton updated$/m,
        `Unknown error was thrown!`,
    );
  });

  test('Success on update when `ignoreUpdate`', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait('@provider:Prk/Traits/Singleton', {ignoreUpdate: true});
      }
    }
    User._bootIfNotBooted();
    const user = await User.create();
    try {
      await user.save();
    } catch (e) {
      assert.fail(`Updating failed with 'ignoreUpdate': ${e.message}`);
    }
  });
});
