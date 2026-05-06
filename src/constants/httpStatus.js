/**
 * HTTP Status Codes
 */
export const HTTP_STATUS = {
  // 2xx Success
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,

  // 3xx Redirection
  MOVED_PERMANENTLY: 301,
  FOUND: 302,
  NOT_MODIFIED: 304,

  // 4xx Client Errors
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,

  // 5xx Server Errors
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

/**
 * HTTP Status Messages (Vietnamese)
 */
export const HTTP_MESSAGES = {
  [HTTP_STATUS.OK]: 'Thành công',
  [HTTP_STATUS.CREATED]: 'Tạo mới thành công',
  [HTTP_STATUS.BAD_REQUEST]: 'Yêu cầu không hợp lệ',
  [HTTP_STATUS.UNAUTHORIZED]: 'Không được phép truy cập',
  [HTTP_STATUS.FORBIDDEN]: 'Bị từ chối truy cập',
  [HTTP_STATUS.NOT_FOUND]: 'Không tìm thấy',
  [HTTP_STATUS.CONFLICT]: 'Xung đột dữ liệu',
  [HTTP_STATUS.UNPROCESSABLE_ENTITY]: 'Dữ liệu không hợp lệ',
  [HTTP_STATUS.TOO_MANY_REQUESTS]: 'Quá nhiều yêu cầu',
  [HTTP_STATUS.INTERNAL_SERVER_ERROR]: 'Lỗi máy chủ nội bộ',
};
