import getParser from '../../../plugins/parsers/index.js';
import { expect } from 'chai';
import { DateTime, Interval } from 'luxon';

it('Strict parser calculates coverage correctly', async function () {
  const testInterval = 15; // number of minutes between samples
  const testWindow = { days: 7 }; // over what interval to sample
  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const interval = Interval.fromDateTimes(startTime, startTime.plus(testWindow));
  const testTimes = interval.splitBy({ minutes: testInterval }).map((d) => d.start);

  // Schedule String, Minutes per Week, Start Running
  const cases = [
    ['24x7', 24 * 7 * 60, false],
    ['24x5', 24 * 5 * 60, false],
    ['0x7', 0, false],
    ['Start=08:30;Stop=09:00', 30 * 7, false],
    ['Start=08:30|mon-fri;Stop=09:00|mon-fri', 30 * 5, false],
    ['Start=09:00|mon-fri;Stop=17:00|mon-fri', 8 * 60 * 5, false],
    ['xxx', 0, false],
    ['xxx', 24 * 7 * 60, true],
    ['Stop=23:00', 23 * 60, true], // run until 11pm
    ['Stop=23:00', 0, false], // stopped, still stopped after 11pm
    ['Start=23:00', 60 + 24 * 6 * 60, false], // 60 minutes at end of day 1, then 24h/d after
    ['Start=23:00', 24 * 7 * 60, true], // started, still started after 11pm
    // currently not supported - see https://github.com/Innablr/revolver/issues/382
    // ['Start=08:30|mon;Stop=09:00|mon', 30],
    // ['Start=08:30|mon,thu-fri;Stop=09:00|mon,thu-fri', 30 * 3],
    // ['Start=08:30|mon-tue,thu-fri;Stop=09:00|mon-tue,thu-fri', 30 * 4],
    // ['Start=08:30|mon-wed,fri;Stop=09:00|mon-tue,thu-fri', 30 * 4],
  ];

  const strictParser = await getParser('strict');
  cases.forEach(([tag, answer, startRunning]) => {
    let isRunning = startRunning;
    const numMinutes = testTimes.reduce((uptime, t) => {
      const [action] = strictParser(tag, t);
      if (action == 'START') {
        isRunning = true;
      } else if (action == 'STOP') {
        isRunning = false;
      }
      return isRunning ? uptime + testInterval : uptime;
    }, 0);
    expect(numMinutes).to.equal(answer, `Checking >${tag}<`);
  });
});

it('Check Luxon Interval Edges', async function () {
  const interval = Interval.fromDateTimes(DateTime.fromISO('2024-02-19T10:00'), DateTime.fromISO('2024-02-19T11:00'));
  // Validate Luxon Interval includes the lower range, and excludes the upper range
  expect(interval.contains(DateTime.fromISO('2024-02-19T09:59:59.999'))).to.be.false;
  expect(interval.contains(DateTime.fromISO('2024-02-19T10:00'))).to.be.true;
  expect(interval.contains(DateTime.fromISO('2024-02-19T10:59:59.999'))).to.be.true;
  expect(interval.contains(DateTime.fromISO('2024-02-19T11:00'))).to.be.false;
});
