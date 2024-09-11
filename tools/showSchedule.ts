import { DateTime, type DurationLike, Interval } from 'luxon';
import getParser from '../plugins/parsers/index.js';

// a set of results for each 15 minute interval over a week
type ScheduleResults = Map<DateTime<true>, boolean>;

const DATE_FORMAT = 'ccc DD T'; // 'Sun 12 Mar 2017'

const TEST_INTERVAL = 15; // number of minutes between samples
// const TEST_WINDOW = { days: 7 }; // over what interval to sample

const everyNth = (arr: any[], nth: number) => arr.filter((_e, i) => i % nth === nth - 1);

const zeroPad = (num: any, places: number) => String(num).padStart(places, '0');

/**
 * Evaluate the schedule for every interval in the window and return a list of time:results.
 * @param schedule a Revolver schedule string
 * @param startTime when to start the test window
 * @returns a Map of DateTime to boolean representing "matches schedule"
 */
async function runSchedule(
  parser: any,
  schedule: string,
  startTime: DateTime,
  testInterval: DurationLike,
  testDuration: DurationLike,
): Promise<ScheduleResults> {
  // determine all the test times across the window
  const interval = Interval.fromDateTimes(startTime, startTime.plus(testDuration));
  const testTimes = interval.splitBy(testInterval).map((d) => d.start);

  // evaluate the parser across every test time
  const results: ScheduleResults = new Map();
  testTimes.forEach((t) => {
    const [action] = parser(schedule, t);
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
async function showSchedule(schedule: string) {
  const strictParser = await getParser('strict');
  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const testInterval = { minutes: TEST_INTERVAL };
  const testDuration = { days: 7 };

  const results = await runSchedule(strictParser, schedule, startTime, testInterval, testDuration);

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
  console.log();
}

// Run the schedule for the given string
const schedules = [
  'Start=09:00|mon-fri;Stop=18:00|mon-fri', // ok
  'Start=09:00|mon-fri;Stop=00:00|tue-sat', // ok
  'Stop=08:45|wed-wed;Start=13:00|tue-tue', // ok
];
for (const schedule of schedules) {
  await showSchedule(schedule);
}
