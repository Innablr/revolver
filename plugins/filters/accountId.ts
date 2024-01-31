import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, FilterCtor } from './index';

export default class FilterAccountNumber implements Filter, FilterCtor {
  private accountId: string;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.accountId = config;
      resolve(this);
    });
  }
  matches(resource: ToolingInterface): boolean {
    return resource.accountId === this.accountId;
  }
}
