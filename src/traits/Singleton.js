class Singleton {
  register(Model) {
    Model.addHook('beforeUpdate', function(modelInstance) {
      throw new Error(`${Model.name}: Singleton updated`);
    });
    Model.getCurrent = async function() {
      return Model.query().orderBy('id', 'desc').first();
    };
    Model.isSingleton = true;
  }
}

module.exports = Singleton;
