# Adonis Extra Traits

This Package provides multiple useful Traits for Adonis

## Table of Contents:

* [Usage](#usage)
* [Traits](#traits)
  * [NoTimestamp](#noTimestamp)
  * [Singleton](#singleton)
  * [CachedAttribute](#cachedAttribute)
* [ToDo](#toDo)

## Usage:

* Install package: `npm i @mortz.prk/adonis-extra-trait`
* Register with Adonis: add `@mortz.prk/adonis-extra-trait` to `providers` array in `start/app.js` file

## Traits:
* [NoTimestamp](#noTimestamp)
* [Singleton](#singleton)
* [CachedAttribute](#cachedAttribute)

<hr>
<hr>

### NoTimestamp

#### Intro:
Removes `created_at` and `updated_at` field selectively.

This trait is much like `NoTimestamp` trait provided by Adonis.

#### Register:

1. Register trait in your model of choice:

   ```js
   const Model = use('Model');
   
   class Post extends Model {
       static boot() {
           super.boot();
           this.addTrait('@provider:Prk/Traits/NoTimestamp', <option>);
       }
   }
   ```
2. Change `option`:
   
   | `option`  | Required | Type | Default |                Description                    |
   |:---------:|:--------:|:----:|:-------:|:---------------------------------------------:|
   | createdAt |    ❌    | bool | `false` | set `true` if the model has no `created_at` field |
   | updatedAt |    ❌    | bool | `false` | set `true` if the model has no `updated_at` field |


<hr>

### Singleton

#### Intro:

Make a Model Singleton, which means:

1. You can access last inserted row
2. You can't change any instance after saved in DB

This is useful when you want to keep set of values in DB and also have a history of old values. for example, You may save a configuration in DB

#### Register:

1. Register trait in your model of choice:

   ```js
   const Model = use('Model');
   
   class Post extends Model {
       static boot() {
           super.boot();
           this.addTrait('@provider:Prk/Traits/Singleton', <option>);
       }
   }
   ```
2. Change `option`:
   
   |   `option`   | Required | Type | Default |                Description                    |
   |:------------:|:--------:|:----:|:-------:|:---------------------------------------------:|
   | ignoreUpdate |    ❌    | bool | `false` | set `true` to allow updating old instances    |


#### Usage:

* `Model.current` will return last inserted row from DB:
   ```js
   const last = await Post.current;
   ```

* `update` will fail:
   ```js
   const post1 = await Post.create(data1);
   
   const post2 = await Post.create(data2);
   
   post1.name = 'new Name'
   post1.save() // Will throw Error
   ```
   > You can disable this behavior by passing `ignoreUpdate`


<hr>

### CachedAttribute

#### Intro:

Cache last saved values in Redis.

This trait __requires__ `Singleton` to get registered in the model (must be registered before this one). also `Primary Key` of model __must__ be an integer value.

#### Register:

1. Register trait in your model of choice:

   ```js
   const Model = use('Model');
   
   class Post extends Model {
       static boot() {
           super.boot();
           this.addTrait('@provider:Prk/Traits/Singleton');
           this.addTrait('@provider:Prk/Traits/CachedAttribute', <option>);
       }
   }
   ```
2. Change `option`:
   
   | `option` | Required |   Type   |    Default   |         Description         |
   |:--------:|:--------:|:--------:|:------------:|:---------------------------:|
   |  fields  |    ✅    | string[] |   undefined  | name of attributes to cache |
   |  redis   |    ❌    |   Redis  | use('Redis') |       redis provider        |

3. Register redis custom command by Creating/Changing `config/redis.js`:
   * add `loadScript` to file:
     ```js
      const Env = use('Env');
  
      module.exports = {
          connection: 'local',
          local: {
              host: Env.get('REDIS_HOST'),
              port: Env.get('REDIS_PORT'),
              password: Env.get('REDIS_PASS'),
              db: 0,
              keyPrefix: ''
          },
          loadScript: true // <-- add this line
      };
     ```
    * Set value of `loadScript` based on following table:
   
      |   `loadScript`   |                         Effect                         |
      |:----------------:|:------------------------------------------------------:|
      |      `null`      |                 won't register command                 |
      |   `undefined`    |                 won't register command                 |
      |      `true`      |        register command for default connection         |
      |      `'cn'`      | register command for redis with given connection name  |
      | `['cn1', 'cn2']` | register command for redis with given connection names |

#### Usage:

* `Model.cached` will return last cached attrs from Redis:
   ```js
   // assuming `fields` for trait is set to ['name', 'isMale']
   const data = {name: 'lorem', lastName: 'ipsum', isMale: false}
   const post = await Post.create(data);
   console.log(await Post.cached)
   // {
   //    name:"lorem",
   //    isMale:false
   // }
   ```
   > `cached` will throw an Error if table is empty

* `Model.cachedName` name of key which is used as key in Redis:
   ```js
   const Redis = use('Redis')
   // assuming `fields` for trait is set to ['name', 'isMale']
   const data = {name: 'lorem', lastName: 'ipsum', isMale: false}
   const post = await Post.create(data);
   const cacheValue = await Redis.get(Post.cachedName);
   console.log(JSON.pars(cacheValue));
   // {
   //    name:"lorem",
   //    isMale:false
   // }
   ```

* `Model.warmUp` Generates cache, removing old values:
   * use this method to regenerate cache
     * Example: to populate cache in server startup
     * Example: remove old cache value when a transaction rolls back

#### Known Limitations:
* Redis cluster is not tested and may not work as expected
* Cache will return invalid value, if DB transaction rolls back (run `Model.warmUp` to fix it for now)

#### FAQ:
1. How to use another connection for redis:
   
   Pass `Redis.connection('nameOfConnection')` to trait option:
   ```js
   const Model = use('Model');
   const Redis = use('Redis');
   
   class Post extends Model {
       static boot() {
           super.boot();
           this.addTrait('@provider:Prk/Traits/Singleton');
           this.addTrait(
               '@provider:Prk/Traits/CachedAttribute', 
               {fields: ['name'], redis: Redis.connection('anotherName')}
            );
       }
   }
   ```

2. I don't want to use `Redis` provider from Adonis, but an `ioredis` instance:
   
   * Pass ioRedis to trait option:
      ```js
      const Model = use('Model');
      const ioRedis = require('../ioredis'); // <-- this is an ioredis instance
      
      class Post extends Model {
          static boot() {
              super.boot();
              this.addTrait('@provider:Prk/Traits/Singleton');
              this.addTrait(
                  '@provider:Prk/Traits/CachedAttribute', 
                  {fields: ['name'], redis: ioRedis}
               );
          }
      }
      ```
   * Register Command in Redis:
      ```js
      const redisCommandLoader = use('Prk/Helper/RedisCustomCommand');
      const ioRedis = require('../ioredis');
      await redisCommandLoader(ioRedis);
      ```

3. I don't want to use neither `Redis` provider from Adonis nor an `ioredis` instance:
   
   * Pass Redis like object to trait option:
      ```js
      const Model = use('Model');
      const Redis = require('another-redis-lib');
      
      const redis = {
        get: (keyName) => {
            return Redis.getFromCacheMethod(keyName);
        },
        set: (keyName, value) => {
            return Redis.setToCacheMethod(keyName, value);
        },
        evalsha: (hash, numOfKeys, k1,k2,k3,k4) => {
            return Redis.methodToRunCachedScript(hash, numOfKeys, k1,k2,k3,k4);
        },
      };
      class Post extends Model {
          static boot() {
              super.boot();
              this.addTrait('@provider:Prk/Traits/Singleton');
              this.addTrait(
                  '@provider:Prk/Traits/CachedAttribute', 
                  {fields: ['name'], redis: redis}
               );
          }
      }
      ```
   * Register Command in Redis:
      ```js
      const redisCommandLoader = use('Prk/Helper/RedisCustomCommand');
      const {command} = use('Prk/Helper/RedisCustomCommandDetail');
      const Redis = require('another-redis-lib');
      await redisCommandLoader({
          script: (action, command) => await Redis.methodToEvaluateCommand(command)
      });
      ```

4. I didn't understand logic of `loadScript`.
   * short answer:

     `CachedAttribute` trait uses a `lua` script internally to cache attributes in Redis.
     to cache the lua script itself in Redis (for better performance) we have to run a command in Redis.
     
   * If you are using default config for redis:
   
     Which is something like this:
     ```js
     const Env = use('Env');
     
     module.exports = {
       connection: 'local',
       local: {
         host: Env.getOrFail('REDIS_HOST'),
         port: Env.getOrFail('REDIS_PORT'),
         password: null,
         db: 0,
         keyPrefix: ''
       },
       ...
     };
     ```
     then you just need to change file to this:
     ```js
     const Env = use('Env');
     
     module.exports = {
       connection: 'local',
       local: {
         host: Env.getOrFail('REDIS_HOST'),
         port: Env.getOrFail('REDIS_PORT'),
         password: null,
         db: 0,
         keyPrefix: ''
       },
       loadScript: true,
       ...
     };
     ```
     
     now, provider will automatically register command in Redis.
     
   * If you use Redis provider from Adonis and know what you are doing:
   
     with a config file like following:
     ```js
     const Env = use('Env');
     
     module.exports = {
       connection: 'local',
       local: {
         host: Env.getOrFail('LOCAL_REDIS_HOST'),
         port: Env.getOrFail('LOCAL_REDIS_PORT'),
         password: null,
         db: 0,
         keyPrefix: ''
       },
       anotherLocal: {
         host: Env.getOrFail('ANOTHER_REDIS_HOST'),
         port: Env.getOrFail('ANOTHER_REDIS_PORT'),
         password: null,
         db: 0,
         keyPrefix: ''
       },
       againAnotherLocal: {
         host: Env.getOrFail('AGAIN_ANOTHER_REDIS_HOST'),
         port: Env.getOrFail('AGAIN_ANOTHER_REDIS_PORT'),
         password: null,
         db: 0,
         keyPrefix: ''
       },
       ...
     };
     ```
     then add `loadScript` to config, like:
     ```js
     const Env = use('Env');
     
     module.exports = {
       connection: 'local',
       ...,
       loadScript: <value>,
       ...
     };
     ```
     based on `<value>` you have different behavior:
     1. `<value>`: `null` or `undefined` -> nothing happens
     2. `<value>`: `true` -> command registers in `LOCAL_REDIS_HOST`
     3. `<value>`: `'anotherLocal'` -> command registers in `ANOTHER_REDIS_HOST`
     4. `<value>`: `['anotherLocal', 'againAnotherLocal']` -> command registers in `ANOTHER_REDIS_HOST` and `AGAIN_ANOTHER_REDIS_HOST`
     
   * If you use another library to connect with redis:
   
     import command detail from helper:
     ```js
     const {command,hash,numOfKeys} = use('Prk/Helper/RedisCustomCommandDetail');
     ```

     now you should register script using your library

     ```js
     const redisClient = require('another-redis-lib');
     redisClient.aMethodWhichLoadsLuaScript(command);
     ```
     
## ToDo:
* test for redis cluster
* add badges (test, version, last version of dependencies usage)
* make this a typescript package (!)
* add ci (Travis, Circle or Gitlab)