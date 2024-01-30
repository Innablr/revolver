import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';
import { search  } from 'jmespath';

export default class FilterResource implements Filter, FilterCtor {
  private resourcePath: any;
  private resourceValue: any;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.resourcePath = config["path"];
      this.resourceValue = config["value"];
      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    return search(resource.resource, this.resourcePath) === this.resourceValue;
  }
}
