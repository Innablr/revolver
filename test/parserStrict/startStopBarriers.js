const getParser = require('../../plugins/parsers/all');
const expect = require('chai').expect;
const moment = require('moment-timezone');

const startBarriers = {
    monday629: moment('2017-06-05 06:29'),
    monday630: moment('2017-06-05 06:30'),
    monday631: moment('2017-06-05 06:31'),
    monday644: moment('2017-06-05 06:44'),
    monday645: moment('2017-06-05 06:45'),
    monday646: moment('2017-06-05 06:46'),
};

const stopBarriers = {
    monday1729: moment('2017-06-05 17:29'),
    monday1730: moment('2017-06-05 17:30'),
    monday1731: moment('2017-06-05 17:31'),
    monday1744: moment('2017-06-05 17:44'),
    monday1745: moment('2017-06-05 17:45'),
    monday1746: moment('2017-06-05 17:46'),
};

const startBarriersWithDays = {
    monday: moment('2017-06-05 06:35'),
    tuesday: moment('2017-06-06 06:35'),
    wednesday: moment('2017-06-07 06:35'),
    thursday: moment('2017-06-08 06:35'),
    friday: moment('2017-06-09 06:35'),
    saturday: moment('2017-06-10 06:35'),
    sunday: moment('2017-06-11 06:35'),
};

const stopBarriersWithDays = {
    monday: moment('2017-06-05 17:35'),
    tuesday: moment('2017-06-06 17:35'),
    wednesday: moment('2017-06-07 17:35'),
    thursday: moment('2017-06-08 17:35'),
    friday: moment('2017-06-09 17:35'),
    saturday: moment('2017-06-10 17:35'),
    sunday: moment('2017-06-11 17:35'),
};

describe('Strict parser handles start/stop barriers', function() {
    const strictParser = getParser('strict');
    describe('start', function() {
        const tag = 'Start=06:30;Override=off';
        ['monday629', 'monday630'].forEach(function(c) {
            it(`not start at ${startBarriers[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriers[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${startBarriers[c]}, resource starts at 06:30 all week`);
            });
        });
        ['monday631', 'monday644', 'monday645'].forEach(function(c) {
            it(`start at ${startBarriers[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriers[c]);
                expect(action).to.equal('START');
                expect(reason).to.equal(`It's now ${startBarriers[c]}, resource starts at 06:30 all week`);
            });
        });
        ['monday646'].forEach(function(c) {
            it(`not start at ${startBarriers[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriers[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${startBarriers[c]}, resource starts at 06:30 all week`);
            });
        });
    });
    describe('stop', function() {
        const tag = 'Stop=17:30;Override=off';
        ['monday1729', 'monday1730'].forEach(function(c) {
            it(`not stop at ${stopBarriers[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriers[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${stopBarriers[c]}, resource stops at 17:30 all week`);
            });
        });
        ['monday1731', 'monday1744', 'monday1745'].forEach(function(c) {
            it(`stop at ${stopBarriers[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriers[c]);
                expect(action).to.equal('STOP');
                expect(reason).to.equal(`It's now ${stopBarriers[c]}, resource stops at 17:30 all week`);
            });
        });
        ['monday1746'].forEach(function(c) {
            it(`not stop at ${stopBarriers[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriers[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${stopBarriers[c]}, resource stops at 17:30 all week`);
            });
        });
    });
    describe('start with days', function() {
        const tag = 'Start=06:30|mon-fri;Override=off';
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function(c) {
            it(`start at ${startBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
                expect(action).to.equal('START');
                expect(reason).to.equal(`It's now ${startBarriersWithDays[c]}, resource starts at 06:30 mon-fri`);
            });
        });
        ['saturday', 'sunday'].forEach(function(c) {
            it(`not start at ${startBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${startBarriersWithDays[c]}, resource starts at 06:30 mon-fri`);
            });
        });
    });
    describe('start with days reversed', function() {
        const tag = 'Start=06:30|fri-tue;Override=off';
        ['monday', 'tuesday'].forEach(function(c) {
            it(`start at ${startBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
                expect(action).to.equal('START');
                expect(reason).to.equal(`It's now ${startBarriersWithDays[c]}, resource starts at 06:30 fri-tue`);
            });
        });
        ['wednesday', 'thursday'].forEach(function(c) {
            it(`not start at ${startBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${startBarriersWithDays[c]}, resource starts at 06:30 fri-tue`);
            });
        });
        ['friday', 'saturday', 'sunday'].forEach(function(c) {
            it(`start at ${startBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
                expect(action).to.equal('START');
                expect(reason).to.equal(`It's now ${startBarriersWithDays[c]}, resource starts at 06:30 fri-tue`);
            });
        });
    });
    describe('stop with days', function() {
        const tag = 'Stop=17:30|mon-fri;Override=off';
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(function(c) {
            it(`stop at ${stopBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
                expect(action).to.equal('STOP');
                expect(reason).to.equal(`It's now ${stopBarriersWithDays[c]}, resource stops at 17:30 mon-fri`);
            });
        });
        ['saturday', 'sunday'].forEach(function(c) {
            it(`not stop at ${stopBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${stopBarriersWithDays[c]}, resource stops at 17:30 mon-fri`);
            });
        });
    });
    describe('stop with days reversed', function() {
        const tag = 'Stop=17:30|thu-mon;Override=off';
        ['monday'].forEach(function(c) {
            it(`stop at ${stopBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
                expect(action).to.equal('STOP');
                expect(reason).to.equal(`It's now ${stopBarriersWithDays[c]}, resource stops at 17:30 thu-mon`);
            });
        });
        ['tuesday', 'wednesday'].forEach(function(c) {
            it(`not stop at ${stopBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
                expect(action).to.equal('NOOP');
                expect(reason).to.equal(`It's now ${stopBarriersWithDays[c]}, resource stops at 17:30 thu-mon`);
            });
        });
        ['thursday', 'friday', 'saturday', 'sunday'].forEach(function(c) {
            it(`stop at ${stopBarriersWithDays[c]}`, function() {
                const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
                expect(action).to.equal('STOP');
                expect(reason).to.equal(`It's now ${stopBarriersWithDays[c]}, resource stops at 17:30 thu-mon`);
            });
        });
    });
});
