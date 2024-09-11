import * as chai from 'chai';
import { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import getParser from '../../plugins/parsers/index.js';

chai.use(chaiAsPromised);

describe('getParser', () => {
  it('Supports strict parser', async () => {
    const strict = await getParser('strict');
    expect(strict).to.be.a('function');
  });

  it('Throws unsupported parsers', async () => {
    expect(getParser('blarg')).to.eventually.be.rejectedWith('Unsupported parser blarg');
  });
});
