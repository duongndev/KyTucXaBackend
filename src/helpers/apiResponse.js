import { HTTP_STATUS, HTTP_MESSAGES } from '../constants/index.js';

/**
 * Standard API Response Helper
 */
class ApiResponse {
  /**
   * Success response
   */
  static success(res, data = null, message = 'Thành công', statusCode = HTTP_STATUS.OK) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Created response
   */
  static created(res, data = null, message = 'Tạo mới thành công') {
    return this.success(res, data, message, HTTP_STATUS.CREATED);
  }

  /**
   * Error response
   */
  static error(res, message = 'Có lỗi xảy ra', statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null) {
    const response = {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errors) {
      response.errors = errors;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Bad request response
   */
  static badRequest(res, message = 'Yêu cầu không hợp lệ', errors = null) {
    return this.error(res, message, HTTP_STATUS.BAD_REQUEST, errors);
  }

  /**
   * Not found response
   */
  static notFound(res, message = 'Không tìm thấy') {
    return this.error(res, message, HTTP_STATUS.NOT_FOUND);
  }

  /**
   * Unauthorized response
   */
  static unauthorized(res, message = 'Không được phép truy cập') {
    return this.error(res, message, HTTP_STATUS.UNAUTHORIZED);
  }

  /**
   * Forbidden response
   */
  static forbidden(res, message = 'Bị từ chối truy cập') {
    return this.error(res, message, HTTP_STATUS.FORBIDDEN);
  }

  /**
   * Pagination response
   */
  static paginate(res, data, pagination) {
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
      },
      timestamp: new Date().toISOString(),
    });
  }
}

export default ApiResponse;
