import FormTemplate from "../models/formTemplate.model.js";
import FormSubmission from "../models/formSubmission.model.js";
import { badRequestResponse, forbiddenResponse, notFoundResponse } from "../utils/response.js";

// Middleware to validate template access
export const validateTemplateAccess = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const template = await FormTemplate.findById(templateId);
    if (!template) {
      return notFoundResponse(res, "Template not found");
    }

    // Check if template is active
    if (template.status !== 'active' && userRole !== 'admin') {
      return badRequestResponse(res, "Template is not active");
    }

    // Check permissions based on user role
    const permissions = template.permissions;
    
    switch (req.method) {
      case 'GET':
        if (!permissions.canView.includes(userRole) && !permissions.canSubmit.includes(userRole)) {
          return forbiddenResponse(res, "You don't have permission to view this template");
        }
        break;
      case 'POST':
        if (!permissions.canSubmit.includes(userRole)) {
          return forbiddenResponse(res, "You don't have permission to submit this template");
        }
        break;
      case 'PUT':
      case 'DELETE':
        if (!permissions.canEdit.includes(userRole) && userRole !== 'admin') {
          return forbiddenResponse(res, "You don't have permission to modify this template");
        }
        break;
    }

    req.template = template;
    next();

  } catch (error) {
    console.error("Template access validation error:", error);
    return badRequestResponse(res, "Failed to validate template access");
  }
};

// Middleware to check form ownership
export const checkFormOwnership = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role;

    const submission = await FormSubmission.findById(id);
    if (!submission) {
      return notFoundResponse(res, "Submission not found");
    }

    // Check ownership or admin access
    if (submission.userId.toString() !== userId && userRole !== 'admin') {
      return forbiddenResponse(res, "You don't have permission to access this submission");
    }

    req.submission = submission;
    next();

  } catch (error) {
    console.error("Form ownership check error:", error);
    return badRequestResponse(res, "Failed to check form ownership");
  }
};

// Middleware to validate form submission status transitions
export const validateStatusTransition = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = req.user.role;

    const submission = await FormSubmission.findById(id);
    if (!submission) {
      return notFoundResponse(res, "Submission not found");
    }

    // Check if transition is allowed
    if (!submission.canTransitionTo(status)) {
      return badRequestResponse(res, `Cannot transition from ${submission.status} to ${status}`);
    }

    // Role-based restrictions
    const restrictedTransitions = {
      'student': ['draft', 'document_uploaded'],
      'admin': ['stamp_verified', 'physical_submitted', 'verified', 'under_review', 'approved', 'rejected'],
      'reviewer': ['under_review', 'approved', 'rejected']
    };

    const allowedTransitions = restrictedTransitions[userRole] || [];
    if (allowedTransitions.length > 0 && !allowedTransitions.includes(status)) {
      return forbiddenResponse(res, `Role ${userRole} cannot transition to status ${status}`);
    }

    req.submission = submission;
    next();

  } catch (error) {
    console.error("Status transition validation error:", error);
    return badRequestResponse(res, "Failed to validate status transition");
  }
};

// Middleware to validate workflow step
export const validateWorkflowStep = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { stepId } = req.body;

    const submission = await FormSubmission.findById(id).populate('templateId');
    if (!submission) {
      return notFoundResponse(res, "Submission not found");
    }

    const template = submission.templateId;
    if (!template.workflow || !template.workflow.steps) {
      return badRequestResponse(res, "Template does not have workflow configuration");
    }

    const step = template.workflow.steps.find(s => s.id === stepId);
    if (!step) {
      return notFoundResponse(res, "Workflow step not found");
    }

    // Check if step is reachable
    const currentStepIndex = template.workflow.steps.findIndex(s => s.id === submission.currentStep?.stepId);
    const targetStepIndex = template.workflow.steps.findIndex(s => s.id === stepId);

    if (targetStepIndex <= currentStepIndex) {
      return badRequestResponse(res, "Cannot move backward in workflow");
    }

    // Check step requirements
    if (step.required && !req.body.action) {
      return badRequestResponse(res, "This step requires an action");
    }

    req.submission = submission;
    req.workflowStep = step;
    next();

  } catch (error) {
    console.error("Workflow step validation error:", error);
    return badRequestResponse(res, "Failed to validate workflow step");
  }
};

// Middleware to check file upload permissions
export const validateFileUpload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const fieldName = req.file?.fieldname;

    const submission = await FormSubmission.findById(id).populate('templateId');
    if (!submission) {
      return notFoundResponse(res, "Submission not found");
    }

    const template = submission.templateId;
    const uploadConfig = template.fileUploadConfig;

    if (!uploadConfig) {
      return badRequestResponse(res, "Template does not allow file uploads");
    }

    // Check file type
    if (uploadConfig.allowedTypes && uploadConfig.allowedTypes.length > 0) {
      const fileExtension = req.file.originalname.split('.').pop().toLowerCase();
      if (!uploadConfig.allowedTypes.includes(fileExtension)) {
        return badRequestResponse(res, `File type ${fileExtension} is not allowed`);
      }
    }

    // Check file size
    if (uploadConfig.maxSize && req.file.size > uploadConfig.maxSize) {
      return badRequestResponse(res, `File size exceeds maximum limit of ${uploadConfig.maxSize} bytes`);
    }

    // Check max files
    if (uploadConfig.maxFiles && submission.attachments.length >= uploadConfig.maxFiles) {
      return badRequestResponse(res, `Maximum number of files (${uploadConfig.maxFiles}) exceeded`);
    }

    req.submission = submission;
    req.uploadConfig = uploadConfig;
    next();

  } catch (error) {
    console.error("File upload validation error:", error);
    return badRequestResponse(res, "Failed to validate file upload");
  }
};

