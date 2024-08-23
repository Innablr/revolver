import getParser from '../../../plugins/parsers/index.js';
import { expect } from 'chai';
import { DateTime, Interval } from 'luxon';

// a set of results for each 15 minute interval over a week
type ScheduleResults = Map<DateTime<true>, boolean>;

const TEST_INTERVAL = 15; // number of minutes between samples
const TEST_WINDOW = { days: 7 }; // over what interval to sample
const DATE_FORMAT = 'ccc DD T'; // 'Sun 12 Mar 2017'

const everyNth = (arr: any[], nth: number) => arr.filter((e, i) => i % nth === nth - 1);

const zeroPad = (num: any, places: number) => String(num).padStart(places, '0');

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
    ['Start=08:30|mon-mon;Stop=09:00|mon-mon', 30, false],
    ['Start=08:30|mon;Stop=09:00|mon', 30, false],
    // currently not supported - see https://github.com/Innablr/revolver/issues/382
    // ['Start=08:30|mon,thu-fri;Stop=09:00|mon,thu-fri', 30 * 3],
    // ['Start=08:30|mon-tue,thu-fri;Stop=09:00|mon-tue,thu-fri', 30 * 4],
    // ['Start=08:30|mon-wed,fri;Stop=09:00|mon-tue,thu-fri', 30 * 4],
  ];

  const strictParser = await getParser('strict');
  cases.forEach(([tag, answer, startRunning]) => {
    let isRunning = startRunning;
    const numMinutes = testTimes.reduce((uptime, t) => {
      const [action] = strictParser(tag, t);
      if (action === 'START') {
        isRunning = true;
      } else if (action === 'STOP') {
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

/**
 * Evaluate the schedule for every interval in the window and return a list of time:results.
 * @param schedule a Revolver schedule string
 * @param startTime when to start the test window
 * @returns a Map of DateTime to boolean representing "matches schedule"
 */
async function runSchedule(schedule: string, startTime: DateTime): Promise<ScheduleResults> {
  // determine all the test times across the window
  const interval = Interval.fromDateTimes(startTime, startTime.plus(TEST_WINDOW));
  const testTimes = interval.splitBy({ minutes: TEST_INTERVAL }).map((d) => d.start);

  // load the parser
  const strictParser = await getParser('strict');

  // evaluate the parser across every test time
  const results: ScheduleResults = new Map();
  testTimes.forEach((t) => {
    const [action] = strictParser(schedule, t);
    results.set(t!, action === 'START');
  });

  return results;
}

/**
 * Evaluate the schedule every `interval` within the `window` and print a table with results.
 * @param schedule a Revolver schedule string
 * @param startTime when to start the test window
 * @returns a Map of DateTime to boolean representing "matches schedule"
 */
async function showSchedule(schedule: string, startTime: DateTime) {
  const results = await runSchedule(schedule, startTime);

  // create a header marking every hour: '|hh '
  const keys = Array.from(results.keys());
  const chunkSize = (24 * 60) / TEST_INTERVAL; // one day
  const hourlyTimes = everyNth(keys.slice(0, chunkSize), 4);
  const header = hourlyTimes.map((t) => `|${zeroPad(t.hour, 2)}`).join(' ');

  // emit a table describing the uptime window in the week
  console.log('SCHEDULE: %s', schedule);
  console.log('%s: %s', keys[0].toFormat(DATE_FORMAT), header);
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize); // a chunk of keys
    const str = chunk.map((t) => (results.get(t) ? 'Y' : ' ')).join(''); // an array of Y/N
    console.log('%s: %s', chunk[0].toFormat(DATE_FORMAT), str);
  }

  const count = Array.from(results.values()).filter((value) => value).length;
  const totalHours = (results.size * TEST_INTERVAL) / 60;
  const uptime = (count * TEST_INTERVAL) / 60; // in hours
  const uptimePercent = (uptime / (24 * 5)) * 100; // in percent
  console.log('UPTIME %f/%d hours (%f%%)', uptime.toFixed(1), totalHours, uptimePercent.toFixed(1));
}

it('Print schedule coverage', async function () {
  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const schedules = [
    'Start=09:00|mon-fri;Stop=18:00|mon-fri', // ok
    'Start=09:00|mon-fri;Stop=00:00|tue-sat', // ok
    'Stop=08:45|wed-wed;Start=13:00|tue-tue', // ok
  ];
  for (const schedule of schedules) {
    await showSchedule(schedule, startTime);
  }
});
