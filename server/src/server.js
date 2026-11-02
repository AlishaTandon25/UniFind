require('dotenv').config()
const express = require('express')
const dns = require('node:dns')
const mongoose = require('mongoose')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const multer = require('multer')
const path = require('path')
const crypto = require('crypto')
const fs = require('fs')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { z } = require('zod')
const { User, Item, Claim, Notification, Handover } = require('./models')
const { authenticate, authorize } = require('./middleware')

const app = express()
const uploadDir = path.join(__dirname, '..', 'uploads')
const evidenceDir = path.join(__dirname, '..', 'private-uploads')
fs.mkdirSync(uploadDir, { recursive: true })
fs.mkdirSync(evidenceDir, { recursive: true })

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }))
app.use(express.json({ limit: '1mb' }))
app.use('/uploads', express.static(uploadDir, { maxAge: '1d', dotfiles: 'deny' }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false }))

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
})
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extensions = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] }
    if (!extensions[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) return callback(new Error('Upload a JPG, PNG, or WebP image.'))
    callback(null, true)
  },
})
const evidenceUpload = multer({
  storage: multer.diskStorage({
    destination: evidenceDir,
    filename: (_req, file, callback) => callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const extensions = { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'], 'image/webp': ['.webp'] }
    if (!extensions[file.mimetype]?.includes(path.extname(file.originalname).toLowerCase())) return callback(new Error('Upload a JPG, PNG, or WebP image.'))
    callback(null, true)
  },
})

const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(async (error) => {
  if (req.file?.path) await fs.promises.unlink(req.file.path).catch((cleanupError) => console.error('Could not remove rejected upload:', cleanupError.message))
  next(error)
})
const notify = (recipientId, title, message, type = 'update', relatedItemId = null) =>
  Notification.create({ recipientId, title, message, type, relatedItemId })
const admins = () => User.find({ role: 'admin', accountStatus: 'active' }).select('_id')
const uploadUrl = (req, file) => file ? `${req.protocol}://${req.get('host')}/uploads/${file.filename}` : ''
const publicItemFields = 'itemName category description itemType dateOfIncident location image reportedBy approvalStatus itemStatus createdAt updatedAt'

async function verifyImage(req, res, next) {
  if (!req.file) return next()
  try {
    const bytes = await fs.promises.readFile(req.file.path)
    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const isWebp = bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    const detectedType = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isWebp ? 'image/webp' : ''
    if (!detectedType || detectedType !== req.file.mimetype) {
      await fs.promises.unlink(req.file.path)
      return res.status(400).json({ message: 'The uploaded file is not a valid JPG, PNG, or WebP image.' })
    }
    next()
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch((cleanupError) => console.error('Could not remove unreadable upload:', cleanupError.message))
    next(error)
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }))

app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(100),
    email: z.string().trim().email().transform((value) => value.toLowerCase()),
    universityId: z.string().trim().min(2).max(50),
    password: z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be 72 bytes or fewer.'),
  })
  const input = schema.parse(req.body)
  const allowedDomain = process.env.UNIVERSITY_EMAIL_DOMAIN?.trim().toLowerCase()
  if (allowedDomain && input.email.split('@')[1] !== allowedDomain.replace(/^@/, '')) {
    return res.status(400).json({ message: `Use your university email ending in @${allowedDomain.replace(/^@/, '')}.` })
  }
  const duplicate = await User.findOne({ $or: [{ email: input.email }, { universityId: input.universityId }] })
  if (duplicate) return res.status(409).json({ message: 'An account with that email or university ID already exists.' })
  const user = await User.create({ ...input, password: await bcrypt.hash(input.password, 12) })
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })
  res.status(201).json({ token, user: publicUser(user) })
}))

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body)
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password')
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Email or password is incorrect.' })
  if (user.accountStatus !== 'active') return res.status(403).json({ message: 'This account has been deactivated. Contact the help desk.' })
  const token = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })
  res.json({ token, user: publicUser(user) })
}))

