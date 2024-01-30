import { Logger } from 'tslog';
import { RevolverLogObject } from '../lib/logger';
import { ToolingInterface } from './instrumentedResource';
import { RevolverActionWithTags } from '../actions/actions';
import { chunkArray, unique } from '../lib/common';
import { EC2Client, CreateTagsCommand, DeleteTagsCommand } from '@aws-sdk/client-ec2';
import { AddTagsToResourceCommand, RDSClient, RemoveTagsFromResourceCommand } from '@aws-sdk/client-rds';

export interface TagInterface {
  Key: string;
  Value: string;
}

export interface Tagger {
  setTag(
    awsClient: any, // TODO: type Client
    logger: Logger<RevolverLogObject>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any>;

  masksetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined;

  unsetTag(
    awsClient: any, // TODO: type Client
    logger: Logger<RevolverLogObject>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any>;

  maskunsetTag(resource: ToolingInterface, action: RevolverActionWithTags): string | undefined;
}

class RDSTagger implements Tagger {
  setTag(
    rds: RDSClient,
    logger: Logger<RevolverLogObject>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any> {
    return Promise.all(
      resources.map(async function (xr) {
        const safeValues = action.tags.map((xt) => ({
          Key: xt.Key,
          Value: xt.Value.replace(/[^A-Za-z0-9 _.:/=+\-@]/g, '_'),
        }));
        logger.info(`${xr.resourceType} ${xr.resourceId} will be set tag ${JSON.stringify(safeValues)}`);
        try {
          return await rds.send(new AddTagsToResourceCommand({
            ResourceName: xr.resourceArn,
            Tags: safeValues,
          }));
        } catch (e) {
          logger.error(`Error settings tags for ${xr.resourceType} ${xr.resourceId}, stack trace will follow`, e);
          return undefined;
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

  unsetTag(
    rds: RDSClient,
    logger: Logger<RevolverLogObject>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any> {
    return Promise.all(
      resources.map(async function (xr) {
        logger.info(`RDS instance ${xr.resourceId} will be unset tags ${action.tags}`);
        try {
          return await rds.send(new RemoveTagsFromResourceCommand({
            ResourceName: xr.resourceArn,
            TagKeys: action.tags.map((xt: TagInterface) => xt.Key),
          }));
        } catch (e) {
          logger.error(`Error unsettings tags for ${xr.resourceType} ${xr.resourceId}, stack trace will follow`, e);
          return undefined;
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
  setTag(
    ec2: EC2Client,
    logger: Logger<RevolverLogObject>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any> {
    logger.info(
      `EC2 ${unique(resources.map((xr) => xr.resourceType)).join(', ')} ` +
        `[${resources.map((xr) => xr.resourceId).join(', ')}] will be set tags ${JSON.stringify(action.tags)}`,
    );

    const resourceChunks = chunkArray(resources, 200);

    return Promise.all(
      resourceChunks.map((chunk) =>
        ec2.send(new CreateTagsCommand({
          Resources: chunk.map((xr) => xr.resourceId),
          Tags: action.tags,
        })),
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

  unsetTag(
    ec2: EC2Client,
    logger: Logger<RevolverLogObject>,
    resources: ToolingInterface[],
    action: RevolverActionWithTags,
  ): Promise<any> {
    logger.info(
      `EC2 ${unique(resources.map((xr) => xr.resourceType)).join(', ')} ` +
        `[${resources.map((xr) => xr.resourceId).join(', ')}] will be unset tags ${JSON.stringify(action.tags)}`,
    );

    const resourceChunks = chunkArray(resources, 200);

    return Promise.all(
      resourceChunks.map((chunk) =>
        ec2.send(new DeleteTagsCommand({
          Resources: chunk.map((xr) => xr.resourceId),
          Tags: action.tags,
        })),
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
