import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import { expect } from 'chai';
import getParser from '../../plugins/parsers';

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
