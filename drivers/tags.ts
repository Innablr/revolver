import { Logger } from 'tslog';
import { ToolingInterface } from './instrumentedResource';
import { RevolverActionWithTags } from '../actions/actions';
import { chunkArray } from '../lib/common';

export interface TagInterface {
  Key: string;
  Value: string;
}

export interface Tagger {
  setTag(
    awsClient: any,
    logger: Logger<any>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any>;

  masksetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined;

  unsetTag(
    awsClient: any,
    logger: Logger<any>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any>;

  maskunsetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined;
}

class RDSTagger implements Tagger {
  setTag(rds: any, logger: Logger<any>, resources: ToolingInterface[], action: RevolverActionWithTags): Promise<any> {
    return Promise.all(
      resources.map(async function (xr) {
        const safeValues = action.tags.map((xt) => ({
          Key: xt.Key,
          Value: xt.Value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_'),
        }));
        logger.info('%s %s will be set tag %j', xr.resourceType, xr.resourceId, safeValues);
        try {
          return await rds
            .addTagsToResource({
              ResourceName: xr.resourceArn,
              Tags: safeValues,
            })
            .promise();
        } catch (e) {
          logger.error('Error settings tags for %s %s, stack trace will follow:', xr.resourceType, xr.resourceId);
          logger.error(e);
        }
      }),
    );
  }

  masksetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined {
    if (action.tags.every((xt) => resource.tag(xt.Key) === xt.Value)) {
      return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }

  unsetTag(rds: any, logger: Logger<any>, resources: ToolingInterface[], action: RevolverActionWithTags): Promise<any> {
    return Promise.all(
      resources.map(async function (xr) {
        logger.info('RDS instance %s will be unset tags %j', xr.resourceId, action.tags);
        try {
          return await rds
            .removeTagsFromResource({
              ResourceName: xr.resourceArn,
              TagKeys: action.tags,
            })
            .promise();
        } catch (e) {
          logger.error('Error unsettings tags for %s %s, stack trace will follow:', xr.resourceType, xr.resourceId);
          logger.error(e);
        }
      }),
    );
  }

  maskunsetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined {
    if (action.tags.every((xt) => resource.tag(xt.Key) === undefined)) {
      return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }
}

class EC2Tagger implements Tagger {
  setTag(ec2: any, logger: Logger<any>, resources: ToolingInterface[], action: RevolverActionWithTags): Promise<any> {
    logger.info(
      'EC2 instances %j will be set tags %j',
      resources.map((xr) => xr.resourceId),
      action.tags,
    );

    const resourceChunks = chunkArray(resources, 200);

    return Promise.all(
      resourceChunks.map((chunk) =>
        ec2
          .createTags({
            Resources: chunk.map((xr) => xr.resourceId),
            Tags: action.tags,
          })
          .promise(),
      ),
    );
  }

  masksetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined {
    if (action.tags.every((xt) => resource.tag(xt.Key) === xt.Value)) {
      return `${resource.resourceType} ${resource.resourceId} already has tags ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }

  unsetTag(ec2: any, logger: Logger<any>, resources: ToolingInterface[], action: RevolverActionWithTags): Promise<any> {
    logger.info(
      'EC2 instances %j will be unset tags %s',
      resources.map((xr) => xr.resourceId),
      action.tags,
    );

    const resourceChunks = chunkArray(resources, 200);

    return Promise.all(
      resourceChunks.map((chunk) =>
        ec2
          .deleteTags({
            Resources: chunk.map((xr) => xr.resourceId),
            Tags: action.tags,
          })
          .promise(),
      ),
    );
  }

  maskunsetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined {
    if (action.tags.every((xt) => resource.tag(xt.Key) === undefined)) {
      return `${resource.resourceType} ${resource.resourceId} has none tags of ${JSON.stringify(
        action.tags.map((xt) => xt.Key),
      )}`;
    }
    return undefined;
  }
}

export const rdsTagger = new RDSTagger();
export const ec2Tagger = new EC2Tagger();
