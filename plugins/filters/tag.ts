import { ToolingInterface } from '../../drivers/instrumentedResource';
import { Filter } from './index';

export default class FilterTag implements Filter {
  private tagName: string;
  private tagValue: string;
  private readonly isReady: Promise<Filter>;

  ready(): Promise<Filter> {
    return this.isReady;
  }

  constructor(config: any) {
    this.isReady = new Promise((resolve) => {
      this.tagName = config["name"];
      this.tagValue = config["value"];
      resolve(this);
    });
  }

  matches(resource: ToolingInterface): boolean {
    return resource.tag(this.tagName) === this.tagValue;
  }
}
