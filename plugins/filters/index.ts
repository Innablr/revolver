import { ToolingInterface } from '../../drivers/instrumentedResource';
import path from 'path';

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

/**
 * Converts a loaded YAML filter config to actual filter objects
 * @param config yaml configuration for a filter. must be a map with a single key matching a filter name
 */
export async function initializeFilter(config: any): Promise<Filter> {
  // TODO error handling
  const name = Object.keys(config)[0];
  const i = await import(path.join(__dirname, name));
  return new i.default(config[name]).ready();
}
