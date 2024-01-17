import { RevolverPlugin } from './pluginInterface';
import dateTime from '../lib/dateTime';
import { NoopAction, SetTagAction, StartAction, StopAction } from '../actions/actions';
import getParser from './parsers';

export default class PowerCyclePlugin extends RevolverPlugin {
  private parser: any;
  private scheduleTagName: string;
  private timezoneTagName: string;
  private warningTagName: string;
  private reasonTagName: string;
  protected supportedResources = ['ec2', 'rdsCluster', 'rdsInstance', 'redshiftCluster', 'redshiftClusterSnapshot'];

  constructor(accountConfig: any, pluginName: string, pluginConfig: any) {
    super(accountConfig, pluginName, pluginConfig);
    this.scheduleTagName = this.pluginConfig.availability_tag || 'Schedule';
    this.timezoneTagName = this.accountConfig.timezone_tag || 'Timezone';
    this.warningTagName = `Warning${this.scheduleTagName}`;
    this.reasonTagName = `Reason${this.scheduleTagName}`;
  }

  async initialise(): Promise<PowerCyclePlugin> {
    this.parser = await getParser(this.pluginConfig.tagging || 'strict');
    return Promise.resolve(this);
  }

  generateActions(resource: any): Promise<any> {
    const logger = this.logger;
    const scheduleTag = resource.tag(this.scheduleTagName);
    const tz = resource.tag(this.timezoneTagName) || this.accountConfig.timezone || 'utc';
    const localTimeNow = dateTime.getTime(tz);
    logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}, timezone ${tz}`);

    if (scheduleTag === undefined) {
      logger.debug('Tag "%s" is missing, not analysing availability', this.scheduleTagName);
      resource.addAction(new SetTagAction(this, this.warningTagName, `Tag ${this.scheduleTagName} is missing`));
      return Promise.resolve(resource);
    }

    logger.debug('Checking availability %j', scheduleTag);
    const [r, reason] = this.parser(scheduleTag, localTimeNow);

    switch (r) {
      case 'UNPARSEABLE':
        logger.warn("Tag %s couldn't be parsed: %s", scheduleTag, reason);
        resource.addAction(new SetTagAction(this, this.warningTagName, reason));
        break;
      case 'START':
        logger.debug('Resource should be started: %s', reason);
        resource.addAction(new StartAction(this));
        if (resource.resourceState !== 'running') {
          resource.addAction(new SetTagAction(this, this.reasonTagName, reason));
        }
        break;
      case 'STOP':
        logger.debug('Resource should be stopped: %s', reason);
        resource.addAction(new StopAction(this));
        if (resource.resourceState === 'running') {
          resource.addAction(new SetTagAction(this, this.reasonTagName, reason));
        }
        break;
      case 'NOOP':
        logger.debug('Resource should be left alone: %s', reason);
        resource.addAction(new NoopAction(this, reason));
        break;
      default:
        logger.error('Availability parser returns [%s], which is not supported');
    }

    logger.debug(
      'Finally got actions: %j',
      resource.actions.map((xa: any) => xa.what),
    );
    return Promise.resolve(resource);
  }
}
