import { Feedback } from '../../models/support/index.js';
import Student from '../../models/user/student.model.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse
} from '../../utils/response.js';
import { buildPaginationMeta } from '../../helpers/pagination.js';

export const createFeedback = async (req, res) => {
  try {
    const {
      feedbackType,
      rating,
      title,
      comment,
      aspects,
      isAnonymous,
      relatedServiceId
    } = req.body;

    const userId = req.user._id;
    const student = await Student.findOne({ userId });

    if (!student) {
      return notFoundResponse(res, 'Không tìm thấy thông tin sinh viên');
    }

    let sentiment = 'neutral';
    if (rating >= 4) sentiment = 'positive';
    else if (rating <= 2) sentiment = 'negative';

    const feedback = await Feedback.create({
      feedbackType,
      rating,
      title,
      comment,
      aspects,
      isAnonymous: isAnonymous || false,
      studentId: student._id,
      userId,
      relatedRoomId: student.currentRoom,
      relatedServiceId,
      sentiment
    });

    return createdResponse(res, 'Gửi đánh giá thành công', feedback);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getMyFeedbacks = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const student = await Student.findOne({ userId });
    if (!student) {
      return notFoundResponse(res, 'Không tìm thấy thông tin sinh viên');
    }

    const query = { studentId: student._id };
    const total = await Feedback.countDocuments(query);

    const feedbacks = await Feedback.find(query)
      .populate('relatedRoomId', 'roomCode roomNumber')
      .populate('relatedServiceId', 'name')
      .populate('adminResponse.respondedBy', 'fullName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return successResponse(res, 'Lấy danh sách đánh giá thành công', {
      feedbacks,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getFeedbackById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const userRole = req.user.role;

    const query = { _id: id };
    if (userRole === 'student') {
      const student = await Student.findOne({ userId });
      if (!student) {
        return notFoundResponse(res, 'Không tìm thấy thông tin sinh viên');
      }
      query.studentId = student._id;
    }

    const feedback = await Feedback.findOne(query)
      .populate('studentId', 'studentId university userId')
      .populate('userId', 'fullName email')
      .populate('relatedRoomId', 'roomCode roomNumber')
      .populate('relatedServiceId', 'name')
      .populate('resolvedBy', 'fullName')
      .populate('adminResponse.respondedBy', 'fullName');

    if (!feedback) {
      return notFoundResponse(res, 'Đánh giá không tồn tại');
    }

    return successResponse(res, 'Lấy thông tin đánh giá thành công', feedback);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const adminGetAllFeedbacks = async (req, res) => {
  try {
    const {
      feedbackType,
      rating,
      isResolved,
      sentiment,
      feedbackType: type,
      page = 1,
      limit = 20
    } = req.query;

    const query = {};
    if (feedbackType) query.feedbackType = feedbackType;
    if (rating) query.rating = parseInt(rating);
    if (isResolved !== undefined) query.isResolved = isResolved === 'true';
    if (sentiment) query.sentiment = sentiment;
    if (type) query.feedbackType = type;

    const total = await Feedback.countDocuments(query);
    const feedbacks = await Feedback.find(query)
      .populate('studentId', 'studentId university')
      .populate('userId', 'fullName')
      .populate('relatedRoomId', 'roomCode roomNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return successResponse(res, 'Lấy danh sách đánh giá thành công', {
      feedbacks,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const respondToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user._id;

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      {
        adminResponse: {
          content,
          respondedBy: userId,
          respondedAt: new Date()
        },
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId
      },
      { new: true }
    )
      .populate('studentId', 'studentId university')
      .populate('userId', 'fullName email')
      .populate('adminResponse.respondedBy', 'fullName');

    if (!feedback) {
      return notFoundResponse(res, 'Đánh giá không tồn tại');
    }

    return successResponse(res, 'Phản hồi đánh giá thành công', feedback);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const resolveFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = req.user._id;

    const feedback = await Feedback.findByIdAndUpdate(
      id,
      {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolutionNote: note
      },
      { new: true }
    );

    if (!feedback) {
      return notFoundResponse(res, 'Đánh giá không tồn tại');
    }

    return successResponse(res, 'Đánh dấu đã xử lý thành công', feedback);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getFeedbackStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const query = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const stats = await Promise.all([
      Feedback.countDocuments(query),
      Feedback.countDocuments({ ...query, isResolved: true }),
      Feedback.countDocuments({ ...query, isResolved: false }),
      Feedback.aggregate([
        { $match: query },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ])
    ]);

    const byType = await Feedback.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$feedbackType',
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' }
        }
      }
    ]);

    const byRating = await Feedback.aggregate([
      { $match: query },
      { $group: { _id: '$rating', count: { $sum: 1 } } }
    ]);

    const byAspect = await Feedback.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          cleanliness: { $avg: '$aspects.cleanliness' },
          staff_service: { $avg: '$aspects.staff_service' },
          facilities: { $avg: '$aspects.facilities' },
          value_for_money: { $avg: '$aspects.value_for_money' },
          responsiveness: { $avg: '$aspects.responsiveness' }
        }
      }
    ]);

    const sentimentStats = await Feedback.aggregate([
      { $match: { ...query, sentiment: { $ne: null } } },
      { $group: { _id: '$sentiment', count: { $sum: 1 } } }
    ]);

    const recentNegative = await Feedback.find({
      ...query,
      rating: { $lte: 2 },
      isResolved: false
    })
      .populate('studentId', 'studentId')
      .populate('userId', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5);

    return successResponse(res, 'Lấy thống kê đánh giá thành công', {
      overview: {
        total: stats[0],
        resolved: stats[1],
        pending: stats[2],
        averageRating: Math.round(stats[3][0]?.avg * 100) / 100 || 0
      },
      byType,
      byRating,
      byAspect: byAspect[0] || {},
      sentiment: sentimentStats,
      recentNegative
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getFeedbackTrend = async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - parseInt(months));

    const trend = await Feedback.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 },
          avgRating: { $avg: '$rating' }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    return successResponse(res, 'Lấy xu hướng đánh giá thành công', trend);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