app.post('/api/auth/forgot-password', asyncRoute(async (req, res) => {
  const { email, universityId } = z.object({ email: z.string().email(), universityId: z.string().trim().min(2) }).parse(req.body)
  const user = await User.findOne({ email: email.toLowerCase(), universityId })
  if (user) {
    const adminList = await admins()
    await Promise.all(adminList.map((admin) => notify(admin._id, 'Password help requested', `A password recovery request was submitted for campus ID ${user.universityId}. Contact the user through university channels.`, 'support')))
  }
  res.json({ message: 'If those details match an account, the campus team has been asked to help. Please contact your university help desk for identity verification.' })
}))

app.get('/api/auth/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }))
app.patch('/api/auth/profile', authenticate, asyncRoute(async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(100) }).parse(req.body)
  req.user.name = input.name
  await req.user.save()
  res.json({ user: publicUser(req.user) })
}))
app.patch('/api/auth/password', authenticate, asyncRoute(async (req, res) => {
  const input = z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be 72 bytes or fewer.'),
  }).parse(req.body)
  const user = await User.findById(req.user.id).select('+password')
  if (!(await bcrypt.compare(input.currentPassword, user.password))) return res.status(400).json({ message: 'Current password is incorrect.' })
  user.password = await bcrypt.hash(input.newPassword, 12)
  await user.save()
  res.json({ message: 'Password updated.' })
}))

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, universityId: user.universityId, role: user.role, accountStatus: user.accountStatus }
}

app.get('/api/items', asyncRoute(async (req, res) => {
  const filter = { approvalStatus: 'Approved', itemStatus: { $ne: 'Closed' } }
  if (['Lost', 'Found'].includes(req.query.type)) filter.itemType = req.query.type
  if (typeof req.query.category === 'string' && req.query.category) filter.category = req.query.category
  if (typeof req.query.location === 'string' && req.query.location) filter.location = { $regex: escapeRegex(req.query.location), $options: 'i' }
  if (req.query.from || req.query.to) filter.dateOfIncident = {}
  if (req.query.from) filter.dateOfIncident.$gte = new Date(req.query.from)
  if (req.query.to) filter.dateOfIncident.$lte = new Date(`${req.query.to}T23:59:59.999Z`)
  if (typeof req.query.search === 'string' && req.query.search.trim()) filter.$text = { $search: req.query.search.trim() }
  const requestedPage = Number(req.query.page)
  const requestedLimit = Number(req.query.limit)
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(60, Math.floor(requestedLimit)) : 24
  const [items, total] = await Promise.all([
    Item.find(filter).select(publicItemFields).populate('reportedBy', 'name').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Item.countDocuments(filter),
  ])
  res.json({ items, page, pages: Math.ceil(total / limit), total })
}))

app.get('/api/items/mine', authenticate, asyncRoute(async (req, res) => {
  const items = await Item.find({ reportedBy: req.user.id }).sort({ createdAt: -1 })
  res.json({ items })
}))

app.get('/api/items/:id', asyncRoute(async (req, res) => {
  const item = await Item.findById(req.params.id).populate('reportedBy', 'name')
  const canViewPrivateDetails = item && req.headers.authorization && await isOwnerOrAdmin(req, item)
  if (!item || (item.approvalStatus !== 'Approved' && !canViewPrivateDetails) || (item.itemStatus === 'Closed' && !canViewPrivateDetails)) {
    return res.status(404).json({ message: 'Item not found.' })
  }
  if (canViewPrivateDetails) return res.json({ item })
  const safeItem = item.toObject()
  delete safeItem.identifyingFeatures
  delete safeItem.additionalInformation
  delete safeItem.contactPreference
  delete safeItem.storageLocation
  res.json({ item: safeItem })
}))

app.post('/api/items/:id/contact', authenticate, asyncRoute(async (req, res) => {
  const item = await Item.findOne({ _id: req.params.id, itemType: 'Lost', approvalStatus: 'Approved', itemStatus: 'Active' })
  if (!item) return res.status(404).json({ message: 'This report is no longer available for contact.' })
  if (String(item.reportedBy) === req.user.id) return res.status(400).json({ message: 'This is your own report.' })
  await Promise.all([
    notify(item.reportedBy, 'Someone may have a lead', `${req.user.name} (${req.user.email}, campus ID ${req.user.universityId}) sent a private contact request about ${item.itemName}.`, 'contact', item.id),
    notify(req.user.id, 'Contact request sent', `Your private contact request about ${item.itemName} has been sent to its reporter.`, 'contact', item.id),
  ])
  res.status(201).json({ message: 'Contact request sent.' })
}))

