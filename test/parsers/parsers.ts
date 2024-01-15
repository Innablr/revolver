import { expect } from 'chai';
import getParser from '../../plugins/parsers';

describe('getParser', function () {
  it('Supports strict parser', function () {
    const strict = getParser('strict');
    expect(strict).to.be.a('function');
  });

  it('Throws unsupported parsers', function () {
    expect(() => getParser('blarg')).to.throw();
  });
});
