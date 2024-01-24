import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterId implements Filter, FilterCtor {
  private id: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.id = config;
      resolve(this);
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.resourceId === this.id;
  }

  async initialize(config: any): Promise<Filter> {
    return new FilterId(config);
  }
}
