import { logger } from './lib/logger.js';

import environ from './lib/environ.js';
import { RevolverConfig } from './lib/config.js';
import { DateTime, Interval } from 'luxon';
import getParser from './plugins/parsers/index.js';

// a set of results for each 15 minute interval over a week
type ScheduleResults = Map<DateTime<true>, boolean>;

const TEST_INTERVAL = 15; // number of minutes between samples
const TEST_WINDOW = { days: 7 }; // over what interval to sample

// return isRunning an array of 7 * 24 * 4 = 672 intervals, each 15 minutes long
class ScheduleRunner {
  isRunning: boolean;
  constructor() {
    this.isRunning = false;
  }

  /**
   * Simulate a week of running against the given schedule, and return the results
   * @param schedule a string representing the schedule
   * @param startTime the start of the 7-day window
   * @returns Map<DateTime, boolean> where the key is the time, and the value is whether the schedule is running
   */
  async runSchedule(schedule: string, startTime: DateTime): Promise<ScheduleResults> {
    const interval = Interval.fromDateTimes(startTime, startTime.plus(TEST_WINDOW));
    const testTimes = interval.splitBy({ minutes: TEST_INTERVAL }).map((d) => d.start);

    const strictParser = await getParser('strict');
    const results: ScheduleResults = new Map();
    testTimes.forEach((t) => {
      const [action] = strictParser(schedule, t);
      if (action == 'START') {
        this.isRunning = true;
      } else if (action == 'STOP') {
        this.isRunning = false;
      }
      results.set(t!, this.isRunning);
    });

    return results;
  }
}

export default function listComprehension<T>(list: T[], callback: (item: T) => boolean): T[] {
  return list.filter(callback).map((item) => item);
}

/**
 * Validate the configuration provided by $CONFIG_FILE environment variable
 * @returns a parsed and validated configuration object
 */
async function validateConfig(): Promise<object> {
  // Note: configuration is not especially strict (unknown keys are ignored/stripped)
  const config = await (environ.configPath
    ? RevolverConfig.readConfigFromFile(environ.configPath)
    : RevolverConfig.readConfigFromS3(environ.configBucket!, environ.configKey!));

  const sr = new ScheduleRunner();
  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const stuff = await sr.runSchedule('Start=08:30;Stop=17:30', startTime);

  const keys = Array.from(stuff.keys());
  const chunkSize = (24 * 60) / TEST_INTERVAL;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    // do whatever
    logger.info('Chunk: %s', chunk[0]);
    const evenNumbers = listComprehension(chunk, (x) => x % 2 === 0);
    // let s;
    // for (const key of chunk) {
    //   logger.info('   %s: %s', key, stuff.get(key));
    // }
  }

  //   logger.info('Result: %s', stuff);

  //   const interval = Interval.fromDateTimes(startTime, startTime.plus(TEST_WINDOW));
  //   const testDays = interval.splitBy({ days: 1 }).map((d) => d.start);
  //   for (const day of testDays) {
  //     logger.info('Day: %s', day);

  //     const interval2 = Interval.fromDateTimes(day!, day!.plus({ days: 1 }));
  //     const testTimes2 = interval2.splitBy({ minutes: TEST_INTERVAL }).map((d) => d.start);
  //     logger.info('   Tests: %s', testTimes2);

  // }

  //   const testTimes = interval.splitBy({ minutes: TEST_INTERVAL }).map((d) => d.start);
  //   logger.info('interval: %s', interval);
  //   logger.info('testDays: %s', testDays);

  return config;
}

// Given a configuration file,
// validateConfig().then((config) => logger.info('Dumping validated configuration', config));
await validateConfig();
