import { Logger } from 'tslog';
import { logger, RevolverLogObject } from '../lib/logger';
import { InstrumentedResource, ToolingInterface } from "./instrumentedResource";
import { RevolverAction } from '../actions/actions';
import { ActionAuditEntry } from "../actions/audit";
import { DateTime } from "luxon";

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
      'Pretending that %s resources %j will %s',
      this.name,
      resources.map((xr) => xr.resourceId),
      action.present,
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
    for(const a of allWithAction) {
      const auditResType = a.awsResourceType !== undefined ? a.awsResourceType : '';
      let auditReason = xa.reason;
      if (auditReason === undefined) auditReason = '';
      this.actionAuditLog.push({
        time: DateTime.now(),
        plugin: xa.who.name,
        driver: this.name,
        resourceType: auditResType,
        resourceId: a.resourceId,
        action: xa.what,
        reason: auditReason,
        status: status,
      });
    }
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
                  'Resource %s also has action %s, but it is masked because %s',
                  xxr.resourceId,
                  matchingAction.present,
                  reason,
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
            '%s will execute %s on %s %j',
            xa.who.name,
            xa.present,
            xr.resourceType,
            allWithAction.map((xxr) => xxr.resourceId),
          );

          if (this.driverConfig.pretend !== false) {
            this.appendAuditLog(xa, allWithAction, 'pretend');
            return this.pretendAction(allWithAction, xa);
          }

          if ((this as any)[xa.what] === undefined) {
            logger.error(`Driver ${this.name} doesn't implement action ${xa.what}`);
          }

          return (this as any)[xa.what](allWithAction, xa)
            .then(() => {
              this.appendAuditLog(xa, allWithAction, 'success');
            })
            .catch((err: Error) => {
              this.appendAuditLog(xa, allWithAction, err.message);
              logger.error(
                'Error in driver %s processing action [%s] on resources %j, stack trace will follow:',
                this.name,
                xa.present,
                allWithAction.map((xxr) => xxr.resourceId),
              );
              logger.error(err);
            });
        });
        return o.concat(a.filter((xa) => xa));
      }, []),
    );
  }

  abstract collect(): Promise<ToolingInterface[]>;

  abstract resource(obj: InstrumentedResource): ToolingInterface;
}