app.post('/api/items', authenticate, upload.single('image'), verifyImage, asyncRoute(async (req, res) => {
  const input = itemInput(req.body)
  const item = await Item.create({ ...input, image: uploadUrl(req, req.file), reportedBy: req.user.id })
  const adminList = await admins()
  await Promise.all(adminList.map((admin) => notify(admin._id, 'New item report', `${req.user.name} submitted a ${input.itemType.toLowerCase()} item for review.`, 'item', item.id)))
  await notify(req.user.id, 'Report submitted', 'Your report is awaiting administrator approval.', 'item', item.id)
  res.status(201).json({ item })
}))

app.patch('/api/items/:id', authenticate, upload.single('image'), verifyImage, asyncRoute(async (req, res) => {
  const item = await Item.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Item not found.' })
  if (String(item.reportedBy) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'You can only edit your own reports.' })
  if (item.approvalStatus !== 'Pending Approval' && req.user.role !== 'admin') return res.status(400).json({ message: 'Approved reports cannot be edited.' })
  const input = itemInput(req.body, true)
  Object.assign(item, input)
  if (req.file) item.image = uploadUrl(req, req.file)
  await item.save()
  res.json({ item })
}))

app.delete('/api/items/:id', authenticate, asyncRoute(async (req, res) => {
  const item = await Item.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Item not found.' })
  if (String(item.reportedBy) !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ message: 'You can only remove your own reports.' })
  if (await Claim.exists({ itemId: item.id }) || await Handover.exists({ itemId: item.id })) {
    return res.status(409).json({ message: 'This report has claim history and cannot be removed. Close it instead.' })
  }
  if (item.image) {
    const filename = path.basename(new URL(item.image).pathname)
    await fs.promises.unlink(path.join(uploadDir, filename)).catch((error) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
  await item.deleteOne()
  res.json({ message: 'Report removed.' })
}))

app.post('/api/items/:id/claims', authenticate, evidenceUpload.single('evidence'), verifyImage, asyncRoute(async (req, res) => {
  const item = await Item.findById(req.params.id)
  if (!item || item.approvalStatus !== 'Approved' || item.itemType !== 'Found' || item.itemStatus !== 'Active') {
    return res.status(404).json({ message: 'This item is not available for a claim.' })
  }
  if (String(item.reportedBy) === req.user.id) return res.status(400).json({ message: 'You cannot claim an item you reported.' })
  const input = z.object({
    ownershipDescription: z.string().trim().min(10).max(1500),
    identifyingFeatures: z.string().trim().min(5).max(1000),
    purchaseDetails: z.string().max(1000).optional(),
    additionalRemarks: z.string().max(1000).optional(),
  }).parse(req.body)
  const active = await Claim.findOne({ itemId: item.id, claimantId: req.user.id, activeClaim: true })
  if (active) return res.status(409).json({ message: 'You already have an active claim for this item.' })
  const claim = await Claim.create({ ...input, supportingEvidence: req.file?.filename || '', itemId: item.id, claimantId: req.user.id })
  const adminList = await admins()
  await Promise.all(adminList.map((admin) => notify(admin._id, 'New item claim', `A claim was submitted for ${item.itemName}.`, 'claim', item.id)))
  await notify(req.user.id, 'Claim submitted', 'Your claim is awaiting administrator review.', 'claim', item.id)
  res.status(201).json({ claim })
}))

app.get('/api/claims/mine', authenticate, asyncRoute(async (req, res) => {
  const claims = await Claim.find({ claimantId: req.user.id }).populate('itemId').sort({ createdAt: -1 })
  res.json({ claims })
}))

app.get('/api/admin/overview', authenticate, authorize('admin'), asyncRoute(async (_req, res) => {
  const now = new Date()
  const reportStart = new Date(now.getFullYear(), now.getMonth() - 5, 1)
  const [users, lost, found, pendingClaims, returned, pendingItemsCount, pendingItems, recentItems, monthlyReports, monthlyReturns, categories] = await Promise.all([
    User.countDocuments({ role: 'student' }),
    Item.countDocuments({ itemType: 'Lost' }),
    Item.countDocuments({ itemType: 'Found' }),
    Claim.countDocuments({ claimStatus: 'Pending Review' }),
    Item.countDocuments({ itemStatus: 'Returned' }),
    Item.countDocuments({ approvalStatus: 'Pending Approval' }),
    Item.find({ approvalStatus: 'Pending Approval' }).populate('reportedBy', 'name').sort({ createdAt: -1 }).limit(5),
    Item.find().populate('reportedBy', 'name').sort({ createdAt: -1 }).limit(6),
    Item.aggregate([
      { $match: { createdAt: { $gte: reportStart } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        lost: { $sum: { $cond: [{ $eq: ['$itemType', 'Lost'] }, 1, 0] } },
        found: { $sum: { $cond: [{ $eq: ['$itemType', 'Found'] }, 1, 0] } },
      } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Handover.aggregate([
      { $match: { handoverStatus: 'Completed', handoverDate: { $gte: reportStart } } },
      { $group: { _id: { year: { $year: '$handoverDate' }, month: { $month: '$handoverDate' } }, returned: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    Item.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
  ])
  const monthlyByMonth = new Map(monthlyReports.map((entry) => [`${entry._id.year}-${entry._id.month}`, entry]))
  for (const entry of monthlyReturns) {
    const key = `${entry._id.year}-${entry._id.month}`
    monthlyByMonth.set(key, { ...(monthlyByMonth.get(key) || { _id: entry._id, lost: 0, found: 0 }), returned: entry.returned })
  }
  const monthly = [...monthlyByMonth.values()].sort((first, second) =>
    first._id.year - second._id.year || first._id.month - second._id.month,
  )
  res.json({ stats: { users, lost, found, pendingClaims, returned, pendingItems: pendingItemsCount }, pendingItems, recentItems, monthly, categories })
}))

app.get('/api/admin/items', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const filter = req.query.status ? { approvalStatus: req.query.status } : {}
  const items = await Item.find(filter).populate('reportedBy', 'name email universityId').sort({ createdAt: -1 })
  res.json({ items })
}))

app.patch('/api/admin/items/:id/review', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const { approvalStatus } = z.object({ approvalStatus: z.enum(['Approved', 'Rejected']) }).parse(req.body)
  const item = await Item.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Item not found.' })
  if (item.approvalStatus !== 'Pending Approval') return res.status(400).json({ message: 'Only pending reports can be reviewed.' })
  item.approvalStatus = approvalStatus
  await item.save()
  await notify(item.reportedBy, `Report ${approvalStatus.toLowerCase()}`, `Your ${item.itemType.toLowerCase()} report for ${item.itemName} was ${approvalStatus.toLowerCase()}.`, 'item', item.id)
  res.json({ item })
}))

app.patch('/api/admin/items/:id/status', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const { itemStatus } = z.object({ itemStatus: z.enum(['Active', 'Closed']) }).parse(req.body)
  const item = await Item.findById(req.params.id)
  if (!item) return res.status(404).json({ message: 'Item not found.' })
  if (['Awaiting Collection', 'Returned'].includes(item.itemStatus)) {
    return res.status(400).json({ message: 'Collection and returned statuses are managed by the Help Desk workflow.' })
  }
  item.itemStatus = itemStatus
  await item.save()
  res.json({ item })
}))

app.get('/api/admin/claims', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const filter = req.query.status ? { claimStatus: req.query.status } : {}
  const claims = await Claim.find(filter).populate('itemId').populate('claimantId', 'name email universityId').sort({ createdAt: -1 })
  res.json({ claims })
}))

