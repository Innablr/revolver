import { DriverInterface } from '../drivers/driverInterface';
import { InstrumentedResource, ToolingInterface } from '../drivers/instrumentedResource';
import { RevolverPlugin } from '../plugins/pluginInterface';
import { logger } from './logger';
import path from 'node:path';
import { promises as fs } from 'fs';
import { buildFilter } from '../plugins/filters/index';
import { ActionAuditTable, ObjectLogTable, ObjectLogCsv, ObjectLogJson, ObjectLogTemplate, ResourceTable } from './objectLog';

export class AccountRevolver {
  readonly supportedDrivers = [
    'ec2',
    'ebs',
    'snapshot',
    'rdsInstance',
    'rdsCluster',
    'redshiftCluster',
    'redshiftClusterSnapshot',
  ];
  readonly supportedPlugins = ['powercycle', 'powercycleCentral', 'validateTags', 'restoreRdsSg'];

  readonly config;
  readonly logger;

  private plugins: RevolverPlugin[];
  private drivers: DriverInterface[];
  private resources: ToolingInterface[];

  constructor(accountConfig: any) {
    this.config = accountConfig;
    this.logger = logger.getSubLogger(
      { name: 'accountRevolver' },
      { accountId: this.config.accountId, accountName: this.config.settings.name },
    );
  }

  async initialise(): Promise<void> {
    this.logger.info(`Initialising revolver for account ${this.config.settings.name}(${this.config.accountId})`);

    const activePlugins = Object.keys(this.config.plugins)
      .filter((xp) => this.supportedPlugins.indexOf(xp) > -1)
      .filter((xs) => this.config.plugins[xs].active);

    this.logger.info('Configuring plugins');
    this.plugins = await Promise.all(
      activePlugins.flatMap((xs: string) => {
        this.logger.info(`Configuring plugin ${xs}...`);
        return this.config.plugins[xs].configs.map(async (xp: any) => {
          const PluginModule = await require(`../plugins/${xs}`);
          return new PluginModule['default'](this.config, xs, xp);
        });
      }),
    );

    this.logger.info('Configuring drivers');
    this.drivers = await Promise.all(
      this.config.drivers
        .filter((xd: any) => this.supportedDrivers.indexOf(xd.name) > -1)
        .map(async (xd: any) => {
          this.logger.info(`Configuring driver ${xd.name}...`);
          const DriverModule = await require(`../drivers/${xd.name}`);
          return new DriverModule.default(this.config, xd);
        }),
    );

    this.logger.info('Initialising plugins and drivers');
    await Promise.all([
      Promise.all(this.plugins.map((plugin: any) => plugin.initialise())),
      Promise.all(this.drivers.map((driver: any) => driver.initialise())),
    ]);
  }

  async loadResources(): Promise<void> {
    const local = this.config.settings.localResourcesFile;
    let localResources: InstrumentedResource[];
    if (local !== undefined) {
      this.logger.info(`Loading resources locally from ${local}`);
      const resourcesFilePath = path.resolve(local);
      const localResourcesStr = await fs.readFile(resourcesFilePath, { encoding: 'utf-8' });
      localResources = JSON.parse(localResourcesStr);
    }

    this.logger.info('Loading resources');
    this.resources = (
      await Promise.all(
        this.drivers.map((xd) => {
          if (local !== undefined) {
            return localResources
              .filter((res: InstrumentedResource) => res.resourceType === xd.name)
              .map((res: InstrumentedResource) => xd.resource(res));
          } else {
            return xd.collect();
          }
        }),
      )
    ).flatMap((xr) => xr);

    if (this.config.settings.excludeResources) {
      const excludeFilter = await buildFilter(this.config.settings.excludeResources);

      const excludedIndices = this.resources.map((resource) => excludeFilter.matches(resource));
      this.resources = this.resources.filter((_resource, index) => {
        return !excludedIndices[index];
      });

      if (excludedIndices.length - this.resources.length > 0) {
        this.logger.info(`Excluding ${excludedIndices.length - this.resources.length} resources from processing`);
      }
    }
  }

  async runPlugins(): Promise<void> {
    this.logger.info('Plugins will process resources');
    await Promise.all(
      this.plugins.map((xp) =>
        Promise.all(this.resources.filter((xr) => xp.isApplicable(xr)).map((xr) => xp.generateActions(xr))),
      ),
    );
  }

  async runActions(): Promise<void> {
    this.logger.info('Drivers will run actions');
    await Promise.all(
      this.drivers.map((xd) => xd.processActions(this.resources.filter((xr) => xd.recogniseResource(xr)))),
    );
  }

  async logAudit(): Promise<void> {
    this.logger.info('Processing action audit log');
    const entries = this.drivers.map((d) => d.getAuditLog()).reduce((a, l) => a.concat(l), []);

    for (const auditFormat of Object.keys(this.config.settings.auditLog)) {
      try {
        const auditConfig = this.config.settings.auditLog[auditFormat];
        switch (auditFormat.toLowerCase()) {
          case 'json':
            await new ObjectLogJson(entries, auditConfig).process();
            break;
          case 'csv':
            await new ObjectLogCsv(new ActionAuditTable(this.config, entries, true), auditConfig).process();
            break;
          case 'console':
            await new ObjectLogTable(
              new ActionAuditTable(this.config, entries, false),
              { console: null },
              'Audit Log',
            ).process();
            break;
          default:
            logger.warn(`no implementation for audit log format ${auditFormat}`);
        }
      } catch (e: any) {
        logger.error(`failed to write auditLog ${auditFormat}: ${e.message}`);
      }
    }
  }

  async logResources(): Promise<void> {
    for (const logFormat of Object.keys(this.config.settings.resourceLog)) {
      try {
        const resourceLogConfig = this.config.settings.resourceLog[logFormat];
        switch (logFormat.toLowerCase()) {
          case 'json':
            await new ObjectLogJson(this.resources, resourceLogConfig).process();
            break;
          case 'template':
            await new ObjectLogTemplate(this.resources, resourceLogConfig).process();
            break;
          case 'console':
            await new ObjectLogTable(
              new ResourceTable(this.config, this.resources, resourceLogConfig?.reportTags),
              { console: null },
              'Resource Log',
            ).process();
            break;
          case 'csv':
            await new ObjectLogCsv(
              new ResourceTable(this.config, this.resources, resourceLogConfig?.reportTags),
              resourceLogConfig,
            ).process();
            break;
          default:
            logger.warn(`no implementation for resource log format ${logFormat}`);
        }
      } catch (e: any) {
        logger.error(`failed to write resourcesLog ${logFormat}: ${e.message}`);
      }
    }
  }

  async revolve(): Promise<void> {
    try {
      await this.loadResources();
      await this.runPlugins();
      await this.runActions();
      if (this.config.settings.resourceLog) {
        await this.logResources();
      }
      if (this.config.settings.auditLog) {
        await this.logAudit();
      }
    } catch (err) {
      this.logger.error(`Error processing account ${this.config.settings.name}, stack trace will follow:`);
      this.logger.error(err);
    }
  }
}
