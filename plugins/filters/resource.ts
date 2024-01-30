import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';
import { search } from 'jmespath';

export default class FilterResource implements Filter, FilterCtor {
  private resourcePath: string;
  private resourceValue: string;
  private resourceRegexp: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.resourcePath = config["path"];
      this.resourceValue = config["value"];
      this.resourceRegexp = config["regexp"];
      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    const searchValue = search(resource.resource, this.resourcePath);
    if (this.resourceValue !== undefined) {
      return searchValue === this.resourceValue;
    }

    if (this.resourceRegexp !== undefined) {
      const re = new RegExp(this.resourceRegexp);
      const match = re.exec(searchValue);
      return match !== null;
    }
    return false;
  }
}
