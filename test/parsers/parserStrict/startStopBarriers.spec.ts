import { expect } from 'chai';
import { DateTime } from 'luxon';
import getParser from '../../../plugins/parsers/index.js';
import { reasonDateFormat } from '../../../plugins/parsers/strict.js';

const startBarriers: { [key: string]: DateTime } = {
  monday629: DateTime.fromJSDate(new Date('2017-06-05 06:29')),
  monday630: DateTime.fromJSDate(new Date('2017-06-05 06:30')),
  monday631: DateTime.fromJSDate(new Date('2017-06-05 06:31')),
  monday644: DateTime.fromJSDate(new Date('2017-06-05 06:44')),
  monday645: DateTime.fromJSDate(new Date('2017-06-05 06:45')),
  monday646: DateTime.fromJSDate(new Date('2017-06-05 06:46')),
};

const stopBarriers: { [key: string]: DateTime } = {
  monday1729: DateTime.fromJSDate(new Date('2017-06-05 17:29')),
  monday1730: DateTime.fromJSDate(new Date('2017-06-05 17:30')),
  monday1731: DateTime.fromJSDate(new Date('2017-06-05 17:31')),
  monday1744: DateTime.fromJSDate(new Date('2017-06-05 17:44')),
  monday1745: DateTime.fromJSDate(new Date('2017-06-05 17:45')),
  monday1746: DateTime.fromJSDate(new Date('2017-06-05 17:46')),
};

const startBarriersWithDays: { [key: string]: DateTime } = {
  monday: DateTime.fromJSDate(new Date('2017-06-05 06:35')),
  tuesday: DateTime.fromJSDate(new Date('2017-06-06 06:35')),
  wednesday: DateTime.fromJSDate(new Date('2017-06-07 06:35')),
  thursday: DateTime.fromJSDate(new Date('2017-06-08 06:35')),
  friday: DateTime.fromJSDate(new Date('2017-06-09 06:35')),
  saturday: DateTime.fromJSDate(new Date('2017-06-10 06:35')),
  sunday: DateTime.fromJSDate(new Date('2017-06-11 06:35')),
};

const stopBarriersWithDays: { [key: string]: DateTime } = {
  monday: DateTime.fromJSDate(new Date('2017-06-05 17:35')),
  tuesday: DateTime.fromJSDate(new Date('2017-06-06 17:35')),
  wednesday: DateTime.fromJSDate(new Date('2017-06-07 17:35')),
  thursday: DateTime.fromJSDate(new Date('2017-06-08 17:35')),
  friday: DateTime.fromJSDate(new Date('2017-06-09 17:35')),
  saturday: DateTime.fromJSDate(new Date('2017-06-10 17:35')),
  sunday: DateTime.fromJSDate(new Date('2017-06-11 17:35')),
};

describe('Strict parser handles start/stop barriers', async () => {
  const strictParser = await getParser('strict');
  describe('Strict parser handles start barrier', () => {
    const tag = 'Start=06:30;Override=off';
    ['monday629'].forEach((c) => {
      it(`not start at ${startBarriers[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriers[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${startBarriers[c].toFormat(reasonDateFormat)}, resource starts at 6:30 all week`,
        );
      });
    });
    ['monday630', 'monday631', 'monday644'].forEach((c) => {
      it(`start at ${startBarriers[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriers[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's now ${startBarriers[c].toFormat(reasonDateFormat)}, resource starts at 6:30 all week`,
        );
      });
    });
    ['monday645', 'monday646'].forEach((c) => {
      it(`not start at ${startBarriers[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriers[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${startBarriers[c].toFormat(reasonDateFormat)}, resource starts at 6:30 all week`,
        );
      });
    });
  });
  describe('Strict parser handles stop barrier', () => {
    const tag = 'Stop=17:30;Override=off';
    ['monday1729'].forEach((c) => {
      it(`not stop at ${stopBarriers[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriers[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${stopBarriers[c].toFormat(reasonDateFormat)}, resource stops at 17:30 all week`,
        );
      });
    });
    ['monday1730', 'monday1731', 'monday1744'].forEach((c) => {
      it(`stop at ${stopBarriers[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriers[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's now ${stopBarriers[c].toFormat(reasonDateFormat)}, resource stops at 17:30 all week`,
        );
      });
    });
    ['monday1745', 'monday1746'].forEach((c) => {
      it(`not stop at ${stopBarriers[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriers[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${stopBarriers[c].toFormat(reasonDateFormat)}, resource stops at 17:30 all week`,
        );
      });
    });
  });
  describe('Strict parser handles start barrier with days', () => {
    const tag = 'Start=06:30|mon-fri;Override=off';
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((c) => {
      it(`start at ${startBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's now ${startBarriersWithDays[c].toFormat(reasonDateFormat)}, resource starts at 6:30 mon-fri`,
        );
      });
    });
    ['saturday', 'sunday'].forEach((c) => {
      it(`not start at ${startBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${startBarriersWithDays[c].toFormat(reasonDateFormat)}, resource starts at 6:30 mon-fri`,
        );
      });
    });
  });
  describe('Strict parser handles start barrier with days reversed', () => {
    const tag = 'Start=06:30|fri-tue;Override=off';
    ['monday', 'tuesday'].forEach((c) => {
      it(`start at ${startBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's now ${startBarriersWithDays[c].toFormat(reasonDateFormat)}, resource starts at 6:30 fri-tue`,
        );
      });
    });
    ['wednesday', 'thursday'].forEach((c) => {
      it(`not start at ${startBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${startBarriersWithDays[c].toFormat(reasonDateFormat)}, resource starts at 6:30 fri-tue`,
        );
      });
    });
    ['friday', 'saturday', 'sunday'].forEach((c) => {
      it(`start at ${startBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, startBarriersWithDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's now ${startBarriersWithDays[c].toFormat(reasonDateFormat)}, resource starts at 6:30 fri-tue`,
        );
      });
    });
  });
  describe('Strict parser handles stop barrier with days', () => {
    const tag = 'Stop=17:30|mon-fri;Override=off';
    ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach((c) => {
      it(`stop at ${stopBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's now ${stopBarriersWithDays[c].toFormat(reasonDateFormat)}, resource stops at 17:30 mon-fri`,
        );
      });
    });
    ['saturday', 'sunday'].forEach((c) => {
      it(`not stop at ${stopBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${stopBarriersWithDays[c].toFormat(reasonDateFormat)}, resource stops at 17:30 mon-fri`,
        );
      });
    });
  });
  describe('Strict parser handles stop barrier with days reversed', () => {
    const tag = 'Stop=17:30|thu-mon;Override=off';
    ['monday'].forEach((c) => {
      it(`stop at ${stopBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's now ${stopBarriersWithDays[c].toFormat(reasonDateFormat)}, resource stops at 17:30 thu-mon`,
        );
      });
    });
    ['tuesday', 'wednesday'].forEach((c) => {
      it(`not stop at ${stopBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
        expect(action).to.equal('NOOP');
        expect(reason).to.equal(
          `It's now ${stopBarriersWithDays[c].toFormat(reasonDateFormat)}, resource stops at 17:30 thu-mon`,
        );
      });
    });
    ['thursday', 'friday', 'saturday', 'sunday'].forEach((c) => {
      it(`stop at ${stopBarriersWithDays[c]}`, () => {
        const [action, reason] = strictParser(tag, stopBarriersWithDays[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's now ${stopBarriersWithDays[c].toFormat(reasonDateFormat)}, resource stops at 17:30 thu-mon`,
        );
      });
    });
  });
});
