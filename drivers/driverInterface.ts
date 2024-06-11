import { Logger } from 'tslog';
import { logger, RevolverLogObject } from '../lib/logger';
import { InstrumentedResource, ToolingInterface } from './instrumentedResource';
import { RevolverAction } from '../actions/actions';
import { ActionAuditEntry } from '../actions/audit';
import dateTime from '../lib/dateTime';

export abstract class DriverInterface {
  protected accountConfig: any;
  protected driverConfig: any;
  protected accountId: string;
  protected logger: Logger<RevolverLogObject>;

  protected actionAuditLog: ActionAuditEntry[];

  constructor(accountConfig: any, driverConfig: any) {
    this.accountConfig = accountConfig.settings;
    this.driverConfig = driverConfig;
    this.accountId = accountConfig.accountId;
    this.logger = logger.getSubLogger(
      { name: `${this.accountConfig.name}(${this.accountId})` },
      { accountId: this.accountId, accountName: this.accountConfig.name, driverName: this.name },
    );
    this.logger.debug(`Initialising driver ${this.name} for account ${this.accountConfig.name}`);
    this.actionAuditLog = [];
  }

  get name() {
    return this.driverConfig.name;
  }

  recogniseResource(r: ToolingInterface) {
    return r.resourceType === this.name;
  }

  pretendAction(resources: ToolingInterface[], action: RevolverAction) {
    this.logger.info(
      `Pretending that ${this.name} resources ${DriverInterface.toLimitedString(resources)} will ${action.present}`,
    );
  }

  initialise() {
    this.logger.info(`Driver ${this.name} is initialising...`);
    return Promise.resolve(this);
  }

  getAuditLog(): ActionAuditEntry[] {
    return this.actionAuditLog;
  }

  private appendAuditLog(xa: RevolverAction, allWithAction: ToolingInterface[], status: string): void {
    for (const ti of allWithAction) {
      let plugin: string = xa.who.name;
      let action: string = xa.what;
      let reason: string = xa.reason;

      // Find the specfic action for this resource as the plugin and reason may differ from xa
      const ownAction = ti.actions.find((a) => xa.like(a) && a.done);
      if (ownAction !== undefined) {
        plugin = ownAction.who.name;
        action = ownAction.what;
        reason = ownAction.reason;
      }

      this.actionAuditLog.push({
        accountId: ti.accountId || '',
        time: dateTime.getTime(),
        plugin: plugin,
        driver: this.name,
        resourceType: ti.awsResourceType || '',
        resourceId: ti.resourceId,
        action: action,
        reason: reason,
        status: status,
        metadata: ti.metadata,
      });
    }
  }

  // Print items in a list up to a limit to not spam the console
  protected static toLimitedString(resources: InstrumentedResource[]): string {
    const limit = 6;
    return `[${resources
      .slice(0, limit + 1)
      .map((xxr, i) => (i !== limit ? xxr.resourceId : '...'))
      .join(', ')}](${resources.length})`;
  }

  processActions(resources: ToolingInterface[]): Promise<any> {
    const logger = this.logger;
    logger.info(`Driver ${this.name} is processing actions...`);
    return Promise.all(
      resources.reduce((o: RevolverAction[], xr: ToolingInterface) => {
        const a = xr.actions.map((xa: RevolverAction) => {
          const allWithAction = resources.filter((xxr: ToolingInterface) => {
            const matchingAction = xxr.actions.find((xxa) => {
              return xxa.like(xa) && !xxa.done;
            });

            if (matchingAction === undefined) {
              return false;
            }

            if (typeof (this as any)[`mask${matchingAction.what}`] === 'function') {
              const reason = (this as any)[`mask${matchingAction.what}`](xxr, matchingAction);
              if (reason !== undefined) {
                logger.debug(
                  `Resource ${xxr.resourceId} also has action ${matchingAction.present}, but it is masked because ${reason}`,
                );
                matchingAction.done = true;
                return false;
              }
            }
            logger.debug(`Resource ${xxr.resourceId} also has action ${matchingAction.present}`);
            matchingAction.done = true;
            return true;
          });

          if (!(allWithAction.length > 0)) {
            return null;
          }

          logger.info(
            `${xa.who.name} will execute ${xa.present} on ${xr.resourceType} ${DriverInterface.toLimitedString(allWithAction)}`,
          );

          // push the list of actions actually run into the resource
          allWithAction.forEach((xxr) => {
            (xxr.metadata.actionNames ??= []).push(xa.constructor.name);
          });

          if (this.driverConfig.pretend !== false || xa.pretend) {
            this.appendAuditLog(xa, allWithAction, 'pretend');
            return this.pretendAction(allWithAction, xa);
          }

          if ((this as any)[xa.what] === undefined) {
            logger.error(`Driver ${this.name} doesn't implement action ${xa.what}`);
          }

          return (this as any)
            [xa.what](allWithAction, xa)
            .then(() => {
              this.appendAuditLog(xa, allWithAction, 'success');
            })
            .catch((err: Error) => {
              // Remove encoded auth failure message if present as it's verbose and not useful.
              let msg = err.message;
              if (err.name === 'UnauthorizedOperation') {
                const i = err.message.indexOf('Encoded authorization failure message');
                msg = err.message.substring(0, i > 0 ? i : err.message.length);
              }

              this.appendAuditLog(xa, allWithAction, msg);
              logger.error(
                `Error in driver ${this.name} processing action [${xa.present}] on resources ${DriverInterface.toLimitedString(allWithAction)}: ${msg}`,
              );
            });
        });
        return o.concat(a.filter((xa) => xa));
      }, []),
    );
  }

  abstract collect(): Promise<ToolingInterface[]>;

  /**
   * Filter the list of resources to only those of the correct type and account.
   * This is used only when loading a local set of resources rather than collecting real resources from AWS,
   * for testing purposes only.
   * @param resources - a list of resources of various types and accounts
   * @returns a list of concrete objects from this driver
   */
  collectLocal(resources: InstrumentedResource[]): ToolingInterface[] {
    return resources
      .filter((res: InstrumentedResource) => res.resourceType === this.name)
      .map((res: InstrumentedResource) => this.resource(res))
      .filter((r) => r.accountId === this.accountId);
  }

  abstract resource(obj: InstrumentedResource): ToolingInterface;
}
