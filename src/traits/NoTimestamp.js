class NoTimestamp {
  register(Model, {createdAt, updatedAt}) {
    if (createdAt) {
      Object.defineProperty(Model, 'createdAtColumn', {
        get: () => null,
      });
    }
    if (updatedAt) {
      Object.defineProperty(Model, 'updatedAtColumn', {
        get: () => null,
      });
    }
  }
}

module.exports = NoTimestamp;
