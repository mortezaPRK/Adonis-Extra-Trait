class Singleton {
  register(Model, {ignoreUpdate}) {
    if (!ignoreUpdate) {
      Model.addHook('beforeUpdate', function(modelInstance) {
        throw new Error(`${Model.name}: Singleton updated`);
      });
    }
    const pk = Model.primaryKey;
    Model.getCurrent = async function() {
      return Model.query().orderBy(pk, 'desc').first();
    };
    Object.defineProperty(Model, 'isSingleton', {
      get: () => true,
    });
  }
}

module.exports = Singleton;