// Middleware to validate form data integrity
export const validateDataIntegrity = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { formData } = req.body;

    const submission = await FormSubmission.findById(id);
    if (!submission) {
      return notFoundResponse(res, "Submission not found");
    }

    // Check if data has been tampered with
    if (submission.security.dataIntegrityHash) {
      const currentHash = require('crypto')
        .createHash('sha256')
        .update(JSON.stringify(formData, Object.keys(formData).sort()))
        .digest('hex');

      if (currentHash !== submission.security.dataIntegrityHash) {
        // Mark as tampered
        submission.security.tampered = true;
        submission.security.tamperedAt = new Date();
        await submission.save();

        return badRequestResponse(res, "Data integrity check failed. Possible tampering detected.");
      }
    }

    req.submission = submission;
    next();

  } catch (error) {
    console.error("Data integrity validation error:", error);
    return badRequestResponse(res, "Failed to validate data integrity");
  }
};

// Middleware to rate limit form submissions
export const rateLimitFormSubmission = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const userId = req.user.id;

    // Check recent submissions (last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentSubmissions = await FormSubmission.countDocuments({
      templateId,
      userId,
      createdAt: { $gte: oneHourAgo }
    });

    const MAX_SUBMISSIONS_PER_HOUR = 5;
    if (recentSubmissions >= MAX_SUBMISSIONS_PER_HOUR) {
      return badRequestResponse(res, `Too many submissions. Maximum ${MAX_SUBMISSIONS_PER_HOUR} submissions per hour allowed.`);
    }

    // Check recent draft saves (last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const recentDrafts = await FormSubmission.countDocuments({
      templateId,
      userId,
      status: 'draft',
      updatedAt: { $gte: fiveMinutesAgo }
    });

    const MAX_DRAFT_SAVES_PER_5_MINUTES = 20;
    if (recentDrafts >= MAX_DRAFT_SAVES_PER_5_MINUTES) {
      return badRequestResponse(res, `Too many draft saves. Please wait before saving again.`);
    }

    next();

  } catch (error) {
    console.error("Rate limiting error:", error);
    return badRequestResponse(res, "Failed to check rate limits");
  }
};

// Middleware to validate form completion requirements
export const validateFormCompletion = async (req, res, next) => {
  try {
    const { id } = req.params;

    const submission = await FormSubmission.findById(id).populate('templateId');
    if (!submission) {
      return notFoundResponse(res, "Submission not found");
    }

    const template = submission.templateId;
    const requiredFields = template.getRequiredFields();
    const formData = submission.formData;

    // Check all required fields are filled
    const missingFields = [];
    for (const field of requiredFields) {
      if (!formData[field.id] || formData[field.id] === '') {
        missingFields.push(field.label);
      }
    }

    if (missingFields.length > 0) {
      return badRequestResponse(res, `Required fields missing: ${missingFields.join(', ')}`);
    }

    // Check if stamped document is required
    if (template.fileUploadConfig?.requireStamp && (!submission.stampedDocument || !submission.stampedDocument.fileUrl)) {
      return badRequestResponse(res, "Stamped document is required");
    }

    req.submission = submission;
    next();

  } catch (error) {
    console.error("Form completion validation error:", error);
    return badRequestResponse(res, "Failed to validate form completion");
  }
};

// Middleware to log form access
export const logFormAccess = async (req, res, next) => {
  try {
    const { id, templateId } = req.params;
    const userId = req.user.id;
    const method = req.method;
    const path = req.path;

    let logData = {
      userId,
      method,
      path,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date()
    };

    if (id) {
      logData.submissionId = id;
      // Update submission access count
      await FormSubmission.findByIdAndUpdate(id, {
        $inc: { 'security.accessCount': 1 },
        $set: { 'security.lastAccessAt': new Date() }
      });
    }

    if (templateId) {
      logData.templateId = templateId;
    }

    // Log to console (in production, use proper logging service)
    console.log('Form Access:', JSON.stringify(logData));

    next();

  } catch (error) {
    console.error("Form access logging error:", error);
    // Don't block the request for logging errors
    next();
  }
};

// Middleware to validate template version compatibility
export const validateTemplateVersion = async (req, res, next) => {
  try {
    const { templateId } = req.params;

    const template = await FormTemplate.findById(templateId);
    if (!template) {
      return notFoundResponse(res, "Template not found");
    }

    // Check if template version is supported
    const supportedVersions = ['1.0', '1.1', '2.0'];
    if (!supportedVersions.includes(template.version)) {
      return badRequestResponse(res, `Template version ${template.version} is not supported`);
    }

    // Check for deprecated templates
    if (template.status === 'deprecated') {
      return badRequestResponse(res, "This template is deprecated. Please use a newer version.");
    }

    req.template = template;
    next();

  } catch (error) {
    console.error("Template version validation error:", error);
    return badRequestResponse(res, "Failed to validate template version");
  }
};

export {
  validateTemplateAccess,
  checkFormOwnership,
  validateStatusTransition,
  validateWorkflowStep,
  validateFileUpload,
  validateDataIntegrity,
  rateLimitFormSubmission,
  validateFormCompletion,
  logFormAccess,
  validateTemplateVersion
};
