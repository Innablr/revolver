import type { Logger } from 'tslog';
import type { ToolingInterface } from '../drivers/instrumentedResource.js';
import { getSubLogger } from '../lib/logger.js';

/**
 * Abstract class representing a Plugin for Revolver, which selects resources, and generates Actions, based on
 * plugin-specific logic.
 */
export abstract class RevolverPlugin {
  protected accountConfig: any;
  protected accountId: string;
  protected pluginConfig: any;
  protected logger: Logger<any>;
  protected supportedResources: string[];

  constructor(accountConfig: any, pluginName: string, pluginConfig: any) {
    this.accountConfig = accountConfig.settings;
    this.accountId = accountConfig.accountId;
    this.pluginConfig = pluginConfig;
    this.pluginConfig.name = pluginName;
    this.logger = getSubLogger(this.accountConfig.name, this.accountId, { pluginName: pluginName });
    this.logger.debug(`Initialising plugin ${this.name} for account ${this.accountConfig.name}`);
  }

  get name(): string {
    return this.pluginConfig.name;
  }

  async initialise(): Promise<RevolverPlugin> {
    this.logger.info(`Plugin ${this.name} is initialising...`);
    return Promise.resolve(this);
  }

  /**
   * Check whether the given resource is supported by this Plugin
   * @param resource - a resource to be checked
   * @returns True if this plugin is capable of handling the given resource
   */
  isApplicable(resource: ToolingInterface) {
    return this.supportedResources.find((xs) => xs === resource.resourceType) !== undefined;
  }

  abstract generateActions(resource: ToolingInterface): Promise<any>;
}
