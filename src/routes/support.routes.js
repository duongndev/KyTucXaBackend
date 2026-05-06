import express from 'express';
import {
  createChatRoom,
  getMyChatRooms,
  getChatRoomById,
  getMessages,
  sendMessage,
  closeChatRoom,
  getUnreadCount,
  assignAdminToRoom,
  getAllChatRooms,
  createTicket,
  getMyTickets,
  getTicketById,
  updateTicket,
  adminGetAllTickets,
  assignTicket,
  updateTicketStatus,
  addTicketComment,
  rateTicket,
  getTicketStatistics,
  createFAQ,
  getAllFAQs,
  getFAQById,
  getFAQsByCategory,
  updateFAQ,
  deleteFAQ,
  searchFAQs,
  rateFAQ,
  getFAQStatistics,
  chatbotSearch,
  createFeedback,
  getMyFeedbacks,
  getFeedbackById,
  adminGetAllFeedbacks,
  respondToFeedback,
  resolveFeedback,
  getFeedbackStatistics,
  getFeedbackTrend
} from '../controllers/support/index.js';
import { protect, authorize } from '../middlewares/auth.middlewares.js';

const router = express.Router();

router.use(protect);

// ==================== CHAT ROUTES ====================

router.post('/chat/rooms', createChatRoom);
router.get('/chat/rooms/my', getMyChatRooms);
router.get('/chat/rooms/unread-count', getUnreadCount);
router.get('/chat/rooms/:roomId', getChatRoomById);
router.get('/chat/rooms/:roomId/messages', getMessages);
router.post('/chat/rooms/:roomId/messages', sendMessage);
router.patch('/chat/rooms/:roomId/close', closeChatRoom);

// Admin Chat Routes
router.get('/admin/chat/rooms', authorize('admin'), getAllChatRooms);
router.patch('/admin/chat/rooms/:roomId/assign', authorize('admin'), assignAdminToRoom);

// ==================== TICKET ROUTES ====================

router.post('/tickets', createTicket);
router.get('/tickets/my', getMyTickets);
router.get('/tickets/:id', getTicketById);
router.patch('/tickets/:id', updateTicket);
router.patch('/tickets/:id/rate', rateTicket);

// Admin Ticket Routes
router.get('/admin/tickets', authorize('admin'), adminGetAllTickets);
router.get('/admin/tickets/statistics', authorize('admin'), getTicketStatistics);
router.patch('/admin/tickets/:id/assign', authorize('admin'), assignTicket);
router.patch('/admin/tickets/:id/status', authorize('admin'), updateTicketStatus);
router.post('/admin/tickets/:id/comment', authorize('admin'), addTicketComment);

// ==================== FAQ ROUTES ====================

router.get('/faqs', getAllFAQs);
router.get('/faqs/search', searchFAQs);
router.get('/faqs/category/:category', getFAQsByCategory);
router.get('/faqs/:id', getFAQById);
router.post('/faqs/:id/rate', rateFAQ);

// Admin FAQ Routes
router.post('/admin/faqs', authorize('admin'), createFAQ);
router.patch('/admin/faqs/:id', authorize('admin'), updateFAQ);
router.delete('/admin/faqs/:id', authorize('admin'), deleteFAQ);
router.get('/admin/faqs/statistics', authorize('admin'), getFAQStatistics);

// ==================== CHATBOT ROUTES ====================

router.post('/chatbot/search', chatbotSearch);

// ==================== FEEDBACK ROUTES ====================

router.post('/feedbacks', createFeedback);
router.get('/feedbacks/my', getMyFeedbacks);
router.get('/feedbacks/:id', getFeedbackById);

// Admin Feedback Routes
router.get('/admin/feedbacks', authorize('admin'), adminGetAllFeedbacks);
router.get('/admin/feedbacks/statistics', authorize('admin'), getFeedbackStatistics);
router.get('/admin/feedbacks/trend', authorize('admin'), getFeedbackTrend);
router.patch('/admin/feedbacks/:id/respond', authorize('admin'), respondToFeedback);
router.patch('/admin/feedbacks/:id/resolve', authorize('admin'), resolveFeedback);

export default router;
