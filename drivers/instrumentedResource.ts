import { logger } from '../lib/logger';
import { DateTime } from 'luxon';
import { RevolverAction } from '../actions/actions';

export abstract class ToolingInterface {
  public resource: any;
  public actions: RevolverAction[];

  constructor(awsResource: any) {
    this.resource = awsResource;
    this.actions = [];
  }

  addAction(action: RevolverAction) {
    // If we are already doing this action, don't add it again
    if (this.actions.some((xa) => xa.like(action))) {
      logger.warn(
        'Not adding action %s on %s %s as there is already an action doing exactly that',
        action.what,
        this.resourceType,
        this.resourceId,
      );
      return;
    }
    // If we are doing an action that changes state, don't add any more actions that also change state
    if (action.changesState && this.actions.some((xa) => xa.changesState)) {
      logger.warn(
        'Not adding action %s on %s %s as there is already actions changing resource state.',
        action.what,
        this.resourceType,
        this.resourceId,
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

  abstract get resourceId(): string;

  abstract get resourceType(): string;

  abstract get resourceArn(): string;

  abstract get launchTimeUtc(): DateTime;

  abstract get resourceState(): string;

  abstract tag(key: string): string;
}
