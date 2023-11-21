const getParser = require('../../plugins/parsers/all');
const expect = require('chai').expect;
const moment = require('moment-timezone');

const timeNow = moment();

describe('Strict parser detects override', function() {
    const strictParser = getParser('strict');
    describe('enabled', function() {
        const cases = [
            'Start=08:30;Stop=17:30;Override=on',
            'Start=08:30;Stop=17:30;Override=yes',
            'Start=08:30;Override=yes',
            'Stop=08:30;Override=yes',
            'Override=on',
            'Override=yes',
            'Override'
        ];
        cases.forEach(function(c) {
            it(`in ${c}`, function() {
                const [action, reason] = strictParser(c, timeNow);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal('Availability override');
            });
        });
    });
    describe('disabled', function() {
        const cases = [
            'Start=08:30;Stop=17:30;Override=off',
            'Start=08:30;Stop=17:30',
            'Stop=17:30',
            'Start=08:30;Override=no',
            'Override=off',
        ];
        cases.forEach(function(c) {
            it(`in ${c}`, function() {
                const [action, reason] = strictParser(c, timeNow);
                expect(reason).to.not.equal('Availability override');
            });
        });
    });
});
