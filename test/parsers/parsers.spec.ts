import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { expect } from 'chai';
import getParser from '../../plugins/parsers/index.js';

chai.use(chaiAsPromised);

describe('getParser', function () {
  it('Supports strict parser', async function () {
    const strict = await getParser('strict');
    expect(strict).to.be.a('function');
  });

  it('Throws unsupported parsers', async function () {
    expect(getParser('blarg')).to.eventually.be.rejectedWith('Unsupported parser blarg');
  });
});
