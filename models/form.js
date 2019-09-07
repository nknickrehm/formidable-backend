const mongoose = require('mongoose');

const formSchema = mongoose.Schema({
  type: {
    type: String,
    required: true,
    enum: ['businessTrip', 'travelExpenses', 'vacation']
  },
  tag: {
    type: String,
    required: true,
    default: 'draft',
    enum: ['draft', 'sent', 'accepted', 'rejected']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastEdit: Date,
  isComplete: {
    type: Boolean,
    default: false,
  },
  fields: [{}],
  pdfFiles: [{}]
});

formSchema.pre('save', function (done) {
  const user = this;
  user.lastEdit = Date.now;
  done();
});

const Form = mongoose.model('Form', formSchema);

module.exports = { formSchema, Form };