import { RevolverPlugin } from '../plugins/pluginInterface';
import { TagInterface } from '../drivers/tags';

export abstract class RevolverAction {
  public who: RevolverPlugin;
  public what: string;
  public reason: string;
  public done: boolean = false;
  public changesState: boolean = false;

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  swallow(other: RevolverAction) {
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

  constructor(who: RevolverPlugin) {
    super(who, 'stop');
    this.changesState = true;
  }
}

export class StartAction extends RevolverAction {
  public changesState: boolean;

  constructor(who: RevolverPlugin) {
    super(who, 'start');
    this.changesState = true;
  }
}

export class RestoreRdsSg extends RevolverAction {
  constructor(who: RevolverPlugin) {
    super(who, 'restoreRdsSg');
  }
}
