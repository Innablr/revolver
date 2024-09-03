import fs from 'node:fs';
import { promises as fs2 } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Context, EventBridgeEvent } from 'aws-lambda';
import yaml from 'js-yaml';
import { DateTime, Interval } from 'luxon';
import environ from '../lib/environ.js';
import { handler as revolverHandle } from '../revolver.js';
import { parse } from 'csv-parse';
import { DateTime as LuxonDateTime } from 'luxon';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const TEST_INTERVAL = 15; // number of minutes between samples

/**
 * Run a single cycle of Revolver with the time set to the given value
 * @param timeStamp
 */
async function runRevolver(timeStamp: DateTime) {
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
  const blah = await revolverHandle(event, context, () => {});
}

async function cleanOutputDirectory(dir: string) {
  // TODO: mkdir if not exists
  for await (const fn of await fs2.readdir(dir)) {
    await fs2.unlink(path.join(dir, fn));
  }
}

async function runRevolverWeek(configFile: string, resourceFile: string, outputDirectory = './output') {
  const startTime = DateTime.utc(2017, 3, 12, 0, 0, 0, 0);
  const testInterval = { minutes: TEST_INTERVAL };
  const testDuration = { days: 7 };

  // determine all the test times across the window
  const interval = Interval.fromDateTimes(startTime, startTime.plus(testDuration));
  const testTimes = interval.splitBy(testInterval).map((d) => d.start);

  cleanOutputDirectory(outputDirectory);

  // TOOD: make a copy of config file, with some hacks:
  // - update localResourcesFile
  // - set output to a unique file
  // - disable console logging
  // - disable AWS roles, drivers
  const tempConfigFile = path.join(__dirname, 'temp-config.yaml');
  const config: any = yaml.load(await fs2.readFile(configFile, { encoding: 'utf8' }));
  config.defaults.settings.organizationRoleName = 'none';
  config.defaults.settings.revolverRoleName = 'none';
  config.defaults.settings.localResourcesFile = resourceFile;
  config.defaults.settings.resourceLog = {
    csv: { file: `${outputDirectory}/resources.%name.csv`, overwrite: true, append: true },
  };
  config.defaults.settings.auditLog = undefined;
  config.defaults.drivers.forEach((d: any) => {
    d.pretend = true;
  });
  await fs2.writeFile(tempConfigFile, yaml.dump(config));

  environ.configPath = tempConfigFile;

  // evaluate the parser across every test time
  for (const t of testTimes) {
    console.log(`XXXXXX Before ${t}`);
    await runRevolver(t!);
    console.log(`XXXXXX After ${t}`);
  }
}

async function summariseOutputData(dir: string) {
  for await (const fn of await fs2.readdir(dir)) {
    // Summarise the CSV file
    console.log(`Processing ${fn}`);
    const records: { [key: string]: any[] } = {};
    const parser = fs.createReadStream(`${dir}/${fn}`).pipe(parse({ columns: true }));
    for await (const record of parser) {
      const key = `${record.ACCOUNT_ID}:${record.ACCOUNT_NAME}:${record.REGION}:${record.TYPE}:${record.ID}`;
      if (!records[key]) {
        records[key] = [];
      }
      let state = record.STATE;
      if (record.ACTION === 'stop') {
        state = 'stopped';
      } else if (record.ACTION === 'start') {
        state = 'running';
      }
      records[key].push([LuxonDateTime.fromISO(record.TIME).toUTC(), state, record.MATCHER]);
    }
    // Emit the summary
  }
}

const scriptName = path.basename(__filename);
if (process.argv.length < 4) {
  console.log(`USAGE: node ${scriptName} CONFIG_FILE RESOURCE_FILE\n`);
  process.exit(1);
}

// 0 and 1 are node program and script
const configFile = process.argv[2];
const resourceFile = process.argv[3];
// runRevolverWeek(configFile, resourceFile);
await summariseOutputData('./output');

// TODO: load the CSV and turn the "running,StopAction" etc into a list of "target stte"
// Summarise and output
