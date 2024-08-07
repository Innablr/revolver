import { logger } from './lib/logger.js';

import environ from './lib/environ.js';
import { RevolverConfig } from './lib/config.js';
import { DateTime, Interval } from 'luxon';
import getParser from './plugins/parsers/index.js';
import yaml from 'js-yaml';
import * as fs from 'node:fs';

// a set of results for each 15 minute interval over a week
type ScheduleResults = Map<DateTime<true>, boolean>;

const TEST_INTERVAL = 15; // number of minutes between samples
const TEST_WINDOW = { days: 7 }; // over what interval to sample
const DATE_FORMAT = 'ccc DD T'; // 'Sun 12 Mar 2017'


const everyNth = (arr: any[], nth: number) => arr.filter((e, i) => i % nth === nth - 1);

const zeroPad = (num: any, places: number) => String(num).padStart(places, '0')

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
    results.set(t!, action == 'START');
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
  const header = hourlyTimes.map((t) => '|' + zeroPad(t.hour, 2)).join(' ');

  // emit a table describing the uptime window in the week
  console.log('SCHEDULE: %s', schedule);
  console.log('%s: %s', keys[0].toFormat(DATE_FORMAT), header);
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize); // a chunk of keys
    const str = chunk.map((t) => (results.get(t) ? 'Y' : ' ')).join(''); // an array of Y/N
    console.log("%s: %s", chunk[0].toFormat(DATE_FORMAT), str);
  }

  const count = Array.from(results.values()).filter((value) => value).length;
  const totalHours = results.size * TEST_INTERVAL / 60;
  const uptime = count * TEST_INTERVAL / 60; // in hours
  const uptimePercent = (uptime / (24 * 5)) * 100; // in percent
  console.log("UPTIME %f/%d hours (%f%%)", uptime.toFixed(1), totalHours, uptimePercent.toFixed(1));
}

async function checkMatchers() {
  // 2. show which resources would match a given config+resources
  const config = await (environ.configPath
    ? RevolverConfig.readConfigFromFile(environ.configPath)
    : RevolverConfig.readConfigFromS3(environ.configBucket!, environ.configKey!));

  // Override the schedule to test, and the list of resources
  const resourcesDir = '/Users/robers19/CloudFinOps/cloudsnooze-reporting/anz-cloudsnooze-nonprod/output/2024/08/07';
  const resourcesFile = 'resources.aws-ecp-main-workload-bow-nonprod-ap-southeast-2.json';
  const accountDir = '/Users/robers19/CloudFinOps/cloudsnooze-config/nonprod/accounts';
  const accountFile = 'aws-ecp-main-workload-bow-nonprod.yaml';

  const accountConfigYaml = fs.readFileSync(accountDir + '/' + accountFile, 'utf8')
  const accountConfig: any = yaml.load(accountConfigYaml);

  // await main(config);
  config.defaults.settings.resourceLog = undefined;
  config.defaults.settings.auditLog = undefined;
  config.defaults.plugins.powercycleCentral!.configs[0].matchers = accountConfig!.matchers;
}

/**
 * Validate the configuration provided by $CONFIG_FILE environment variable
 * @returns a parsed and validated configuration object
 */
async function validateConfig(): Promise<object> {
  // 1. emit a diagram showing the effect of a schedule
  // const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  // showSchedule('Start=09:00|mon-fri;Stop=18:00|mon-fri', startTime);

  checkMatchers();

  return {};
}

// Given a configuration file,
// validateConfig().then((config) => logger.info('Dumping validated configuration', config));
await validateConfig();
