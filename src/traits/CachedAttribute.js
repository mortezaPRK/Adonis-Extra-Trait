const getFields = (instance, fields) => {
  const out = {};
  for (const field of fields) {
    out[field] = instance[field];
  }
  return out;
};

class CachedAttribute {
  register(Model, {fields, redis}) {
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new Error(`${Model.name}: fields should be a non-empty array`);
    }
    if (!Model.isSingleton) {
      throw new Error(`${Model.name}: should be Singleton`);
    }
    if (!redis) {
      // eslint-disable-next-line no-undef
      redis = use('Redis');
    }
    const name = `cached_attrs_${Model.name}`;
    const lockName = `${name}_lock`;

    Model.addHook('afterCreate', async function(modelInstance) {
      await redis.evalsha(
          'b02dd40a22f1e5e726ed5b6c7676f2803b7333fc',
          4,
          lockName,
          modelInstance.primaryKeyValue,
          name,
          JSON.stringify(getFields(modelInstance.$attributes, fields)),
      );
    });

    Object.defineProperties(Model, {
      warmUp: {
        get: async () => {
          const current = await Model.current;
          if (!current) {
            throw new Error(`${Model.name}: nothing to get`);
          }
          const attrs = getFields(current.$attributes, fields);
          await redis.set(name, JSON.stringify(attrs));
          await redis.set(lockName, current.primaryKeyValue.toString());
          return attrs;
        },
      },
      cached: {
        get: async () => {
          const redisValue = await redis.get(name);
          if (redisValue == null) {
            return Model.warmUp;
          }
          return JSON.parse(redisValue);
        },
      },
      cachedName: {
        get: () => name,
      },
    });
  }
}

module.exports = CachedAttribute;
