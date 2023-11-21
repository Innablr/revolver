const getParser = require('../../plugins/parsers/all');
const expect = require('chai').expect;
const moment = require('moment-timezone');

const timeNow = moment();

describe('Strict parser handles different corner cases', function() {
    const strictParser = getParser('strict');
    describe('tag letters case', function() {
        const cases = [
            'Start=08:30;Stop=17:30;Override=No',
            'start=08:30;stop=17:30;override=no',
            'START=08:30;STOP=17:30;OVERRIDE=NO'
        ];
        const er = strictParser('start=08:30;stop=17:30;override=no', timeNow);
        cases.forEach(function(c) {
            it(`for ${c}`, function() {
                const [action, reason] = strictParser(c, timeNow);
                expect(strictParser(c, timeNow)).to.have.ordered.members(er);
            });
        });
    });
});
