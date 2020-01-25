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
      throw new Error(`${Model.name}: shoud be Singleton`);
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
          modelInstance.id,
          name,
          JSON.stringify(getFields(modelInstance.$attributes, fields)),
      );
    });

    Model.warmUp = async function() {
      const current = await Model.getCurrent();
      if (!current) {
        throw new Error(`${Model.name}: nothing to get`);
      }
      const attrs = getFields(current.$attributes, fields);
      await redis.set(name, JSON.stringify(attrs));
      await redis.set(lockName, current.id.toString());
      return attrs;
    };

    Model.getCached = async function() {
      const redisValue = await redis.get(name);
      if (redisValue == null) {
        return Model.warmUp();
      }
      return JSON.parse(redisValue);
    };

    Model.cachedName = name;
  }
}

module.exports = CachedAttribute;
