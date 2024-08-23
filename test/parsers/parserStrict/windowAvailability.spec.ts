import getParser from '../../../plugins/parsers/index.js';
import { expect } from 'chai';
import { DateTime } from 'luxon';
import { reasonDateFormat } from '../../../plugins/parsers/strict.js';

const timePoints: { [key: string]: DateTime } = {
  monday629: DateTime.fromJSDate(new Date('2017-06-05 06:29')),
  monday630: DateTime.fromJSDate(new Date('2017-06-05 06:30')),
  monday631: DateTime.fromJSDate(new Date('2017-06-05 06:31')),
  monday1330: DateTime.fromJSDate(new Date('2017-06-05 13:30')),
  monday1530: DateTime.fromJSDate(new Date('2017-06-05 15:30')),
  monday1729: DateTime.fromJSDate(new Date('2017-06-05 17:29')),
  monday1730: DateTime.fromJSDate(new Date('2017-06-05 17:30')),
  monday1731: DateTime.fromJSDate(new Date('2017-06-05 17:31')),
  monday2130: DateTime.fromJSDate(new Date('2017-06-05 21:30')),
  tuesday0000: DateTime.fromJSDate(new Date('2017-06-06 00:00')),
  tuesday0100: DateTime.fromJSDate(new Date('2017-06-06 01:00')),
  tuesday0400: DateTime.fromJSDate(new Date('2017-06-06 04:00')),
};

const timePointsDays: { [key: string]: DateTime } = {
  monday100: DateTime.fromJSDate(new Date('2017-06-05 01:00')),
  monday625: DateTime.fromJSDate(new Date('2017-06-05 06:25')),
  monday635: DateTime.fromJSDate(new Date('2017-06-05 06:35')),
  monday1725: DateTime.fromJSDate(new Date('2017-06-05 17:25')),
  monday1735: DateTime.fromJSDate(new Date('2017-06-05 17:35')),
  tuesday625: DateTime.fromJSDate(new Date('2017-06-06 06:25')),
  tuesday635: DateTime.fromJSDate(new Date('2017-06-06 06:35')),
  tuesday1725: DateTime.fromJSDate(new Date('2017-06-06 17:25')),
  tuesday1735: DateTime.fromJSDate(new Date('2017-06-06 17:35')),
  tuesday2355: DateTime.fromJSDate(new Date('2017-06-06 23:55')),
  wednesday100: DateTime.fromJSDate(new Date('2017-06-07 01:00')),
  wednesday625: DateTime.fromJSDate(new Date('2017-06-07 06:25')),
  wednesday635: DateTime.fromJSDate(new Date('2017-06-07 06:35')),
  wednesday1725: DateTime.fromJSDate(new Date('2017-06-07 17:25')),
  wednesday1735: DateTime.fromJSDate(new Date('2017-06-07 17:35')),
  thursday625: DateTime.fromJSDate(new Date('2017-06-08 06:25')),
  thursday635: DateTime.fromJSDate(new Date('2017-06-08 06:35')),
  thursday1725: DateTime.fromJSDate(new Date('2017-06-08 17:25')),
  thursday1735: DateTime.fromJSDate(new Date('2017-06-08 17:35')),
  thursday2355: DateTime.fromJSDate(new Date('2017-06-08 23:55')),
  friday625: DateTime.fromJSDate(new Date('2017-06-09 06:25')),
  friday635: DateTime.fromJSDate(new Date('2017-06-09 06:35')),
  friday1725: DateTime.fromJSDate(new Date('2017-06-09 17:25')),
  friday1735: DateTime.fromJSDate(new Date('2017-06-09 17:35')),
  saturday100: DateTime.fromJSDate(new Date('2017-06-10 01:00')),
  saturday625: DateTime.fromJSDate(new Date('2017-06-10 06:25')),
  saturday635: DateTime.fromJSDate(new Date('2017-06-10 06:35')),
  saturday1725: DateTime.fromJSDate(new Date('2017-06-10 17:25')),
  saturday1735: DateTime.fromJSDate(new Date('2017-06-10 17:35')),
  sunday100: DateTime.fromJSDate(new Date('2017-06-11 01:00')),
  sunday625: DateTime.fromJSDate(new Date('2017-06-11 06:25')),
  sunday635: DateTime.fromJSDate(new Date('2017-06-11 06:35')),
  sunday1725: DateTime.fromJSDate(new Date('2017-06-11 17:25')),
  sunday1735: DateTime.fromJSDate(new Date('2017-06-11 17:35')),
  sunday2355: DateTime.fromJSDate(new Date('2017-06-11 23:55')),
};

