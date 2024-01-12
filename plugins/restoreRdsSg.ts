import { RevolverPlugin } from './pluginInterface';
import { RestoreRdsSg } from '../actions/actions';

export default class RestoreRdsSecgroupsPlugin extends RevolverPlugin {
  protected supportedResources = ['rdsMultiAzSnapshot'];

  generateActions(resource: any): Promise<any> {
    const logger = this.logger;
    if (resource.resourceType !== 'rdsMultiAzSnapshot') {
      logger.debug('restoreRdsSg ignoring resource type %s', resource.resourceType);
      return Promise.resolve(resource);
    }

    logger.debug(`restoreRdsSg processing ${resource.resourceType} ${resource.resourceId}...`);
    if (resource.tag('revolver/restore_commenced') === undefined) {
      logger.info('Tag revolver/restore_commenced is not set on snapshot %s, skipping', resource.resourceId);
    } else {
      logger.info('Secgroups from snapshot %s will be restored', resource.resourceId);
      resource.actions.push(new RestoreRdsSg(this));
    }

    return Promise.resolve(resource);
  }
}
