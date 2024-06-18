import getParser from '../../../plugins/parsers';
import { expect } from 'chai';
import { DateTime, Interval } from 'luxon';

const timeNow = DateTime.now();

it('Strict parser calculates coverage correctly', async function () {
  const testInterval = 15; // number of minutes between samples
  const testWindow = { days: 7 }; // over what interval to sample

  const cases = [
    ['24x7', 24 * 7 * 60],
    ['24x5', 24 * 5 * 60],
    ['0x7', 0],
    ['Start=08:30;Stop=09:00', 30 * 7],
    ['Start=08:30|mon-fri;Stop=09:00|mon-fri', 30 * 5],
    ['Start=09:00|mon-fri;Stop=17:00|mon-fri', 8 * 60 * 5],
    ['xxx', 0],
  ];

  const strictParser = await getParser('strict');
  const interval = Interval.fromDateTimes(timeNow, timeNow.plus(testWindow));
  const startTimes = interval.splitBy({ minutes: testInterval }).map((d) => d.start);
  cases.forEach(([tag, answer]) => {
    const numMinutes = startTimes.reduce((uptime, t) => {
      const [action] = strictParser(tag, t);
      return action == 'START' ? uptime + testInterval : uptime;
    }, 0);
    expect(numMinutes).to.equal(answer, `Checking >${tag}<`);
  });
});
