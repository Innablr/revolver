const getParser = require('../plugins/parsers/all');
const expect = require('chai').expect;

describe('getParser', function() {
    it('Supports strict parser', function() {
        const strict = getParser('strict');
        expect(strict).to.be.a('function');
    });

    it('Throws unsupported parsers', function() {
        expect(() => getParser('blarg')).to.throw();
    });
});

const parserStrict = require('./parserStrict/all');
