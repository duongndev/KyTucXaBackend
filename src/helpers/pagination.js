/**
 * Pagination Helper
 */
export class Pagination {
  constructor(page = 1, limit = 10, maxLimit = 100) {
    this.page = Math.max(1, parseInt(page, 10) || 1);
    this.limit = Math.min(Math.max(1, parseInt(limit, 10) || 10), maxLimit);
    this.skip = (this.page - 1) * this.limit;
  }

  getQueryOptions() {
    return {
      skip: this.skip,
      limit: this.limit,
    };
  }

  static fromQuery(query, defaultLimit = 10) {
    return new Pagination(query.page, query.limit || defaultLimit);
  }
}

/**
 * Build pagination metadata
 */
export const buildPaginationMeta = (page, limit, total) => ({
  page: parseInt(page, 10),
  limit: parseInt(limit, 10),
  total,
  totalPages: Math.ceil(total / parseInt(limit, 10)),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

/**
 * Parse sort parameter
 */
export const parseSort = (sortParam, allowedFields = []) => {
  if (!sortParam) return { createdAt: -1 };

  const sort = {};
  const fields = sortParam.split(',');

  fields.forEach((field) => {
    const direction = field.startsWith('-') ? -1 : 1;
    const fieldName = field.replace(/^-/, '');

    if (allowedFields.length === 0 || allowedFields.includes(fieldName)) {
      sort[fieldName] = direction;
    }
  });

  return sort;
};

/**
 * Parse filter from query
 */
export const parseFilter = (query, allowedFields = []) => {
  const filter = {};

  allowedFields.forEach((field) => {
    if (query[field] !== undefined) {
      filter[field] = query[field];
    }
  });

  return filter;
};
