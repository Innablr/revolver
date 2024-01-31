import { ToolingInterface } from './instrumentedResource';
import { DriverInterface } from './driverInterface';
import { DateTime } from 'luxon';
import { Tag } from '@aws-sdk/client-ec2';
import { promises as fs} from 'fs';
import path from 'node:path';
import { RevolverActionWithTags } from "../actions/actions";

class InstrumentedLocal extends ToolingInterface {
  private readonly topResource: any;
  constructor(resource: any) {
    super(resource.resource);
    this.topResource = resource;
  }
  get resourceId(): string {
    return this.topResource['resourceId'];
  }
  get resourceType(): string {
    return 'local';
  }
  get resourceArn(): string {
    return this.topResource['resourceArn'];
  }
  get launchTimeUtc(): DateTime<boolean> {
    return this.topResource['launchTimeUtc'];
  }
  get resourceState(): string {
    return this.topResource['resourceState'];
  }
  tag(key: string): string | undefined {
    let tags;
    if(this.resource.TagList !== undefined) {
      tags = this.resource.TagList
    }
    else if (this.resource.Tags !== undefined) {
      tags = this.resource.Tags
    } else {
      return undefined
    }
    const tag = tags.find((xt: Tag) => xt.Key === key);
    if (tag !== undefined) {
      return tag.Value;
    }
    return undefined
  }
}

export default class LocalDriver extends DriverInterface {
  async collect(): Promise<ToolingInterface[]> {
    const resourcesFilePath = path.resolve(this.driverConfig.resourcesFile);
    const localResourcesStr = await fs.readFile(resourcesFilePath, { encoding: 'utf-8'});
    const mapResources = JSON.parse(localResourcesStr);

    const localResources: InstrumentedLocal[] = [];
    for (const res of mapResources) {
      localResources.push(new InstrumentedLocal(res));
    }

    return localResources;
  }
  async stop(resources: InstrumentedLocal[]) {
    for(const res of resources) {
      this.logger.debug(`"Stopped" ${res.awsResourceType} ${res.resourceId}`);
    }
    return null;
  }
  async start(resources: InstrumentedLocal[]) {
    for(const res of resources) {
      this.logger.debug(`"Started" ${res.awsResourceType} ${res.resourceId}`);
    }
    return null;
  }

  async setTag(resources: InstrumentedLocal[], action: RevolverActionWithTags) {
    for(const res of resources) {
      this.logger.debug(`"Set Tags" on ${res.awsResourceType} ${res.resourceId} -> ${action.tags.map((tag) => `${tag.Key}:${tag.Value}`).join(', ')}`)
    }
    return null;
  }
}
