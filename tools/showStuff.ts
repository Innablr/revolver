import { DateTime, DurationLike, Interval } from 'luxon';
import { Context, EventBridgeEvent } from 'aws-lambda';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handler as revolverHandle } from '../revolver.js';
import environ from '../lib/environ.js';
import { promises as fs } from 'node:fs';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const TEST_INTERVAL = 15; // number of minutes between samples

function runRevolver(timeStamp: DateTime) {
  // Copied from invoke.ts
  const event: EventBridgeEvent<'Scheduled Event', 'test-event'> = {
    id: '0',
    'detail-type': 'Scheduled Event',
    version: '0',
    account: '0',
    time: timeStamp.toISO()!,
    region: 'ap-southeast-2',
    source: 'revolver',
    resources: [],
    detail: 'test-event',
  };

  const context: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'revolver',
    functionVersion: '0',
    invokedFunctionArn: 'arn:aws:lambda:ap-southeast-2:0:function:revolver',
    memoryLimitInMB: '512',
    awsRequestId: '0',
    logGroupName: 'revolver',
    logStreamName: '0',
    getRemainingTimeInMillis: () => 0,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  console.log(`Running revolver at timestamp [${timeStamp}]`);
  const r = revolverHandle(event, context, () => {});
  if (r instanceof Promise) {
    r.then(() => {
      console.log('Done');
    }).catch((e: Error) => {
      console.error(e);
      process.exit(1);
    });
  }
}

async function runRevolverWeek(configFile: string, resourceFile: string) {
  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const testInterval = { minutes: TEST_INTERVAL };
  const testDuration = { days: 7 };

  // determine all the test times across the window
  const interval = Interval.fromDateTimes(startTime, startTime.plus(testDuration));
  const testTimes = interval.splitBy(testInterval).map((d) => d.start);

  // TOOD: make a copy of config file, with some hacks:
  // - update localResourcesFile
  // - set output to a unique file
  // - disable console logging
  const tempConfigFile = path.join(__dirname, 'temp-config.yaml');
  const config: any = yaml.load(await fs.readFile(configFile, { encoding: 'utf8' }));
  config.defaults.settings.resourceLog = {
    csv: { file: 'output/resources.%name.csv', overwrite: true, append: false },
  };
  config.defaults.settings.auditLog = undefined;
  await fs.writeFile(tempConfigFile, yaml.dump(config));

  environ.configPath = tempConfigFile;
  runRevolver(startTime);

  // evaluate the parser across every test time
  // const results: ScheduleResults = new Map();
  // testTimes.forEach((t) => {
  //   // TODO: fiddle with config file to make unique output
  //   // TODO: change log output to non-console

  //   runRevolver(t!.toJSDate());
  //   // const [action] = parser(schedule, t);
  //   // results.set(t!, action === 'START');
  // });
}

const scriptName = path.basename(__filename);
if (process.argv.length < 4) {
  console.log(`USAGE: node ${scriptName} CONFIG_FILE RESOURCE_FILE\n`);
  process.exit(1);
}

// 0 and 1 are node program and script
const configFile = process.argv[2];
const resourceFile = process.argv[3];
runRevolverWeek(configFile, resourceFile);
