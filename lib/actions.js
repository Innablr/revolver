class RevolverAction {
    constructor(who, what) {
        this.who = who;
        this.what = what;
        this.done = false;
    }

    like(other) {
        return this.what === other.what;
    }

    get present() {
        return this.what;
    }
}

class NoopAction extends RevolverAction {
    constructor(who, reason) {
        super(who, 'noop');
        this.reason = reason;
    }

    like(other) {
        return this.what === other.what && this.reason === other.reason;
    }

    get present() {
        return `noop because ${this.reason}`;
    }
}

class SetTagAction extends RevolverAction {
    constructor(who, tag, value) {
        super(who, 'setTag');
        this.tags = [
            {
                Key: tag,
                Value: value
            }
        ];
    }

    like(other) {
        return this.what === other.what &&
            other.tags.every(xt => this.tags.some(xxt => xxt.Key === xt.Key)) &&
            this.tags.every(xt => other.tags.some(xxt => xxt.Key === xt.Key));
    }

    swallow(other) {
        this.tags = this.tags
        .concat(other.tags
            .filter(xt => this.tags.every(xxt => xxt.Key !== xt.Key)));
        return true;
    }

    get present() {
        return `set tags ${JSON.stringify(this.tags)}`;
    }
}

class UnsetTagAction extends RevolverAction {
    constructor(who, tag) {
        super(who, 'unsetTag');
        this.tags = [
            {
                Key: tag
            }
        ];
    }

    like(other) {
        return this.what === other.what &&
            other.tags.every(xt => this.tags.some(xxt => xxt.Key === xt.Key)) &&
            this.tags.every(xt => other.tags.some(xxt => xxt.Key === xt.Key));
    }

    swallow(other) {
        this.tags = this.tags
        .concat(other.tags
            .filter(xt => this.tags.every(xxt => xxt.Key !== xt.Key)));
        return true;
    }

    get present() {
        return `unset tag ${JSON.stringify(this.tags)}`;
    }
}

class StopAction extends RevolverAction {
    constructor(who) {
        super(who, 'stop');
        this.changesState = true;
    }
}

class StartAction extends RevolverAction {
    constructor(who) {
        super(who, 'start');
        this.changesState = true;
    }
}

class RestoreRdsSg extends RevolverAction {
    constructor(who) {
        super(who, 'restoreRdsSg');
    }
}

module.exports = {
    NoopAction,
    SetTagAction,
    UnsetTagAction,
    StartAction,
    StopAction,
    RestoreRdsSg
};
