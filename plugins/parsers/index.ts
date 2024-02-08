/*
  Don't use this for anything other than tests
  Bundler needs to see a `require` with a literal string somewhere to work correctly
 */
async function getParser(name: string) {
  const m = await require(`./${name}`);
  return m.default;
}

export default getParser;
