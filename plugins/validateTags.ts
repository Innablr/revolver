import { RevolverPlugin } from './pluginInterface';
import dateTime from '../lib/dateTime';
import { Duration } from 'luxon';
import { NoopAction, SetTagAction, UnsetTagAction, StopAction } from '../actions/actions';
import { ToolingInterface } from '../drivers/instrumentedResource';

export default class ValidateTagsPlugin extends RevolverPlugin {
  protected supportedResources = [
    'ec2',
    'ebs',
    'snapshot',
    'rdsInstance',
    'rdsMultiAz',
    'rdsCluster',
    'redshiftCluster',
    'local',
  ];

  private setActions(resource: any, actionsDef: string[], tag: string, message: string) {
    const logger = this.logger;
    const utcTimeNow = dateTime.getTime('utc');

    (actionsDef || []).forEach((xa: string) => {
      switch (xa) {
        case '_setTag':
          resource.addAction(new SetTagAction(this, tag, message));
          break;
        case 'warn':
        case 'warning':
          resource.addAction(new SetTagAction(this, `Warning${tag}`, message));
          break;
        case 'stop':
          if (utcTimeNow.diff(resource.launchTimeUtc, 'minutes') > Duration.fromObject({ minutes: 30 })) {
            resource.addAction(new StopAction(this, `${resource.resourceType} ${resource.resourceId} tag ${tag} is missing`));
          } else {
            resource.addAction(
              new NoopAction(
                this,
                `${resource.resourceType} ${resource.resourceId} would've been stopped because tag ${tag} is missing but it was created less than 30 minutes ago`,
              ),
            );
          }
          break;
        default:
          logger.error(`Action ${xa} is not supported by ${this.name}`);
      }
    });
  }

  private isResourceTypeAllowed(resource: ToolingInterface) {
    let result = true;
    if (typeof this.pluginConfig.onlyResourceTypes === 'string') {
      result = resource.resourceType === this.pluginConfig.onlyResourceTypes;
    }
    if (Array.isArray(this.pluginConfig.onlyResourceTypes)) {
      result = this.pluginConfig.onlyResourceTypes.includes(resource.resourceType);
    }
    if (typeof this.pluginConfig.excludeResourceTypes === 'string') {
      result = resource.resourceType !== this.pluginConfig.onlyResourceTypes;
    }
    if (Array.isArray(this.pluginConfig.excludeResourceTypes)) {
      result = !this.pluginConfig.onlyResourceTypes.includes(resource.resourceType);
    }
    return result;
  }

  private copyTagsFromParent(resource: ToolingInterface, tag: string, actions: any[]): any[] {
    if (!actions.includes('copyFromParent')) {
      return actions;
    }
    if (resource.resourceType === 'ebs' || resource.resourceType === 'snapshot') {
      // Try to get the tags from parent instance (ebs and snapshots)
      this.logger.debug(`Trying to get tag ${tag} from parent instance`);
      const instanceTag = resource.resource.instanceDetails?.Tags?.find((xi: any) => xi.Key === tag);
      if (instanceTag) {
        this.setActions(resource, ['_setTag'], tag, instanceTag.Value);
        this.logger.debug(
          `Tag '${instanceTag.Key}' found on parent instance ${resource.resource.instanceDetails.InstanceId} with value ` +
            `'${instanceTag.Value}' and will attach to the ${resource.resourceType} ${resource.resourceId}`,
        );
      } else {
        // Try to get the tags from parent volume (only snapshots)
        this.logger.debug(`Trying to get tag ${tag} from parent volume`);
        const volumeTag = resource.resource.volumeDetails?.Tags?.find((xi: any) => xi.Key === tag);
        if (volumeTag) {
          this.setActions(resource, ['_setTag'], tag, volumeTag.Value);
          this.logger.debug(
            `Tag '${instanceTag.Key}' found on parent volume ${resource.resource.volumeDetails.VolumeId} with value ` +
              `'${instanceTag.Value}' and will attach to the ${resource.resourceType} ${resource.resourceId}`,
          );
        }
      }
    }
    return actions.filter((xi: any) => xi !== 'copyFromParent');
  }

  private setTagDefault(resource: ToolingInterface, tag: string, actions: any[]): any[] {
    const defaultValue = this.pluginConfig.tagMissing?.find((xi: any) => typeof xi.setDefault === 'string');
    if (defaultValue) {
      this.setActions(resource, ['_setTag'], tag, defaultValue.setDefault);
    }
    return actions.filter((xi: any) => !xi.setDefault);
  }

  generateActions(resource: any): Promise<any> {
    const tagsSplit = Array.isArray(this.pluginConfig.tag) ? this.pluginConfig.tag : this.pluginConfig.tag.split(',');
    const tags = tagsSplit.filter((xi: string) => xi);

    tags.forEach((xa: string) => {
      this.logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}...`);
      let actionsTagMissing = this.pluginConfig.tagMissing;
      let actionsTagNotMatch = this.pluginConfig.tagNotMatch;
      const tag = resource.tag(xa);

      if (this.isResourceTypeAllowed(resource)) {
        if (tag === undefined) {
          this.logger.debug(`Tag ${xa} not found on ${resource.resourceType} ${resource.resourceId}`);
          actionsTagMissing = this.copyTagsFromParent(resource, xa, actionsTagMissing);
          actionsTagMissing = this.setTagDefault(resource, xa, actionsTagMissing);

          this.setActions(resource, actionsTagMissing, xa, `Tag ${xa} is missing`);
          return;
        }

        if (this.pluginConfig.match) {
          const re = new RegExp(this.pluginConfig.match);
          if (!re.test(tag)) {
            this.logger.debug(
              `Tag ${xa}=${tag} does not match ${re} on ${resource.resourceType} ${resource.resourceId}`,
            );

            actionsTagNotMatch = this.copyTagsFromParent(resource, xa, actionsTagMissing);
            actionsTagNotMatch = this.setTagDefault(resource, xa, actionsTagMissing);

            this.setActions(
              resource,
              actionsTagNotMatch,
              xa,
              `Tag ${xa} doesn't match regex /${this.pluginConfig.match}/`,
            );
          }
          return;
        }
        this.logger.debug(`${this.name}: ${resource.resourceType} ${resource.resourceId} tag [${xa}] = [${tag}], validation successful, removing warning tag`);
        resource.addAction(new UnsetTagAction(this, `Warning${xa}`));
      }
    });

    return Promise.resolve(resource);
  }
}
