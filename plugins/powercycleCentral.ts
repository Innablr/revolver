import { RevolverPlugin } from './pluginInterface';
import dateTime from '../lib/dateTime';
import { NoopAction, StartAction, StopAction } from '../actions/actions';
import { Filter } from './filters';

interface Matcher {
  name: string;
  // todo neaten this. this field is used for both the yaml filter config and the filter objects
  filter: Filter | any;
  schedule: string;
  priority: number;
}

export default class PowerCycleCentralPlugin extends RevolverPlugin {
  private parser: any;

  private readonly scheduleTagName: string;
  private readonly timezoneTagName: string;
  private readonly scheduleTagPriority: number;

  private matchers: Matcher[];

  protected supportedResources = ['ec2', 'rdsCluster', 'rdsInstance', 'redshiftCluster', 'redshiftClusterSnapshot'];

  constructor(accountConfig: any, pluginName: string, pluginConfig: any) {
    super(accountConfig, pluginName, pluginConfig);
    // TODO global defaults for these
    this.scheduleTagName = this.pluginConfig.availabilityTag || 'Schedule';
    this.timezoneTagName = this.accountConfig.timezoneTag || 'Timezone';
    this.scheduleTagPriority = this.pluginConfig.availabilityTagPriority || 0;

    // todo explicit type conversion
    this.matchers = pluginConfig.matchers.sort((a: Matcher, b: Matcher) => {
      if (isNaN(b.priority)) b.priority = 0;
      if (isNaN(a.priority)) a.priority = 0;
      return b.priority - a.priority;
    });
  }

  async initialise(): Promise<PowerCycleCentralPlugin> {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    this.parser = await require(`./parsers/${this.pluginConfig.parser || 'strict'}`).default;
    const localTimeNow = dateTime.getTime('utc');

    this.matchers = await Promise.all(
      this.matchers.map(async (matcher) => {
        const name = Object.keys(matcher.filter)[0];
        const i = await require(`./filters/${name}`);
        const filter = await new i.default(matcher.filter[name]).ready();
        return {
          name: matcher.name,
          filter: filter,
          schedule: matcher.schedule,
          priority: matcher.priority,
        };
      }),
    );

    const invalidSchedules = this.matchers
      .filter((m: Matcher) => {
        const [reason] = this.parser(m.schedule, localTimeNow);
        // TODO ENUM
        return reason === 'UNPARSEABLE';
      })
      .map((m: Matcher): string => {
        return m.schedule;
      });

    if (invalidSchedules.length > 0) {
      const reason = `Plugin ${this.name} has invalid schedules "${invalidSchedules.join(',')}"`;
      this.logger.error(reason);

      // TODO errors aren't handled from the caller, this is passed to the top and crashes, plugin should just not load
      // return Promise.reject(`Plugin ${this.name} has invalid schedules ${invalidSchedules.join(',')}`);
    }

    return Promise.resolve(this);
  }

  generateActions(resource: any): Promise<any> {
    const logger = this.logger;
    const tz = resource.tag(this.timezoneTagName) || this.accountConfig.timezone || 'utc';
    const localTimeNow = dateTime.getTime(tz);
    logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}, timezone ${tz}`);

    // TODO nicer logging defaults to not be too verbose
    let highestMatch = this.matchers.find((matcher: Matcher) => {
      try {
        return matcher.filter.matches(resource);
      } catch (e: any) {
        // errors can occur if the jmespath doesn't relate to the resource at all
        // expected behaviour is a no-match
        logger.debug(`Matcher "${matcher.name}" error ignored: ${e.message}`);
        return false;
      }
    });


    const taggedSchedule = resource.tag(this.scheduleTagName);
    // use the tagged schedule if it's a higher priority or there's no existing match
    if (!highestMatch || this.scheduleTagPriority >= highestMatch.priority) {
      highestMatch = {
        name: `Tag:${this.scheduleTagName}`,
        filter: undefined,
        schedule: taggedSchedule,
        priority: this.scheduleTagPriority,
      };
    }

    if (!highestMatch) {
      logger.debug('No schedule matching resource %s', resource.resourceId);
      return Promise.resolve(resource);
    }

    logger.debug(`Match for "${highestMatch.name}". Checking availability %j`, highestMatch.schedule);
    const [r, reason] = this.parser(highestMatch.schedule, localTimeNow);

    switch (r) {
      case 'UNPARSEABLE':
        logger.warn("Schedule couldn't be parsed: %s", highestMatch.schedule, reason);
        break;
      case 'START':
        logger.debug('Resource should be started: %s', reason);
        resource.addAction(new StartAction(this));
        break;
      case 'STOP':
        logger.debug('Resource should be stopped: %s', reason);
        resource.addAction(new StopAction(this));
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
