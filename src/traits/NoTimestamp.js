module.exports = (Model, {createdAt, updatedAt}) => {
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
};
