import mongoose from 'mongoose';

const formTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  version: { type: String, default: '1.0' },
  status: { type: String, enum: ['active', 'inactive', 'deprecated'], default: 'active' },
  fields: [{ type: mongoose.Schema.Types.Mixed }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const FormTemplate = mongoose.model('FormTemplate', formTemplateSchema);
export default FormTemplate;
