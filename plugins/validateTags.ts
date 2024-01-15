import { RevolverPlugin } from './pluginInterface';
import dateTime from '../lib/dateTime';
import { Duration } from 'luxon';
import { NoopAction, SetTagAction, UnsetTagAction, StopAction } from '../actions/actions';

export default class ValidateTagsPlugin extends RevolverPlugin {
  protected supportedResources = [
    'ec2',
    'ebs',
    'snapshot',
    'rdsInstance',
    'rdsMultiAz',
    'rdsCluster',
    'redshiftCluster',
  ];

  setActions(resource: any, actionsDef: string[], tag: string, message: string) {
    const logger = this.logger;
    const utcTimeNow = dateTime.getTime('utc');

    (actionsDef || []).forEach((xa: string) => {
      switch (xa) {
        case 'copyFromParent':
          resource.addAction(new SetTagAction(this, tag, message));
          break;
        case 'warn':
        case 'warning':
          resource.addAction(new SetTagAction(this, `Warning${tag}`, message));
          break;
        case 'stop':
          if (utcTimeNow.diff(resource.launchTimeUtc, 'minutes') > Duration.fromObject({ minutes: 30 })) {
            resource.addAction(new StopAction(this));
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
          logger.error('Action %s is not supported by %s', xa, this.name);
      }
    });
  }

  generateActions(resource: any): Promise<any> {
    const tagsSplit = Array.isArray(this.pluginConfig.tag) ? this.pluginConfig.tag : this.pluginConfig.tag.split(',');
    const tags = tagsSplit.filter((xi: string) => xi);
    return Promise.all(
      tags.map((xa: string) => {
        this.logger.debug(`Plugin ${this.name} Processing ${resource.resourceType} ${resource.resourceId}...`);
        const tag = resource.tag(xa);

        if (tag === undefined) {
          const resourceType = resource.resourceType;
          if (this.pluginConfig.allow_set_from_parent && (resourceType === 'ebs' || resourceType === 'snapshot')) {
            // Try to get the tags from parent instance (ebs and snapshots)
            if (resource.resource.instanceDetails && resource.resource.instanceDetails.Tags) {
              const instanceTag = resource.resource.instanceDetails.Tags.find((xi: any) => xi.Key === xa);
              if (instanceTag) {
                this.setActions(resource, ['copyFromParent'], xa, instanceTag.Value);
                this.logger.debug(
                  'Tag %s found on instance parent with value %s and will attach to the %s %s',
                  instanceTag.Key,
                  instanceTag.Value,
                  resource,
                  resourceType,
                  resource.resourceId,
                );
                return xa;
              }
            }
            // Try to get the tags from parent volume (only snapshots)
            if (resource.resource.volumeDetails && resource.resource.volumeDetails.Tags) {
              const volumeTag = resource.resource.volumeDetails.Tags.find((xi: any) => xi.Key === xa);
              if (volumeTag) {
                this.setActions(resource, ['copyFromParent'], xa, volumeTag.Value);
                this.logger.debug(
                  'Tag %s found on volume parent with value %s and will attach to the snapshot %s',
                  volumeTag.Key,
                  volumeTag.Value,
                  resource.resourceId,
                );
                return xa;
              }
            }
          }
          // No tags retrieved from parents, add warning ones
          this.logger.debug(
            'Tag %s not found, attaching missing tag to %s %s',
            xa,
            resource.resourceType,
            resource.resourceId,
          );
          this.setActions(resource, this.pluginConfig.tag_missing, xa, `Tag ${xa} is missing`);
          return xa;
        }

        if (this.pluginConfig.match) {
          const re = new RegExp(this.pluginConfig.match);
          if (!re.test(tag)) {
            this.setActions(
              resource,
              this.pluginConfig.tag_not_match,
              xa,
              `Tag ${xa} doesn't match regex /${this.pluginConfig.match}/`,
            );
          }
          return xa;
        }

        this.logger.debug(
          '%s: %s %s tag [%s] = [%s], validation successful, removing warning tag',
          this.name,
          resource.resourceType,
          resource.resourceId,
          xa,
          tag,
        );
        resource.addAction(new UnsetTagAction(this, `Warning${xa}`));

        return xa;
      }),
    ).then(() => Promise.resolve(resource));
  }
}
