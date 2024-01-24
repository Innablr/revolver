import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter } from './index';

export default class FilterType implements Filter {
  private type: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.type = config;
      resolve(this);
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.resourceType === this.type;
  }
}