describe('Strict parser handles availability windows', async function () {
  const strictParser = await getParser('strict');
  describe('Strict parser handles availability windows normal Start=6:30;Stop=17:30', function () {
    const tag = 'Start=06:30;Stop=17:30';
    ['monday629'].forEach(function (c) {
      it(`stop at ${timePoints[c]}`, function () {
        const [action, reason] = strictParser(tag, timePoints[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's ${timePoints[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 all week`,
        );
      });
    });
    ['monday630', 'monday631', 'monday1330', 'monday1530', 'monday1729'].forEach(function (c) {
      it(`start at ${timePoints[c]}`, function () {
        const [action, reason] = strictParser(tag, timePoints[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePoints[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 all week`,
        );
      });
    });
    ['monday1730', 'monday1731', 'monday2130', 'tuesday0000', 'tuesday0100', 'tuesday0400'].forEach(function (c) {
      it(`stop at ${timePoints[c]}`, function () {
        const [action, reason] = strictParser(tag, timePoints[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's ${timePoints[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 all week`,
        );
      });
    });
  });
  describe('Strict parser handles availability windows reversed Start=17:30;Stop=06:30', function () {
    const tag = 'Start=17:30;Stop=06:30';
    ['monday629'].forEach(function (c) {
      it(`start at ${timePoints[c]}`, function () {
        const [action, reason] = strictParser(tag, timePoints[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePoints[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 all week`,
        );
      });
    });
    ['monday630', 'monday631', 'monday1330', 'monday1530', 'monday1729'].forEach(function (c) {
      it(`stop at ${timePoints[c]}`, function () {
        const [action, reason] = strictParser(tag, timePoints[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's ${timePoints[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 all week`,
        );
      });
    });
    ['monday1730', 'monday1731', 'monday2130', 'tuesday0000', 'tuesday0100', 'tuesday0400'].forEach(function (c) {
      it(`not start at ${timePoints[c]}`, function () {
        const [action, reason] = strictParser(tag, timePoints[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePoints[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 all week`,
        );
      });
    });
  });
  describe('Strict parser handles availability windows normal with days Start=06:30;Stop=17:30|mon-fri', function () {
    const tag = 'Start=06:30;Stop=17:30|mon-fri';
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+625$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+635$/.test(k))
      .forEach(function (c) {
        it(`weekday start at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+1725$/.test(k))
      .forEach(function (c) {
        it(`weekday start at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+1735$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /sat|sun/.test(k))
      .forEach(function (c) {
        it(`weekend stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 mon-fri`,
          );
        });
      });
  });
  describe('Strict parser handles availability windows normal with reversed days Start=06:30;Stop=17:30|fri-mon', function () {
    const tag = 'Start=06:30;Stop=17:30|fri-mon';
    Object.keys(timePointsDays)
      .filter((k) => /(tue|wed|thu)\w+625$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(tue|wed|thu)\w+635$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(tue|wed|thu)\w+1725$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(tue|wed|thu)\w+1735$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun|mon)\w+625$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun|mon)\w+635$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun|mon)\w+1725$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun|mon)\w+1735$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 6:30 till 17:30 fri-mon`,
          );
        });
      });
  });
  /*
  describe('Strict parser handles availability windows reversed with days Start=17:30;Stop=06:30|mon-fri', function () {
    const tag = 'Start=17:30;Stop=06:30|mon-fri';
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+625$/.test(k))
      .forEach(function (c) {
        it(`weekday start at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+635$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+1725$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(mon|tue|wed|thu|fri)\w+1735$/.test(k))
      .forEach(function (c) {
        it(`weekday start at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
          );
        });
      });
    ['saturday100', 'saturday625'].forEach(function (c) {
      it(`weekend start at ${timePointsDays[c]}`, function () {
        const [action, reason] = strictParser(tag, timePointsDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
        );
      });
    });
    ['saturday635', 'saturday1725', 'saturday1735', 'sunday100', 'sunday625', 'sunday635', 'sunday1725'].forEach(
      function (c) {
        it(`weekend stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
          );
        });
      },
    );
    ['sunday1735', 'sunday2355', 'monday100'].forEach(function (c) {
      it(`weekend start at ${timePointsDays[c]}`, function () {
        const [action, reason] = strictParser(tag, timePointsDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 mon-fri`,
        );
      });
    });
  });
  describe('Strict parser handles availability windows reversed with reversed days Start=17:30;Stop=06:30|fri-tue', function () {
    const tag = 'Start=17:30;Stop=06:30|fri-tue';
    ['monday625', 'monday1735', 'tuesday625', 'tuesday1735'].forEach(function (c) {
      it(`weekday start at ${timePointsDays[c]}`, function () {
        const [action, reason] = strictParser(tag, timePointsDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
        );
      });
    });
    ['monday635', 'monday1725', 'tuesday635', 'tuesday1725'].forEach(function (c) {
      it(`weekday stop at ${timePointsDays[c]}`, function () {
        const [action, reason] = strictParser(tag, timePointsDays[c]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal(
          `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
        );
      });
    });
    ['tuesday2355', 'wednesday100', 'wednesday625'].forEach(function (c) {
      it(`weekend start at ${timePointsDays[c]}`, function () {
        const [action, reason] = strictParser(tag, timePointsDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
        );
      });
    });
    ['wednesday635', 'wednesday1725', 'wednesday1735', 'thursday625', 'thursday635', 'thursday1725'].forEach(
      function (c) {
        it(`weekend stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
          );
        });
      },
    );
    ['thursday1735', 'thursday2355'].forEach(function (c) {
      it(`weekend start at ${timePointsDays[c]}`, function () {
        const [action, reason] = strictParser(tag, timePointsDays[c]);
        expect(action).to.equal('START');
        expect(reason).to.equal(
          `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
        );
      });
    });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun)\w+625$/.test(k))
      .forEach(function (c) {
        it(`weekday start at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun)\w+635$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun)\w+1725$/.test(k))
      .forEach(function (c) {
        it(`weekday stop at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
          );
        });
      });
    Object.keys(timePointsDays)
      .filter((k) => /(fri|sat|sun)\w+1735$/.test(k))
      .forEach(function (c) {
        it(`weekday start at ${timePointsDays[c]}`, function () {
          const [action, reason] = strictParser(tag, timePointsDays[c]);
          expect(action).to.equal('START');
          expect(reason).to.equal(
            `It's ${timePointsDays[c].toFormat(reasonDateFormat)}, availability is from 17:30 till 6:30 fri-tue`,
          );
        });
      });
  });
  */
});
