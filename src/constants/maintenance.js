/**
 * Maintenance Request Status
 */
export const MAINTENANCE_STATUS = {
  PENDING: 'pending',
  ASSIGNED: 'assigned',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
};

/**
 * Maintenance Priority Levels
 */
export const MAINTENANCE_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent',
};

/**
 * Maintenance Categories
 */
export const MAINTENANCE_CATEGORIES = {
  ELECTRICAL: 'electrical',
  PLUMBING: 'plumbing',
  FURNITURE: 'furniture',
  HVAC: 'hvac',
  APPLIANCE: 'appliance',
  STRUCTURAL: 'structural',
  CLEANING: 'cleaning',
  OTHER: 'other',
};

/**
 * Status Transitions (allowed next statuses)
 */
export const STATUS_TRANSITIONS = {
  [MAINTENANCE_STATUS.PENDING]: [MAINTENANCE_STATUS.ASSIGNED, MAINTENANCE_STATUS.REJECTED, MAINTENANCE_STATUS.CANCELLED],
  [MAINTENANCE_STATUS.ASSIGNED]: [MAINTENANCE_STATUS.IN_PROGRESS, MAINTENANCE_STATUS.CANCELLED],
  [MAINTENANCE_STATUS.IN_PROGRESS]: [MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELLED],
  [MAINTENANCE_STATUS.COMPLETED]: [],
  [MAINTENANCE_STATUS.CANCELLED]: [],
  [MAINTENANCE_STATUS.REJECTED]: [],
};

/**
 * Check if status transition is valid
 */
export const isValidTransition = (currentStatus, newStatus) => {
  const allowed = STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(newStatus);
};
