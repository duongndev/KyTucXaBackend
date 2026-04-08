/**
 * Standardized response function
 */
export const standardResponse = (res, status, { success, message, data = null, pagination = null }) => {
  const response = { success, message };
  if (data !== null) response.data = data;
  if (pagination) response.pagination = pagination;
  return res.status(status).json(response);
};

/**
 * Success response helper
 * Supports: 
 * - successResponse(res, "Message", data)
 * - successResponse(res, data)
 */
export const successResponse = (res, messageOrData = 'Success', data = null, statusCode = 200, pagination = null) => {
  let message = 'Success';
  let actualData = data;

  if (typeof messageOrData === 'string') {
    message = messageOrData;
  } else {
    actualData = messageOrData;
    message = 'Success';
  }

  return standardResponse(res, statusCode, {
    success: true,
    message,
    data: actualData,
    pagination
  });
};

/**
 * Error response helper
 */
export const errorResponse = (res, message, error = null) => {
  // Ensure message is a string and not too long for status code
  const errorMessage = typeof message === 'string' ? message.substring(0, 100) : 'Internal server error';
  
  return res.status(500).json({
    success: false,
    message: errorMessage,
    error: error ? {
      code: error.code || 'INTERNAL_ERROR',
      status: 'error'
    } : null
  });
};

/**
 * Created response helper (201)
 */
export const createdResponse = (res, messageOrData = 'Created', data = null) => {
  return successResponse(res, messageOrData, data, 201);
};

/**
 * No content response helper (204)
 */
export const noContentResponse = (res) => {
  return res.status(204).end();
};

/**
 * Bad request response helper (400)
 */
export const badRequestResponse = (res, message = 'Bad Request', data = null) => {
  return res.status(400).json({
    success: false,
    message,
    data
  });
};

/**
 * Unauthorized response helper (401)
 */
export const unauthorizedResponse = (res, message = 'Unauthorized') => {
  return res.status(401).json({
    success: false,
    message
  });
};

/**
 * Forbidden response helper (403)
 */
export const forbiddenResponse = (res, message = 'Forbidden') => {
  return res.status(403).json({
    success: false,
    message
  });
};

/**
 * Not found response helper (404)
 */
export const notFoundResponse = (res, message = 'Not Found') => {
  return res.status(404).json({
    success: false,
    message
  });
};

/**
 * Conflict response helper (409)
 */
export const conflictResponse = (res, message = 'Conflict') => {
  return res.status(409).json({
    success: false,
    message
  });
};

/**
 * Validation error response helper (422)
 */
export const validationErrorResponse = (res, errors, message = 'Validation Error') => {
  return res.status(422).json({
    success: false,
    message,
    data: { errors }
  });
};

/**
 * Internal server error response helper (500)
 */
export const internalServerErrorResponse = (res, message = 'Internal Server Error') => {
  return errorResponse(res, message);
};

/**
 * Legacy sendResponse function for backward compatibility
 * @deprecated Use standardResponse instead
 */
export const sendResponse = (statusCode, response, res) => {
  console.warn('[DEPRECATED] sendResponse is deprecated. Use standardResponse instead.');
  
  const isSuccess = statusCode >= 200 && statusCode < 300;
  
  return standardResponse(res, statusCode, {
    success: isSuccess,
    message: response.message || (isSuccess ? 'Success' : 'Error'),
    data: response.data || response
  });
};
