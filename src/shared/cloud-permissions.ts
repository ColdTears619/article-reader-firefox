export const CLOUD_DATA_TYPES = ['websiteContent', 'authenticationInfo'] as const;

export interface FirefoxDataPermissions {
  data_collection?: string[];
}

export function hasCloudDataPermissions(permissions: FirefoxDataPermissions): boolean {
  const granted = permissions.data_collection ?? [];
  return CLOUD_DATA_TYPES.every(dataType => granted.includes(dataType));
}