app.get('/api/admin/claims/:id/evidence', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const claim = await Claim.findById(req.params.id).select('supportingEvidence')
  if (!claim || !claim.supportingEvidence) return res.status(404).json({ message: 'No supporting evidence was uploaded.' })
  res.sendFile(path.join(evidenceDir, path.basename(claim.supportingEvidence)))
}))

app.patch('/api/admin/claims/:id/review', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const { claimStatus, adminRemarks = '' } = z.object({
    claimStatus: z.enum(['Approved', 'Rejected']),
    adminRemarks: z.string().max(1000).optional(),
  }).parse(req.body)
  const claim = await Claim.findById(req.params.id).populate('itemId')
  if (!claim) return res.status(404).json({ message: 'Claim not found.' })
  if (claim.claimStatus !== 'Pending Review') return res.status(400).json({ message: 'Only pending claims can be reviewed.' })
  let reservedItem
  if (claimStatus === 'Approved') {
    reservedItem = await Item.findOneAndUpdate(
      { _id: claim.itemId.id, approvalStatus: 'Approved', itemType: 'Found', itemStatus: 'Active' },
      { itemStatus: 'Awaiting Collection' },
      { new: true },
    )
    if (!reservedItem) return res.status(409).json({ message: 'This item already has an approved claim or is no longer available.' })
  }
  const updatedClaim = await Claim.findOneAndUpdate(
    { _id: claim.id, claimStatus: 'Pending Review', activeClaim: true },
    { claimStatus, adminRemarks, reviewedBy: req.user.id, ...(claimStatus === 'Rejected' ? { activeClaim: false } : {}) },
    { new: true, runValidators: true },
  )
  if (!updatedClaim) {
    if (reservedItem) await Item.findOneAndUpdate({ _id: reservedItem.id, itemStatus: 'Awaiting Collection' }, { itemStatus: 'Active' })
    return res.status(409).json({ message: 'This claim has already been reviewed.' })
  }
  if (claimStatus === 'Approved') {
    try {
      await Handover.create({ itemId: claim.itemId.id, claimId: claim.id, claimantId: claim.claimantId, verifiedBy: req.user.id })
    } catch (error) {
      await Promise.all([
        Claim.findOneAndUpdate({ _id: claim.id, claimStatus: 'Approved', reviewedBy: req.user.id }, { claimStatus: 'Pending Review', adminRemarks: '', reviewedBy: null }),
        Item.findOneAndUpdate({ _id: claim.itemId.id, itemStatus: 'Awaiting Collection' }, { itemStatus: 'Active' }),
      ])
      throw error
    }
    await notify(claim.claimantId, 'Item ready for collection', `Your claim for ${claim.itemId.itemName} was approved. Visit the campus help desk to collect it.`, 'claim', claim.itemId.id)
  } else {
    await notify(claim.claimantId, 'Claim update', `Your claim for ${claim.itemId.itemName} was not approved.${adminRemarks ? ` Note: ${adminRemarks}` : ''}`, 'claim', claim.itemId.id)
  }
  res.json({ claim: updatedClaim })
}))

