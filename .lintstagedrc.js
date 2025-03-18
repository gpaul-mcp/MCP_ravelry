module.exports = {
  '*.{js,ts}': files => [
    `cross-env NODE_ENV=development eslint --cache --fix ${files.join(' ')}`,
    `cross-env NODE_ENV=development prettier --write ${files.join(' ')}`,
  ],
};
