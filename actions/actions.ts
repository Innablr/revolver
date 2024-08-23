import { RevolverPlugin } from '../plugins/pluginInterface.js';
import { TagInterface } from '../drivers/tags.js';

export abstract class RevolverAction {
  public who: RevolverPlugin;
  public what: string;
  public reason: string;
  public done = false;
  public changesState = false;
  public pretend = false;

  constructor(who: RevolverPlugin, what: string) {
    this.who = who;
    this.what = what;
  }

  like(other: RevolverAction) {
    return this.what === other.what;
  }

  get present(): string {
    return this.what;
  }

  swallow(_other: RevolverAction) {
    return false;
  }
}

export abstract class RevolverActionWithTags extends RevolverAction {
  public tags: TagInterface[];

  get present() {
    return `${this.what} ${JSON.stringify(this.tags)}`;
  }
}

export class NoopAction extends RevolverAction {
  constructor(who: RevolverPlugin, reason: string) {
    super(who, 'noop');
    this.reason = reason;
  }

  like(other: NoopAction) {
    return this.what === other.what && this.reason === other.reason;
  }

  get present(): string {
    return `noop because ${this.reason}`;
  }
}

export class SetTagAction extends RevolverActionWithTags {
  public tags: TagInterface[];

  constructor(who: RevolverPlugin, tag: string, value: string) {
    super(who, 'setTag');
    this.reason = `${tag}:${value}`;
    this.tags = [
      {
        Key: tag,
        Value: value,
      },
    ];
  }

  like(other: SetTagAction) {
    return (
      this.what === other.what &&
      other.tags.every((xt) => this.tags.some((xxt) => xxt.Key === xt.Key)) &&
      this.tags.every((xt) => other.tags.some((xxt) => xxt.Key === xt.Key))
    );
  }

  swallow(other: SetTagAction) {
    this.tags = this.tags.concat(other.tags.filter((xt) => this.tags.every((xxt) => xxt.Key !== xt.Key)));
    return true;
  }

  get present(): string {
    return `set tags ${JSON.stringify(this.tags)}`;
  }
}

export class UnsetTagAction extends RevolverActionWithTags {
  public tags: TagInterface[];

  constructor(who: RevolverPlugin, tag: string) {
    super(who, 'unsetTag');
    this.reason = tag;
    this.tags = [
      {
        Key: tag,
        Value: '',
      },
    ];
  }

  like(other: UnsetTagAction) {
    return (
      this.what === other.what &&
      other.tags.every((xt) => this.tags.some((xxt) => xxt.Key === xt.Key)) &&
      this.tags.every((xt) => other.tags.some((xxt) => xxt.Key === xt.Key))
    );
  }

  swallow(other: UnsetTagAction) {
    this.tags = this.tags.concat(other.tags.filter((xt) => this.tags.every((xxt) => xxt.Key !== xt.Key)));
    return true;
  }

  get present() {
    return `unset tag ${JSON.stringify(this.tags)}`;
  }
}

export class StopAction extends RevolverAction {
  public changesState: boolean;

  constructor(who: RevolverPlugin, reason: string, pretend = false) {
    super(who, 'stop');
    this.changesState = true;
    this.reason = reason;
    this.pretend = pretend;
  }
}

export class StartAction extends RevolverAction {
  public changesState: boolean;

  constructor(who: RevolverPlugin, reason: string, pretend = false) {
    super(who, 'start');
    this.changesState = true;
    this.reason = reason;
    this.pretend = pretend;
  }
}

export class RestoreRdsSg extends RevolverAction {
  constructor(who: RevolverPlugin) {
    super(who, 'restoreRdsSg');
  }
}
