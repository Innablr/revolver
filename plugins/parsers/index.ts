import * as path from 'path';

async function getParser(name: string) {
  const m = await import(path.join(__dirname, name));
  return m.default;
}

export default getParser;
