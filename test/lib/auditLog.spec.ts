import { expect } from 'chai';
import { ActionAuditTable, ObjectLogCsv } from '../../lib/objectLog';
import { ActionAuditEntry } from '../../actions/audit';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import * as fs from 'fs';
import { logger } from '../../lib/logger';

// A dummy AWS resource for testing
class FakeActionAuditEntry implements ActionAuditEntry {
  time: DateTime<boolean>;
  accountId: string;
  plugin: string;
  driver: string;
  resourceType: string;
  resourceId: string;
  status: string;
  action: string;
  reason: string;
  constructor(status: string, action: string, reason: string) {
    this.time = DateTime.fromISO('2024-02-27T09:12:33.018+11:00');
    this.accountId = randomBytes(20).toString('hex');
    this.plugin = 'fakeplugin';
    this.driver = 'fakedriver';
    this.resourceType = 'type_' + randomBytes(20).toString('hex');
    this.resourceId = 'id_' + randomBytes(20).toString('hex');
    this.status = status;
    this.action = action;
    this.reason = reason;
  }
}

const AUDIT_LOG_CONFIG = {
  // cost mostly already tested by RESOURCE_LOG_CONFIG
  csv: {
    file: 'auditlog-out.csv',
    reportTags: ['F1', 'F2'],
  },
};

const ACCOUNT_CONFIG = {
  settings: {
    name: 'dummyaccount',
  },
};

describe('Validate auditLog', function () {
  it('Check ObjectLogCsv audit', async function () {
    const entries = [
      new FakeActionAuditEntry('red', 'dosomething', 'just because'),
      new FakeActionAuditEntry('green', 'dosomething', 'another reason'),
      new FakeActionAuditEntry('blue', 'dosomething else', 'random'),
    ];
    await new ObjectLogCsv(new ActionAuditTable(ACCOUNT_CONFIG, entries, true), AUDIT_LOG_CONFIG.csv, false).process();

    expect(fs.existsSync(AUDIT_LOG_CONFIG.csv.file)).to.be.true;

    const auditCsvText = fs.readFileSync(AUDIT_LOG_CONFIG.csv.file, 'utf-8');
    logger.info(`FULL CSV: >>>${auditCsvText}<<<`);
    expect((auditCsvText.match(/2024-02-27/g) || []).length).to.equal(3); // number of rows (not including header)
    expect(auditCsvText).to.include('dosomething,red,just because');
    expect(auditCsvText).to.include('dosomething,green,another reason');
    expect(auditCsvText).to.include('dosomething else,blue,random');
  });
});
