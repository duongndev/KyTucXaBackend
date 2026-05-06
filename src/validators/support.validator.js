import Joi from 'joi';

export const createChatRoomSchema = Joi.object({
  title: Joi.string().max(200).optional(),
  participantIds: Joi.array().items(Joi.string()).optional(),
  roomType: Joi.string().valid('student_admin', 'group', 'ticket').default('student_admin')
});

export const sendMessageSchema = Joi.object({
  content: Joi.string().min(1).max(5000).required(),
  messageType: Joi.string().valid('text', 'image', 'file', 'system').default('text'),
  replyToId: Joi.string().optional().allow(null)
});

export const createTicketSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  description: Joi.string().min(10).max(5000).required(),
  category: Joi.string().valid(
    'room_issue',
    'billing',
    'maintenance',
    'security',
    'noise_complaint',
    'roommate_issue',
    'facility',
    'internet',
    'other'
  ).optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional(),
  attachments: Joi.array().items(
    Joi.object({
      url: Joi.string().required(),
      filename: Joi.string().required(),
      mimeType: Joi.string().required()
    })
  ).optional()
});

export const updateTicketSchema = Joi.object({
  title: Joi.string().min(5).max(200).optional(),
  description: Joi.string().min(10).max(5000).optional(),
  category: Joi.string().valid(
    'room_issue',
    'billing',
    'maintenance',
    'security',
    'noise_complaint',
    'roommate_issue',
    'facility',
    'internet',
    'other'
  ).optional(),
  priority: Joi.string().valid('low', 'medium', 'high', 'urgent').optional()
});

export const assignTicketSchema = Joi.object({
  adminId: Joi.string().required()
});

export const updateTicketStatusSchema = Joi.object({
  status: Joi.string().valid('open', 'in_progress', 'waiting_customer', 'resolved', 'closed', 'escalated').required(),
  note: Joi.string().max(1000).optional()
});

export const rateTicketSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().max(1000).optional()
});

export const createFAQSchema = Joi.object({
  question: Joi.string().min(10).max(500).required(),
  answer: Joi.string().min(10).max(5000).required(),
  category: Joi.string().valid(
    'registration',
    'room',
    'billing',
    'contract',
    'maintenance',
    'rules',
    'facilities',
    'services',
    'check_in_out',
    'other'
  ).required(),
  keywords: Joi.array().items(Joi.string().lowercase()).optional(),
  order: Joi.number().integer().min(0).optional()
});

export const updateFAQSchema = Joi.object({
  question: Joi.string().min(10).max(500).optional(),
  answer: Joi.string().min(10).max(5000).optional(),
  category: Joi.string().valid(
    'registration',
    'room',
    'billing',
    'contract',
    'maintenance',
    'rules',
    'facilities',
    'services',
    'check_in_out',
    'other'
  ).optional(),
  keywords: Joi.array().items(Joi.string().lowercase()).optional(),
  order: Joi.number().integer().min(0).optional(),
  isActive: Joi.boolean().optional()
});

export const rateFAQSchema = Joi.object({
  helpful: Joi.boolean().required()
});

export const chatbotSearchSchema = Joi.object({
  message: Joi.string().min(3).max(500).required()
});

export const createFeedbackSchema = Joi.object({
  feedbackType: Joi.string().valid(
    'room_service',
    'maintenance',
    'security',
    'cleaning',
    'staff_attitude',
    'facility',
    'billing',
    'food',
    'laundry',
    'general'
  ).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
  title: Joi.string().max(200).optional(),
  comment: Joi.string().max(2000).optional(),
  aspects: Joi.object({
    cleanliness: Joi.number().integer().min(1).max(5).optional(),
    staff_service: Joi.number().integer().min(1).max(5).optional(),
    facilities: Joi.number().integer().min(1).max(5).optional(),
    value_for_money: Joi.number().integer().min(1).max(5).optional(),
    responsiveness: Joi.number().integer().min(1).max(5).optional()
  }).optional(),
  isAnonymous: Joi.boolean().default(false),
  relatedServiceId: Joi.string().optional()
});

export const respondToFeedbackSchema = Joi.object({
  content: Joi.string().min(5).max(1000).required()
});

export const resolveFeedbackSchema = Joi.object({
  note: Joi.string().max(1000).optional()
});
