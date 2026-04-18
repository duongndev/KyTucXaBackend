import { verifyAccessToken, verifyRefreshToken } from "../utils/utility.function.js";
import User from "../models/user/user.model.js";
import { errorResponse } from "../utils/response.js";
// Blacklist để lưu token bị thu hồi (trong production nên dùng Redis)
const tokenBlacklist = new Set();

const protect = async (req, res, next) => {
  let token;
  
  // Kiểm tra header Authorization có chứa token không
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer ")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      
      // Kiểm tra token có trong blacklist không
      if (tokenBlacklist.has(token)) {
        return errorResponse(res, "Token đã bị thu hồi", 401);
      }
      
      const decoded = await verifyAccessToken(token);
      const user = await User.findById(decoded.id).select("-password -refreshToken");
      
      if (!user) {
        return errorResponse(res, "Người dùng không tồn tại", 401);
      }
      
      // Kiểm tra sessionId có khớp với session hiện tại không (đảm bảo đăng nhập 1 thiết bị)
      if (decoded.sessionId && user.currentSessionId && decoded.sessionId !== user.currentSessionId) {
        return errorResponse(res, "Phiên đăng nhập không hợp lệ. Tài khoản đã được đăng nhập trên thiết bị khác.", 401);
      }
      
      // Kiểm tra user có bị khóa không (không áp dụng cho admin)
      const isTemporarilyLocked = !!(user.lockUntil && user.lockUntil > Date.now());
      const isPermanentlyBlocked = user.isBlocked === true;
      if (user.role !== 'admin' && (isTemporarilyLocked || isPermanentlyBlocked)) {
        const message = isTemporarilyLocked
          ? 'Tài khoản tạm thời bị khóa'
          : 'Tài khoản bị khóa vĩnh viễn';
        return errorResponse(res, message, 403);
      }
      
      // Lưu token vào req để có thể blacklist sau này
      req.token = token;
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return errorResponse(res, "Token đã hết hạn", 401);
      } else if (error.name === 'JsonWebTokenError') {
        return errorResponse(res, "Token không hợp lệ", 401);
      }
      return errorResponse(res, "Xác thực thất bại", 401);
    }
  } else {
    return errorResponse(res, "Token không được cung cấp", 401);
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return errorResponse(res, "Bạn không có quyền truy cập", 403);
    }
    next();
  };
};

// Middleware để logout và blacklist token
const logout = (req, res, next) => {
  if (req.token) {
    tokenBlacklist.add(req.token);
  }
  next();
};

// Middleware để refresh token
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return errorResponse(res, "Vui lòng cung cấp refresh token", 401);
    }
    
    const decoded = await verifyRefreshToken(refreshToken);
    const user = await User.findById(decoded.id).select("-password");
    
    if (!user || user.refreshToken !== refreshToken) {
      return errorResponse(res, "Refresh token không hợp lệ", 401);
    }
    
    // Kiểm tra sessionId có khớp với session hiện tại không
    if (decoded.sessionId && user.currentSessionId && decoded.sessionId !== user.currentSessionId) {
      return errorResponse(res, "Phiên đăng nhập không hợp lệ. Tài khoản đã được đăng nhập trên thiết bị khác.", 401);
    }
    
    req.user = user;
    req.sessionId = decoded.sessionId;
    next();
  } catch (error) {
    return errorResponse(res, "Refresh token không hợp lệ hoặc đã hết hạn", 401);
  }
};

// Middleware kiểm tra quyền sở hữu resource
const checkOwnership = (resourceModel, resourceIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params[resourceIdParam];
      const resource = await resourceModel.findById(resourceId);
      
      if (!resource) {
        return errorResponse(res, "Resource không tồn tại", 404);
      }
      
      // Admin có thể truy cập mọi resource
      if (req.user.role === 'admin') {
        req.resource = resource;
        return next();
      }
      
      // User chỉ có thể truy cập resource của mình
      if (resource.user_id && resource.user_id.toString() !== req.user._id.toString()) {
        return errorResponse(res, "Bạn không có quyền truy cập resource này", 403);
      }
      
      req.resource = resource;
      next();
    } catch (error) {
      return errorResponse(res, "Lỗi khi kiểm tra quyền sở hữu", 500);
    }
  };
};

// Middleware kiểm tra rate limit cho user cụ thể
const userRateLimit = (maxRequests = 100, windowMs = 15 * 60 * 1000) => {
  const userRequests = new Map();
  
  return (req, res, next) => {
    const userId = req.user._id.toString();
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Lấy hoặc tạo mảng requests cho user
    if (!userRequests.has(userId)) {
      userRequests.set(userId, []);
    }
    
    const requests = userRequests.get(userId);
    
    // Lọc bỏ requests cũ
    const validRequests = requests.filter(time => time > windowStart);
    
    if (validRequests.length >= maxRequests) {
      return errorResponse(res, "Quá nhiều yêu cầu từ tài khoản này", 429);
    }
    
    // Thêm request hiện tại
    validRequests.push(now);
    userRequests.set(userId, validRequests);
    
    next();
  };
};

export {
  protect,
  authorize,
  logout,
  refreshToken,
  checkOwnership,
  userRateLimit,
  tokenBlacklist
};
