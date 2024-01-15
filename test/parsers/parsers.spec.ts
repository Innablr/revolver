import { expect } from 'chai';
import getParser from '../../plugins/parsers';

describe('getParser', function () {
  it('Supports strict parser', async function () {
    const strict = await getParser('strict');
    expect(strict).to.be.a('function');
  });

  it('Throws unsupported parsers', async function () {
    expect(async () => await getParser('blarg')).to.throw();
  });
});
