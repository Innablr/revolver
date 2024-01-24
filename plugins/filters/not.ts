import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter, initializeFilter } from './index';

export default class FilterNot implements Filter {
  private element: Filter;

  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      initializeFilter(config).then((filter) => {
        this.element = filter;
        resolve(this);
      });
    });
  }
  matches(resource: ToolingInterface): boolean {
    return !this.element.matches(resource);
  }
}
