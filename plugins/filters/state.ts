import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterState implements Filter, FilterCtor {
  private state: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.state = config;
      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    return resource.resourceState === this.state;
  }
}