app.get('/api/admin/users', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const filter = { role: { $ne: 'admin' } }
  if (req.query.search) filter.$or = ['name', 'email', 'universityId'].map((field) => ({ [field]: { $regex: escapeRegex(req.query.search), $options: 'i' } }))
  const users = await User.find(filter).select('-password').sort({ createdAt: -1 }).limit(100)
  res.json({ users })
}))

app.patch('/api/admin/users/:id', authenticate, authorize('admin'), asyncRoute(async (req, res) => {
  const input = z.object({
    accountStatus: z.enum(['active', 'inactive']).optional(),
    role: z.enum(['student', 'admin', 'helpdesk']).optional(),
  }).refine((value) => Object.keys(value).length > 0).parse(req.body)
  const user = await User.findByIdAndUpdate(req.params.id, input, { new: true, runValidators: true })
  if (!user) return res.status(404).json({ message: 'User not found.' })
  res.json({ user: publicUser(user) })
}))

app.get('/api/helpdesk/handovers', authenticate, authorize('helpdesk'), asyncRoute(async (_req, res) => {
  const handovers = await Handover.find().populate('itemId').populate('claimantId', 'name email universityId').sort({ updatedAt: -1 })
  res.json({ handovers })
}))

app.patch('/api/helpdesk/handovers/:id/complete', authenticate, authorize('helpdesk'), asyncRoute(async (req, res) => {
  const { remarks = '' } = z.object({ remarks: z.string().max(1000) }).parse(req.body)
  const handover = await Handover.findById(req.params.id).populate('itemId')
  if (!handover) return res.status(404).json({ message: 'Handover not found.' })
  if (handover.handoverStatus !== 'Awaiting Collection') return res.status(400).json({ message: 'This handover is already complete.' })
  handover.handoverStatus = 'Completed'
  handover.remarks = remarks
  handover.verifiedBy = req.user.id
  handover.handoverDate = new Date()
  await handover.save()
  await Promise.all([
    Claim.findByIdAndUpdate(handover.claimId, { claimStatus: 'Completed', activeClaim: false }),
    Item.findByIdAndUpdate(handover.itemId.id, { itemStatus: 'Returned' }),
    notify(handover.claimantId, 'Item returned', `${handover.itemId.itemName} has been marked as collected.`, 'handover', handover.itemId.id),
  ])
  res.json({ handover })
}))

