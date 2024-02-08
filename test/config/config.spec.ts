import { expect } from 'chai';
import { RevolverConfig } from '../../lib/config';
import path from 'path';

const EXAMPLE_CONFIG = path.join(__dirname, '..', '..', 'revolver-config-example.yaml');
const SAMPLE_CONFIG_1 = path.join(__dirname, 'revolver-config1.yaml');

describe('Validate example config', function () {
  it('Check simple parsing', async function () {
    const config = await new RevolverConfig().readConfigFromFile(EXAMPLE_CONFIG);
    expect(config.defaults.settings.region).to.equal('ap-southeast-2');
  });
});


describe('Validate test config', function () {

  it('Check simple parsing', async function () {
    const config = await new RevolverConfig().readConfigFromFile(SAMPLE_CONFIG_1);

    // basic settings, defaults
    expect(config.defaults.settings.region).to.equal('ap-southeast-2');
    expect(config.defaults.settings.timezone).to.equal('utc');
    expect(config.defaults.settings.timezoneTag).to.equal('Timezone');
    expect(config.accounts.includeList).to.have.lengthOf(1);
    expect(config.accounts.includeList[0].accountId).to.equal("002222222222");
    expect(config.accounts.excludeList).to.deep.equal([]);
    expect(config.defaults.settings.resourceLog?.json?.file).to.equal('resources.json');
    expect(config.defaults.settings.resourceLog?.csv?.reportTags).to.contain.all.members(["Name", "Schedule"]);
    expect(config.defaults.settings.auditLog?.csv?.file).to.equal('audit.csv');


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
    expect(Object.keys(config.defaults.plugins.powercycleCentral?.configs[0].matchers[2].filter as object)[0]).to.equal('resource');

  });
});
