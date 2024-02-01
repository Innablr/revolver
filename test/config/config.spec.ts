import { expect } from 'chai';
import { RevolverConfig } from '../../lib/config';
import path from 'path';

describe('Validate example config', function () {
  it('Check defaults', async function () {
    const rc = new RevolverConfig();
    const config = await rc.readConfigFromFile(path.join(__dirname, 'revolver-config-example.yaml'));
    expect(config.defaults.settings.region).to.equal('ap-southeast-2');
    expect(config.defaults.settings.timezoneTag).to.equal('Timezone');
    expect(config.defaults.drivers[0].name).to.equal('ec2');
    expect(config.accounts.excludeList).to.be.an( "array" ).that.is.not.empty;
  });
});