app.get('/api/notifications', authenticate, asyncRoute(async (req, res) => {
  const notifications = await Notification.find({ recipientId: req.user.id }).sort({ createdAt: -1 }).limit(50)
  res.json({ notifications, unread: notifications.filter((notification) => !notification.isRead).length })
}))
app.patch('/api/notifications/:id/read', authenticate, asyncRoute(async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipientId: req.user.id }, { isRead: true }, { new: true })
  if (!notification) return res.status(404).json({ message: 'Notification not found.' })
  res.json({ notification })
}))
app.patch('/api/notifications/read-all', authenticate, asyncRoute(async (req, res) => {
  await Notification.updateMany({ recipientId: req.user.id, isRead: false }, { isRead: true })
  res.json({ message: 'Notifications marked as read.' })
}))

function itemInput(body, partial = false) {
  const shape = {
    itemName: z.string().trim().min(2).max(120),
    category: z.enum(['Electronics', 'Books and Stationery', 'Identity Cards', 'Clothing and Accessories', 'Keys', 'Sports Equipment', 'Bags and Wallets', 'Other']),
    description: z.string().trim().min(10).max(2000),
    itemType: z.enum(['Lost', 'Found']),
    dateOfIncident: z.coerce.date().refine((date) => date <= new Date(), 'Incident date cannot be in the future.'),
    location: z.string().trim().min(2).max(200),
    identifyingFeatures: z.string().max(1000).optional(),
    additionalInformation: z.string().max(1000).optional(),
    contactPreference: z.string().max(100).optional(),
    storageLocation: z.string().max(200).optional(),
  }
  const schema = z.object(shape)
  return (partial ? schema.partial() : schema).parse(body)
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function isOwnerOrAdmin(req, item) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  if (!token) return false
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const reporterId = item.reportedBy?._id || item.reportedBy
    return String(reporterId) === payload.sub || Boolean(await User.exists({ _id: payload.sub, role: 'admin', accountStatus: 'active' }))
  } catch {
    return false
  }
}

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ message: error.issues.map((issue) => issue.message).join(' ') })
  if (error instanceof multer.MulterError) return res.status(400).json({ message: error.code === 'LIMIT_FILE_SIZE' ? 'Images must be 5 MB or smaller.' : error.message })
  if (error.name === 'CastError') return res.status(400).json({ message: 'Invalid record ID.' })
  if (error.code === 11000) {
    if (error.keyPattern?.itemId) return res.status(409).json({ message: 'You already have an active claim for this item.' })
    return res.status(409).json({ message: 'That email or university ID is already registered.' })
  }
  if (error.message?.startsWith('Upload a ')) return res.status(400).json({ message: error.message })
  console.error(error)
  res.status(500).json({ message: 'An unexpected server error occurred.' })
})

async function startServer() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required. Copy server/.env.example to server/.env and configure it.')
  const dnsServers = process.env.MONGODB_DNS_SERVERS?.split(',').map((server) => server.trim()).filter(Boolean)
  if (dnsServers?.length) dns.setServers(dnsServers)
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/unifind')
  const port = Number(process.env.PORT) || 5000
  return app.listen(port, () => console.log(`UniFind API listening on http://localhost:${port}`))
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Could not start UniFind API:', error.message)
    process.exit(1)
  })
}

module.exports = { app, startServer }
