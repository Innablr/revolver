import { expect } from 'chai';
import { RevolverConfig } from '../../lib/config';
import path from 'path';

describe('Validate example config', function () {
  it('Check simple parsing', async function () {
    const rc = new RevolverConfig();
    const config = await rc.readConfigFromFile(path.join(__dirname, 'revolver-config-example.yaml'));
    expect(config.defaults.settings.region).to.equal('ap-southeast-2');
    expect(config.defaults.settings.timezone).to.equal('utc');
    expect(config.defaults.settings.timezoneTag).to.equal('Timezone');
    expect(config.defaults.drivers[0].name).to.equal('ec2');
    expect(config.defaults.drivers[0].active).to.equal(true);
    expect(config.defaults.drivers[0].pretend).to.equal(false);
    expect(config.accounts.includeList).to.have.lengthOf(1);
    expect(config.accounts.includeList[0].accountId).to.equal(222222222222);
    expect(config.accounts.excludeList).to.deep.equal([]);
  });
});
