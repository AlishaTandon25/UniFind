const mongoose = require('mongoose')

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  universityId: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['student', 'admin', 'helpdesk'], default: 'student' },
  accountStatus: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

const itemSchema = new mongoose.Schema({
  itemName: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, required: true, enum: ['Electronics', 'Books and Stationery', 'Identity Cards', 'Clothing and Accessories', 'Keys', 'Sports Equipment', 'Bags and Wallets', 'Other'] },
  description: { type: String, required: true, maxlength: 2000 },
  itemType: { type: String, required: true, enum: ['Lost', 'Found'] },
  dateOfIncident: { type: Date, required: true },
  location: { type: String, required: true, trim: true, maxlength: 200 },
  identifyingFeatures: { type: String, maxlength: 1000, default: '' },
  additionalInformation: { type: String, maxlength: 1000, default: '' },
  image: { type: String, default: '' },
  contactPreference: { type: String, default: 'In-app message' },
  storageLocation: { type: String, default: '' },
  reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approvalStatus: { type: String, enum: ['Pending Approval', 'Approved', 'Rejected'], default: 'Pending Approval' },
  itemStatus: { type: String, enum: ['Active', 'Awaiting Collection', 'Returned', 'Closed'], default: 'Active' },
}, { timestamps: true })
itemSchema.index({ itemName: 'text', description: 'text', location: 'text' })
itemSchema.index({ approvalStatus: 1, itemType: 1, createdAt: -1 })

const claimSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  claimantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownershipDescription: { type: String, required: true, maxlength: 1500 },
  identifyingFeatures: { type: String, required: true, maxlength: 1000 },
  purchaseDetails: { type: String, default: '', maxlength: 1000 },
  supportingEvidence: { type: String, default: '' },
  additionalRemarks: { type: String, default: '', maxlength: 1000 },
  claimStatus: { type: String, enum: ['Pending Review', 'Approved', 'Rejected', 'Completed'], default: 'Pending Review' },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  adminRemarks: { type: String, default: '' },
  activeClaim: { type: Boolean, default: true },
}, { timestamps: true })
claimSchema.index({ itemId: 1, claimantId: 1, claimStatus: 1 })
claimSchema.index({ itemId: 1, claimantId: 1 }, { unique: true, partialFilterExpression: { activeClaim: true } })

const notificationSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'update' },
  relatedItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
  isRead: { type: Boolean, default: false },
}, { timestamps: { createdAt: true, updatedAt: false } })
notificationSchema.index({ recipientId: 1, createdAt: -1 })

const handoverSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: 'Claim', required: true, unique: true },
  claimantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  handoverStatus: { type: String, enum: ['Awaiting Collection', 'Completed'], default: 'Awaiting Collection' },
  remarks: { type: String, default: '', maxlength: 1000 },
  handoverDate: { type: Date, default: null },
}, { timestamps: true })

module.exports = {
  User: mongoose.model('User', userSchema),
  Item: mongoose.model('Item', itemSchema),
  Claim: mongoose.model('Claim', claimSchema),
  Notification: mongoose.model('Notification', notificationSchema),
  Handover: mongoose.model('Handover', handoverSchema),
}
