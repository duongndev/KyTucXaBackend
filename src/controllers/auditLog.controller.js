import AuditLog from '../models/auditLog.model.js';
import {
  successResponse,
  errorResponse,
  badRequestResponse,
  notFoundResponse
} from '../utils/response.js';
import expressAsyncHandler from 'express-async-handler';

// Get all audit logs
export const getAllAuditLogs = expressAsyncHandler(async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      userId, 
      action, 
      severity, 
      status,
      startDate,
      endDate,
      search 
    } = req.query;
    
    const query = {};
    
    if (userId) query.userId = userId;
    if (action) query.action = action;
    if (severity) query.severity = severity;
    if (status) query.status = status;
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Search in details and errorMessage
    if (search) {
      query.$or = [
        { 'details.endpoint': { $regex: search, $options: 'i' } },
        { 'details.errorType': { $regex: search, $options: 'i' } },
        { errorMessage: { $regex: search, $options: 'i' } },
        { apiEndpoint: { $regex: search, $options: 'i' } }
      ];
    }
    
    const logs = await AuditLog.find(query)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await AuditLog.countDocuments(query);
    
    successResponse(res, 'Lấy danh sách log kiểm toán thành công', {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get all audit logs error:', error);
    errorResponse(res, 'Lấy danh sách log kiểm toán thất bại', error.message);
  }
});

// Get audit log by ID
export const getAuditLogById = expressAsyncHandler(async (req, res) => {
  try {
    const { id } = req.params;
    
    const log = await AuditLog.findById(id)
      .populate('userId', 'username email');
    
    if (!log) {
      return notFoundResponse(res, 'Không tìm thấy log kiểm toán');
    }
    
    successResponse(res, 'Lấy chi tiết log kiểm toán thành công', log);
    
  } catch (error) {
    console.error('Get audit log by ID error:', error);
    errorResponse(res, 'Lấy chi tiết log kiểm toán thất bại', error.message);
  }
});

// Get audit logs by user
export const getAuditLogsByUser = expressAsyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10, action, severity, startDate, endDate } = req.query;
    
    const query = { userId };
    
    if (action) query.action = action;
    if (severity) query.severity = severity;
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await AuditLog.countDocuments(query);
    
    successResponse(res, 'Lấy log kiểm toán theo người dùng thành công', {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get audit logs by user error:', error);
    errorResponse(res, 'Lấy log kiểm toán theo người dùng thất bại', error.message);
  }
});

// Get security events
export const getSecurityEvents = expressAsyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, severity, startDate, endDate } = req.query;
    
    const query = {
      $or: [
        { action: { $regex: 'SECURITY|LOGIN|LOGOUT|REGISTER', $options: 'i' } },
        { severity: { $in: ['MEDIUM', 'CRITICAL'] } }
      ]
    };
    
    if (severity) query.severity = severity;
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const logs = await AuditLog.find(query)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await AuditLog.countDocuments(query);
    
    successResponse(res, 'Lấy sự kiện bảo mật thành công', {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get security events error:', error);
    errorResponse(res, 'Lấy sự kiện bảo mật thất bại', error.message);
  }
});

// Get failed login attempts
export const getFailedLoginAttempts = expressAsyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    
    const query = {
      action: { $regex: 'LOGIN_FAILED', $options: 'i' }
    };
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await AuditLog.countDocuments(query);
    
    successResponse(res, 'Lấy attempts đăng nhập thất bại thành công', {
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get failed login attempts error:', error);
    errorResponse(res, 'Lấy attempts đăng nhập thất bại thất bại', error.message);
  }
});

// Get audit statistics
export const getAuditStatistics = expressAsyncHandler(async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }
    
    // Statistics by action
    const actionStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);
    
    // Statistics by severity
    const severityStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$severity',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Statistics by status
    const statusStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Recent activity (last 24 hours)
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivity = await AuditLog.aggregate([
      { $match: { ...matchStage, createdAt: { $gte: last24Hours } } },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            action: '$action'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.hour': 1 } }
    ]);
    
    // Total stats
    const totalStats = await AuditLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalLogs: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'SUCCESS'] }, 1, 0] }
          },
          failedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] }
          },
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] }
          }
        }
      }
    ]);
    
    successResponse(res, 'Lấy thống kê kiểm toán thành công', {
      byAction: actionStats,
      bySeverity: severityStats,
      byStatus: statusStats,
      recentActivity,
      total: totalStats[0] || {
        totalLogs: 0,
        successCount: 0,
        failedCount: 0,
        criticalCount: 0
      }
    });
    
  } catch (error) {
    console.error('Get audit statistics error:', error);
    errorResponse(res, 'Lấy thống kê kiểm toán thất bại', error.message);
  }
});

// Export audit logs
export const exportAuditLogs = expressAsyncHandler(async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      action, 
      severity, 
      status,
      format = 'json'
    } = req.query;
    
    const query = {};
    
    if (action) query.action = action;
    if (severity) query.severity = severity;
    if (status) query.status = status;
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    
    // Limit export to prevent large file sizes
    const logs = await AuditLog.find(query)
      .populate('userId', 'username email')
      .sort({ createdAt: -1 })
      .limit(10000); // Max 10,000 records
    
    // Implementation for export based on format
    let exportData;
    if (format === 'csv') {
      // CSV export implementation
      exportData = {
        format: 'csv',
        downloadUrl: 'csv_file_url',
        totalRecords: logs.length
      };
    } else {
      // JSON export
      exportData = {
        format: 'json',
        data: logs,
        totalRecords: logs.length
      };
    }
    
    successResponse(res, 'Xuất log kiểm toán thành công', exportData);
    
  } catch (error) {
    console.error('Export audit logs error:', error);
    errorResponse(res, 'Xuất log kiểm toán thất bại', error.message);
  }
});

// Clean old audit logs
export const cleanOldAuditLogs = expressAsyncHandler(async (req, res) => {
  try {
    const { days = 90 } = req.body; // Default: keep logs for 90 days
    
    if (days < 30) {
      return badRequestResponse(res, 'Phải giữ log ít nhất 30 ngày');
    }
    
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Delete logs older than cutoff date, but keep critical and high severity logs
    const result = await AuditLog.deleteMany({
      createdAt: { $lt: cutoffDate },
      severity: { $nin: ['CRITICAL', 'HIGH'] }
    });
    
    successResponse(res, 'Dọn dẹp log kiểm toán thành công', {
      deletedCount: result.deletedCount,
      cutoffDate
    });
    
  } catch (error) {
    console.error('Clean old audit logs error:', error);
    errorResponse(res, 'Dọn dẹp log kiểm toán thất bại', error.message);
  }
});
