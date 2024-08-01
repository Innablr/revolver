import { expect } from 'chai';
import { RevolverConfig } from '../../lib/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const EXAMPLE_CONFIG = path.join(__dirname, '..', '..', 'revolver-config-example.yaml');
const SAMPLE_CONFIG_1 = path.join(__dirname, 'revolver-config1.yaml');

const ORG_ACCOUNTS = [
  {
    accountId: '000000000123',
    Arn: 'arn:aws:ec2:ap-southeast-2:123:volume/i-0d31825ea50f73baa', // only [4] used
    settings: {
      region: 'somewhere', // explicitly included
    },
  },
  {
    accountId: '000000000456',
    Arn: 'arn:aws:ec2:ap-southeast-2:777777777777:volume/i-0d31825ea50f73baa', // only [4] used
    Name: 'blah-nonprod', // matches
    settings: {
      region: 'somewhere-else',
    },
  },
  {
    accountId: '000000000789',
    Arn: 'arn:aws:ec2:ap-southeast-2:777777777777:volume/i-0d31825ea50f73baa', // only [4] used
    Name: 'blah-nonprod', // matches - but excluded
    settings: {
      region: 'somewhere-else',
    },
  },
  {
    accountId: '000000000444',
    Arn: 'arn:aws:ec2:ap-southeast-2:777777777777:volume/i-0d31825ea50f73baa', // only [4] used
    Name: 'blah-prod', // not matches
    settings: {
      region: 'somewhere-else',
    },
  },
];

describe('Validate example config', function () {
  it('Check simple parsing', async function () {
    const config = await RevolverConfig.readConfigFromFile(EXAMPLE_CONFIG);
    expect(config.defaults.settings.region).to.equal('ap-southeast-2');
  });
});

describe('Validate test config', function () {
  it('Check simple parsing', async function () {
    const config = await RevolverConfig.readConfigFromFile(SAMPLE_CONFIG_1);

    // basic settings, defaults
    expect(config.defaults.settings.region).to.equal('ap-southeast-2');
    expect(config.defaults.settings.timezone).to.equal('utc');
    expect(config.defaults.settings.timezoneTag).to.equal('Timezone');
    expect(config.accounts.includeList).to.have.lengthOf(3);
    expect(config.accounts.includeList[0].accountId).to.equal('002222222222');
    expect(config.accounts.excludeList).to.deep.equal([{ accountId: '000000000789', settings: { name: 'whatprod' } }]);
    expect(config.defaults.settings.resourceLog?.csv?.reportTags).to.contain.all.members(['Name', 'Schedule']);
    expect(config.defaults.settings.resourceLog?.csv?.overwrite).to.be.false;
    expect(config.defaults.settings.auditLog?.csv?.file).to.equal('audit.csv');

    expect(config.defaults.settings.auditLog?.json?.sqs?.url).to.equal('http://some.sqs.url/queue');
    expect(config.defaults.settings.auditLog?.json?.sqs?.attributes?.thing).to.equal('some value');

    expect(config.defaults.settings.auditLog?.json?.sns?.url).to.equal('TOPIC_ARN');
    expect(config.defaults.settings.auditLog?.json?.sns?.attributes?.thing).to.equal('some other value');

    // second yaml doc
    expect(config.defaults.settings.resourceLog?.json?.file).to.equal('override.json');
    expect(config.accounts.includeList[2].accountId).to.equal('123456789012');

    // driver settings
    expect(config.defaults.drivers[0].name).to.equal('ec2');
    expect(config.defaults.drivers[0].active).to.equal(true);
    expect(config.defaults.drivers[0].pretend).to.equal(false);

    // defaults merged to org/account
    expect(config.organizations[0].settings.name).to.equal('some-org-name');
    // undefined expect(config.organizations[0].settings.stuff).to.equal('xxxx');
    expect(config.organizations[0].settings.region).to.equal('whatever');
    expect(config.organizations[0].settings.revolverRoleName).to.equal('ssPowerCycle');
    expect(config.organizations[1].settings.region).to.equal('eu-west-1');

    expect(config.defaults.plugins.powercycleCentral?.configs.length).to.equal(1);
    expect(config.defaults.plugins.powercycleCentral?.configs[0].matchers.length).to.equal(6);
    expect(config.defaults.plugins.powercycleCentral?.configs[0].availabilityTagPriority).to.equal(5);
    expect((config.defaults.plugins.powercycleCentral?.configs[0].matchers[0].filter as any[]).length).to.equal(3);
    expect(Object.keys(config.defaults.plugins.powercycleCentral?.configs[0].matchers[2].filter as object)[0]).to.equal(
      'resource',
    );

    const predefinedSchedules = config.defaults.plugins.powercycleCentral?.configs[0].predefinedSchedules;
    expect(predefinedSchedules?.BusinessHours).to.equal('Start=08:00|mon-fri;Stop=18:00|mon-fri');
  });
});

describe('Validate org filtering config', function () {
  it('Check simple parsing', async function () {
    const config = await RevolverConfig.readConfigFromFile(SAMPLE_CONFIG_1);
    const updatedAccountsList = RevolverConfig.filterAccountsList(ORG_ACCOUNTS, config);
    const accountIds = updatedAccountsList.map((a) => a.accountId);

    expect(accountIds).to.have.lengthOf(4); // included-org + matched-org + 2 other included
    expect(accountIds).includes('000000000123');
    expect(accountIds).includes('000000000456');
    expect(accountIds).not.includes('000000000789');
    expect(accountIds).not.includes('000000000444');
    expect(updatedAccountsList[0].settings.assumeRoleArn).to.not.be.undefined; //456
  });
});
