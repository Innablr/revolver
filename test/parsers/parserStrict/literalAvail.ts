import getParser from '../../../plugins/parsers';
import { expect } from 'chai';
import { DateTime } from 'luxon';

const timeVariety: { [key: string]: DateTime } = {
  monday630: DateTime.fromJSDate(new Date('2017-06-05 06:30')),
  monday1000: DateTime.fromJSDate(new Date('2017-06-05 10:00')),
  friday1730: DateTime.fromJSDate(new Date('2017-06-09 17:30')),
  friday2130: DateTime.fromJSDate(new Date('2017-06-09 21:30')),
  wednesday1430: DateTime.fromJSDate(new Date('2017-06-07 14:30')),
  saturday830: DateTime.fromJSDate(new Date('2017-06-10 08:30')),
  saturday2130: DateTime.fromJSDate(new Date('2017-06-10 21:30')),
  sunday830: DateTime.fromJSDate(new Date('2017-06-11 08:30')),
  sunday2130: DateTime.fromJSDate(new Date('2017-06-11 21:30')),
};

describe('Strict parser handles literal availability', async function () {
  const strictParser = await getParser('strict');
  describe('24x7', function () {
    Object.keys(timeVariety).forEach(function (k) {
      it(`start at ${timeVariety[k]}`, function () {
        const [action, reason] = strictParser('24x7', timeVariety[k]);
        expect(action).to.equal('START');
        expect(reason).to.equal('Availability 24x7');
      });
    });
  });
  describe('0x7', function () {
    Object.keys(timeVariety).forEach(function (k) {
      it(`stop at ${timeVariety[k]}`, function () {
        const [action, reason] = strictParser('0x7', timeVariety[k]);
        expect(action).to.equal('STOP');
        expect(reason).to.equal('Availability 0x7');
      });
    });
  });
  describe('24x5', function () {
    Object.keys(timeVariety)
      .filter((k) => /mon|tue|wed|thu|fri/.test(k))
      .forEach(function (k) {
        it(`start on weekdays at ${timeVariety[k]}`, function () {
          const [action, reason] = strictParser('24x5', timeVariety[k]);
          expect(action).to.equal('START');
          expect(reason).to.equal(`Availability 24x5 and it is ${timeVariety[k].toFormat('cccc')} now`);
        });
      });
    Object.keys(timeVariety)
      .filter((k) => /sat|sun/.test(k))
      .forEach(function (k) {
        it(`stop over weekend at ${timeVariety[k]}`, function () {
          const [action, reason] = strictParser('24x5', timeVariety[k]);
          expect(action).to.equal('STOP');
          expect(reason).to.equal(`Availability 24x5 and it is ${timeVariety[k].toFormat('cccc')} now`);
        });
      });
  });
});
