import getParser from '../../../plugins/parsers/index.js';
import { expect } from 'chai';
import { DateTime } from 'luxon';

const timeNow = DateTime.now();

describe('Strict parser handles different corner cases', async function () {
  const strictParser = await getParser('strict');
  describe('Strict parser handles tag letters case', function () {
    const cases = [
      'Start=08:30;Stop=17:30;Override=No',
      'start=08:30;stop=17:30;override=no',
      'START=08:30;STOP=17:30;OVERRIDE=NO',
    ];
    const er = strictParser('start=08:30;stop=17:30;override=no', timeNow);
    cases.forEach(function (c) {
      it(`for ${c}`, function () {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [action, reason] = strictParser(c, timeNow);
        expect(strictParser(c, timeNow)).to.have.ordered.members(er);
      });
    });
  });
  describe('Strict parser handles non-window edge cases', function () {
    // Test Time, Schedule, Action
    const cases = [
      // baseline
      ['2024-02-19T10:00', 'start=08:30;stop=17:30', 'START'], // in window
      ['2024-02-19T10:00', 'start=12:30;stop=17:30', 'STOP'], // in pre-window stop
      ['2024-02-19T10:00', 'start=06:30;stop=07:30', 'STOP'], // in post-window stop
      ['2024-02-19T09:59', 'start=10:00;stop=17:30', 'STOP'], // pre-window
      ['2024-02-19T10:00', 'start=10:00;stop=17:30', 'START'], // leading edge
      ['2024-02-19T10:01', 'start=10:00;stop=17:30', 'START'], // in window
      ['2024-02-19T17:29', 'start=10:00;stop=17:30', 'START'], // trailing edge
      ['2024-02-19T17:30', 'start=10:00;stop=17:30', 'STOP'], // trailing edge
      ['2024-02-19T17:31', 'start=10:00;stop=17:30', 'STOP'], // trailing edge
      // stop-only
      ['2024-02-19T09:59', 'stop=10:00', 'NOOP'], // not yet
      ['2024-02-19T10:00', 'stop=10:00', 'STOP'], // stop now
      ['2024-02-19T10:05', 'stop=10:00', 'STOP'], // in stop window (15 mins)
      ['2024-02-19T10:14', 'stop=10:00', 'STOP'], // in stop window (15 mins)
      ['2024-02-19T10:15', 'stop=10:00', 'NOOP'], // outside window
      ['2024-02-19T10:20', 'stop=10:00', 'NOOP'], // outside window
      // start-only
      ['2024-02-19T09:59', 'start=10:00', 'NOOP'], // not yet
      ['2024-02-19T10:00', 'start=10:00', 'START'], // start now
      ['2024-02-19T10:05', 'start=10:00', 'START'], // in start window (15 mins)
      ['2024-02-19T10:14', 'start=10:00', 'START'], // in start window (15 mins)
      ['2024-02-19T10:15', 'start=10:00', 'NOOP'], // outside window
      ['2024-02-19T10:20', 'start=10:00', 'NOOP'], // outside window
    ];
    cases.forEach(function ([testTime, tag, answer]) {
      it(`when ${testTime} and Schedule ${tag} -> ${answer}`, function () {
        const [action, reason] = strictParser(tag, DateTime.fromISO(testTime));
        expect(action).to.equal(answer, reason);
      });
    });
  });
});
