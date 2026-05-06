/**
 * User Roles
 */
export const ROLES = {
  ADMIN: 'admin',
  STAFF: 'staff',
  STUDENT: 'student',
  GUEST: 'guest',
};

/**
 * Role Permissions Mapping
 */
export const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: ['*'], // All permissions
  [ROLES.STAFF]: [
    'read:students',
    'write:students',
    'read:rooms',
    'write:rooms',
    'read:contracts',
    'write:contracts',
    'read:invoices',
    'write:invoices',
    'read:maintenance',
    'write:maintenance',
  ],
  [ROLES.STUDENT]: [
    'read:own_profile',
    'write:own_profile',
    'read:own_contract',
    'read:own_invoices',
    'read:own_maintenance',
    'write:own_maintenance',
  ],
  [ROLES.GUEST]: [
    'read:public',
  ],
};

/**
 * Check if role has permission
 */
export const hasPermission = (role, permission) => {
  if (role === ROLES.ADMIN) return true;
  const permissions = ROLE_PERMISSIONS[role] || [];
  return permissions.includes(permission) || permissions.includes('*');
};
