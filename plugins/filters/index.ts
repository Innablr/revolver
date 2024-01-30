import { ToolingInterface } from '../../drivers/instrumentedResource';

export interface Filter {
  /**
   * Return true if a resource matches this filter
   * @param resource
   */
  matches(resource: ToolingInterface): boolean;
}

export interface FilterCtor {
  /**
   * Since the filters are loaded dynamically, an extra method is needed to track the
   * asynchronous status of the constructor.
   */
  ready(): Promise<Filter>;
}

