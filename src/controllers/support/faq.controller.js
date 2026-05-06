import { FAQ } from '../../models/support/index.js';
import {
  successResponse,
  errorResponse,
  createdResponse,
  notFoundResponse,
  badRequestResponse
} from '../../utils/response.js';
import { buildPaginationMeta } from '../../helpers/pagination.js';

export const createFAQ = async (req, res) => {
  try {
    const { question, answer, category, keywords, order } = req.body;
    const userId = req.user._id;

    const faq = await FAQ.create({
      question,
      answer,
      category,
      keywords: keywords || [],
      order: order || 0,
      createdBy: userId
    });

    return createdResponse(res, 'Tạo FAQ thành công', faq);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getAllFAQs = async (req, res) => {
  try {
    const { category, search, isActive = 'true', page = 1, limit = 20 } = req.query;

    const query = { isActive: isActive === 'true' };
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { question: { $regex: search, $options: 'i' } },
        { answer: { $regex: search, $options: 'i' } },
        { keywords: { $in: [search.toLowerCase()] } }
      ];
    }

    const total = await FAQ.countDocuments(query);
    const faqs = await FAQ.find(query)
      .populate('createdBy', 'fullName')
      .populate('updatedBy', 'fullName')
      .sort({ category: 1, order: 1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    return successResponse(res, 'Lấy danh sách FAQ thành công', {
      faqs,
      pagination: buildPaginationMeta(page, limit, total)
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getFAQById = async (req, res) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findByIdAndUpdate(
      id,
      { $inc: { viewCount: 1 } },
      { new: true }
    ).populate('createdBy', 'fullName');

    if (!faq) {
      return notFoundResponse(res, 'FAQ không tồn tại');
    }

    return successResponse(res, 'Lấy thông tin FAQ thành công', faq);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getFAQsByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const faqs = await FAQ.find({ category, isActive: true })
      .sort({ order: 1, viewCount: -1 });

    return successResponse(res, 'Lấy FAQ theo danh mục thành công', faqs);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const updateFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { question, answer, category, keywords, order, isActive } = req.body;
    const userId = req.user._id;

    const updates = {
      updatedBy: userId,
      updatedAt: new Date()
    };

    if (question !== undefined) updates.question = question;
    if (answer !== undefined) updates.answer = answer;
    if (category !== undefined) updates.category = category;
    if (keywords !== undefined) updates.keywords = keywords;
    if (order !== undefined) updates.order = order;
    if (isActive !== undefined) updates.isActive = isActive;

    const faq = await FAQ.findByIdAndUpdate(id, updates, { new: true });

    if (!faq) {
      return notFoundResponse(res, 'FAQ không tồn tại');
    }

    return successResponse(res, 'Cập nhật FAQ thành công', faq);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const deleteFAQ = async (req, res) => {
  try {
    const { id } = req.params;

    const faq = await FAQ.findByIdAndDelete(id);
    if (!faq) {
      return notFoundResponse(res, 'FAQ không tồn tại');
    }

    return successResponse(res, 'Xóa FAQ thành công');
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const searchFAQs = async (req, res) => {
  try {
    const { q, category } = req.query;
    if (!q) {
      return badRequestResponse(res, 'Vui lòng nhập từ khóa tìm kiếm');
    }

    const searchQuery = {
      isActive: true,
      $text: { $search: q }
    };

    if (category) searchQuery.category = category;

    const faqs = await FAQ.find(
      searchQuery,
      { score: { $meta: 'textScore' } }
    )
      .sort({ score: { $meta: 'textScore' } })
      .limit(10);

    return successResponse(res, 'Tìm kiếm FAQ thành công', faqs);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const rateFAQ = async (req, res) => {
  try {
    const { id } = req.params;
    const { helpful } = req.body;

    const update = helpful
      ? { $inc: { helpfulCount: 1 } }
      : { $inc: { notHelpfulCount: 1 } };

    const faq = await FAQ.findByIdAndUpdate(id, update, { new: true });

    if (!faq) {
      return notFoundResponse(res, 'FAQ không tồn tại');
    }

    return successResponse(res, 'Đánh giá FAQ thành công', faq);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const getFAQStatistics = async (req, res) => {
  try {
    const categoryStats = await FAQ.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 }, totalViews: { $sum: '$viewCount' } } }
    ]);

    const mostViewed = await FAQ.find({ isActive: true })
      .sort({ viewCount: -1 })
      .limit(5)
      .select('question viewCount helpfulCount category');

    const totalFAQs = await FAQ.countDocuments({ isActive: true });
    const totalViews = await FAQ.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: null, total: { $sum: '$viewCount' } } }
    ]);

    return successResponse(res, 'Lấy thống kê FAQ thành công', {
      totalFAQs,
      totalViews: totalViews[0]?.total || 0,
      byCategory: categoryStats,
      mostViewed
    });
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};

export const chatbotSearch = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return badRequestResponse(res, 'Vui lòng nhập câu hỏi');
    }

    const searchWords = message.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const faqs = await FAQ.find({
      isActive: true,
      $or: [
        { keywords: { $in: searchWords } },
        { question: { $regex: searchWords.join('|'), $options: 'i' } }
      ]
    }).limit(5);

    let response = {
      query: message,
      results: faqs,
      hasAnswer: faqs.length > 0,
      suggestion: null
    };

    if (faqs.length === 0) {
      response.suggestion = {
        message: 'Không tìm thấy câu trả lời phù hợp. Bạn có thể:',
        options: [
          { type: 'create_ticket', label: 'Tạo ticket hỗ trợ', action: '/api/support/tickets' },
          { type: 'view_faq', label: 'Xem tất cả FAQ', action: '/api/support/faqs' },
          { type: 'start_chat', label: 'Chat với ban quản lý', action: '/api/support/chat' }
        ]
      };
    }

    return successResponse(res, 'Tìm kiếm chatbot thành công', response);
  } catch (error) {
    return errorResponse(res, error.message, 500);
  }
};
