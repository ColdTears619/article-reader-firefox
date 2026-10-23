import { describe, expect, it } from 'vitest';
import { hasCloudDataPermissions } from './cloud-permissions';

describe('cloud data permissions', () => {
  it('requires both website content and authentication information', () => {
    expect(hasCloudDataPermissions({
      data_collection: ['websiteContent', 'authenticationInfo']
    })).toBe(true);
  });

  it('rejects a partial or missing grant', () => {
    expect(hasCloudDataPermissions({ data_collection: ['websiteContent'] })).toBe(false);
    expect(hasCloudDataPermissions({})).toBe(false);
  });
});
