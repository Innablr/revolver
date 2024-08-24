import { NoopAction, StartAction, StopAction } from '../actions/actions.js';
import { ToolingInterface } from '../drivers/instrumentedResource.js';
import dateTime from '../lib/dateTime.js';
import { Filter, buildFilter } from './filters/index.js';
import getParser from './parsers/index.js';
import { RevolverPlugin } from './pluginInterface.js';

interface Matcher {
  name: string;
  // todo neaten this. this field is used for both the yaml filter config and the filter objects
  filter: Filter | any;
  schedule: string;
  priority: number;
  pretend: boolean;
}

/**
 * A plugin for Revolver that applies schedules to resources based on central configuration, optionally overridden
 * by Tags on target resources
 */
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
      if (Number.isNaN(b.priority)) b.priority = 0;
      if (Number.isNaN(a.priority)) a.priority = 0;
      return b.priority - a.priority;
    });
  }

  async initialise(): Promise<PowerCycleCentralPlugin> {
    this.parser = await getParser(this.pluginConfig.parser || 'strict');
    const localTimeNow = dateTime.getTime('utc');

    this.matchers = await Promise.all(
      this.matchers.map(async (matcher) => {
        const filter = await buildFilter(matcher.filter);
        type ObjectKey = keyof typeof this.pluginConfig.predefinedSchedules;
        const resolvedSchedule = this.pluginConfig.predefinedSchedules[matcher.schedule as ObjectKey];
        return {
          name: matcher.name,
          filter: filter,
          schedule: resolvedSchedule ? resolvedSchedule : matcher.schedule,
          priority: matcher.priority,
          pretend: matcher.pretend,
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
      this.logger.error(`Plugin ${this.name} has invalid schedules "${invalidSchedules.join(',')}"`);

      // TODO errors aren't handled from the caller, this is passed to the top and crashes, plugin should just not load
      // return Promise.reject(`Plugin ${this.name} has invalid schedules ${invalidSchedules.join(',')}`);
    }

    return Promise.resolve(this);
  }

  generateActions(resource: ToolingInterface): Promise<any> {
    const logger = this.logger;
    const tz = resource.tag(this.timezoneTagName) || this.accountConfig.timezone || 'utc';
    const localTimeNow = dateTime.getTime(tz);
    logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}, timezone ${tz}`);

    // TODO nicer logging defaults to not be too verbose
    const allMatches = this.matchers.filter((matcher: Matcher) => {
      try {
        return matcher.filter.matches(resource);
      } catch (e: any) {
        // errors can occur if the jmespath doesn't relate to the resource at all
        // expected behaviour is a no-match
        logger.debug(`Matcher "${matcher.name}" error ignored: ${e.message}`);
        return false;
      }
    });

    // Add list of all the matched Matchers to the resource metadata
    // resource.metadata.matches = allMatches.map((matcher: Matcher) => {
    //   return {
    //     name: matcher.name,
    //     schedule: matcher.schedule,
    //     priority: matcher.priority,
    //   };
    // });

    let highestMatch = allMatches[0]; // undefined if no matches
    const taggedSchedule = resource.tag(this.scheduleTagName);
    // use the tagged schedule if it's a higher priority or there's no existing match
    if (taggedSchedule !== undefined && (!highestMatch || this.scheduleTagPriority >= highestMatch.priority)) {
      highestMatch = {
        name: `Tag:${this.scheduleTagName}`,
        filter: undefined,
        schedule: taggedSchedule,
        priority: this.scheduleTagPriority,
        pretend: false,
      };
    }

    if (!highestMatch) {
      logger.debug(`No schedule matching resource ${resource.resourceId}`);
      return Promise.resolve(resource);
    }

    logger.debug(`Match for "${highestMatch.name}". Checking availability ${highestMatch.schedule}`);
    const [r, reason] = this.parser(highestMatch.schedule, localTimeNow);
    resource.metadata.highestMatch = `${highestMatch.name} (${highestMatch.schedule})`;

    switch (r) {
      case 'UNPARSEABLE':
        logger.warn(`Schedule ${highestMatch.schedule} couldn't be parsed: ${reason}`);
        break;
      case 'START':
        logger.debug(`Resource should be started: ${reason}`);
        resource.addAction(new StartAction(this, `[${highestMatch.name}]: ${reason}`, highestMatch.pretend));
        break;
      case 'STOP':
        logger.debug(`Resource should be stopped: ${reason}`);
        resource.addAction(new StopAction(this, `[${highestMatch.name}]: ${reason}`, highestMatch.pretend));
        break;
      case 'NOOP':
        logger.debug(`Resource should be left alone: ${reason}`);
        resource.addAction(new NoopAction(this, `[${highestMatch.name}]: ${reason}`));
        break;
      default:
        logger.error(`Availability parser returns [${r}], which is not supported`);
    }

    logger.debug(`Finally got actions: ${resource.actions.map((xa: any) => xa.what)}`);
    return Promise.resolve(resource);
  }
}
