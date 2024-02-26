import { logger } from '../lib/logger';
import { DateTime } from 'luxon';
import { RevolverAction } from '../actions/actions';

export interface InstrumentedResource {
  resourceId: string;
  resourceType: string;
  resourceArn: string;
  launchTimeUtc: DateTime;
  resourceState: string;
  resource: any;
  metadata: any;
}

export abstract class ToolingInterface implements InstrumentedResource {
  public resource: any;
  public actions: RevolverAction[];
  private meta: any;

  constructor(awsResource: any) {
    this.resource = awsResource;
    this.actions = [];
    this.meta = {};
  }

  addAction(action: RevolverAction) {
    // If we are already doing this action, don't add it again
    if (this.actions.some((xa) => xa.like(action))) {
      logger.warn(
        `Not adding action ${action.what} on ${this.resourceType} ${this.resourceId} as there is already an action doing exactly that`,
      );
      return;
    }
    // If we are doing an action that changes state, don't add any more actions that also change state
    if (action.changesState && this.actions.some((xa) => xa.changesState)) {
      logger.warn(
        `Not adding action ${action.what} on ${this.resourceType} ${this.resourceId} as there is already actions changing resource state.`,
      );
      return;
    }
    // Try and see if we already have an action that can swallow this one
    for (const xa of this.actions.filter((xxa) => xxa.what === action.what)) {
      if (xa.swallow(action) === true) {
        return;
      }
    }
    this.actions.push(action);
  }

  toJSON(): InstrumentedResource {
    return {
      resourceId: this.resourceId,
      resourceType: this.resourceType,
      resourceArn: this.resourceArn,
      launchTimeUtc: this.launchTimeUtc,
      resourceState: this.resourceState,
      resource: this.resource,
      metadata: this.metadata,
    };
  }

  // Hide set metadata() so plugins can't delete data set by other plugins.
  get metadata(): any {
    return this.meta;
  }

  get region() {
    if (this.resourceArn === undefined) return undefined;
    const s = this.resourceArn.split(':');
    if (s.length < 6) return undefined;
    return s[3];
  }
  get accountId() {
    if (this.resourceArn === undefined) return undefined;
    const s = this.resourceArn.split(':');
    if (s.length < 6) return undefined;
    return s[4];
  }
  get awsResourceType() {
    if (this.resourceArn === undefined) return undefined;
    const s = this.resourceArn.split(':');
    if (s.length < 6) return undefined;
    return s[2];
  }

  abstract get resourceId(): string;

  abstract get resourceType(): string;

  abstract get resourceArn(): string;

  abstract get launchTimeUtc(): DateTime;

  abstract get resourceState(): string;

  abstract tag(key: string): string | undefined;
}
