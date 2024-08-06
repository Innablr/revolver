import { logger } from './lib/logger.js';

import environ from './lib/environ.js';
import { RevolverConfig } from './lib/config.js';
import { DateTime, Interval } from 'luxon';
import getParser from './plugins/parsers/index.js';

// a set of results for each 15 minute interval over a week
type ScheduleResults = Map<DateTime<true>, boolean>;

const TEST_INTERVAL = 15; // number of minutes between samples
const TEST_WINDOW = { days: 7 }; // over what interval to sample
const DATE_FORMAT = 'ccc T';
/**
 * Evaluate the schedule every `interval` within the `window` and return a list of times:results.
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
    results.set(t!, action == 'START');
  });

  return results;
}

const everyNth = (arr: any[], nth: number) => arr.filter((e, i) => i % nth === nth - 1);

const zeroPad = (num: any, places: number) => String(num).padStart(places, '0')

/**
 * Validate the configuration provided by $CONFIG_FILE environment variable
 * @returns a parsed and validated configuration object
 */
async function validateConfig(): Promise<object> {
  // Note: configuration is not especially strict (unknown keys are ignored/stripped)
  // const config = await (environ.configPath
  //   ? RevolverConfig.readConfigFromFile(environ.configPath)
  //   : RevolverConfig.readConfigFromS3(environ.configBucket!, environ.configKey!));

  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const stuff = await runSchedule('Start=08:30|mon-fri;Stop=17:30|mon-fri', startTime);

  const keys = Array.from(stuff.keys());
  const chunkSize = (24 * 60) / TEST_INTERVAL;

  // make an index row - each hour is '|hh '
  const blah = everyNth(keys.splice(0, chunkSize), 4);
  const header = blah.map((t) => '|' + zeroPad(t.hour, 2)).join(' ');

  // Label should be "Mon 00:00"

  logger.info('%s: %s', keys[0].toFormat(DATE_FORMAT), header);
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize); // a chunk of keys
    const str = chunk.map((t) => (stuff.get(t) ? 'Y' : ' ')).join(''); // an array of Y/N
    logger.info('%s: %s', chunk[0].toFormat(DATE_FORMAT), str);
  }

  return {};
}

// Given a configuration file,
// validateConfig().then((config) => logger.info('Dumping validated configuration', config));
await validateConfig();
