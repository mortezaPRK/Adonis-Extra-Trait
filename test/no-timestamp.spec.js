const test = require('japa');
const {ioc} = require('@adonisjs/fold');

const Model = ioc.use('Model');

test.group('NoTimestamp', () => {
  test('Without options', (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            '@provider:Prk/Traits/NoTimestamp',
        );
      }
    }
    User._bootIfNotBooted();
    assert.strictEqual(
        User.createdAtColumn,
        'created_at',
        `expected User to have a created_at column`,
    );
    assert.strictEqual(
        User.updatedAtColumn,
        'updated_at',
        `expected User to have a updated_at column`,
    );
  });


  test('With created_at', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            '@provider:Prk/Traits/NoTimestamp',
            {createdAt: true},
        );
      }
    }
    User._bootIfNotBooted();
    assert.strictEqual(
        User.createdAtColumn,
        null,
        `expected User to not have a created_at column`,
    );
    assert.strictEqual(
        User.updatedAtColumn,
        'updated_at',
        `expected User to have a updated_at column`,
    );
  });


  test('With updated_at', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            '@provider:Prk/Traits/NoTimestamp',
            {updatedAt: true},
        );
      }
    }
    User._bootIfNotBooted();
    assert.strictEqual(
        User.createdAtColumn,
        'created_at',
        `expected User to have a created_at column`,
    );
    assert.strictEqual(
        User.updatedAtColumn,
        null,
        `expected User to not have a updated_at column`,
    );
  });


  test('With both created_at and updated_at', async (assert) => {
    class User extends Model {
      static boot() {
        super.boot();
        this.addTrait(
            '@provider:Prk/Traits/NoTimestamp',
            {createdAt: true, updatedAt: true},
        );
      }
    }
    User._bootIfNotBooted();
    assert.strictEqual(
        User.createdAtColumn,
        null,
        `expected User to not have a created_at column`,
    );
    assert.strictEqual(
        User.updatedAtColumn,
        null,
        `expected User to not have a updated_at column`,
    );
  });
});
