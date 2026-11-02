process.env.JWT_SECRET = 'test-secret-with-sufficient-length'

const assert = require('node:assert/strict')
const { afterEach, test } = require('node:test')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const mockingoose = require('mockingoose').default
const mongoose = require('mongoose')
const request = require('supertest')
const { app } = require('../src/server')
const { User, Item, Claim, Notification, Handover } = require('../src/models')

const ids = {
  student: '507f1f77bcf86cd799439011',
  admin: '507f1f77bcf86cd799439012',
  item: '507f1f77bcf86cd799439013',
}
const testPassword = 'TestPassword123!'
const users = {
  student: {
    _id: ids.student,
    name: 'Test Student',
    email: 'student@unifind.test',
    universityId: 'UF-STUDENT-1',
    role: 'student',
    accountStatus: 'active',
  },
  admin: {
    _id: ids.admin,
    name: 'Test Administrator',
    email: 'admin@unifind.test',
    universityId: 'UF-ADMIN-1',
    role: 'admin',
    accountStatus: 'active',
  },
}

function tokenFor(user) {
  return jwt.sign({ sub: user._id }, process.env.JWT_SECRET)
}

function mockUserLookups(accounts) {
  mockingoose(User).toReturn((query) => {
    const filter = query.getQuery()
    return accounts.find((user) =>
      (filter._id && String(filter._id) === user._id)
      || (filter.email && filter.email === user.email)
      || (filter.universityId && filter.universityId === user.universityId),
    ) || null
  }, 'findOne')
  mockingoose(User).toReturn(accounts.filter((user) => user.role === 'admin'), 'find')
}

function itemDocument(overrides = {}) {
  return {
    _id: ids.item,
    itemName: 'Blue water bottle',
    category: 'Other',
    description: 'Blue bottle with a distinctive sticker.',
    itemType: 'Found',
    dateOfIncident: new Date('2026-10-28T00:00:00.000Z'),
    location: 'Main library',
    identifyingFeatures: 'Hidden initials on the base',
    additionalInformation: 'Near the north entrance.',
    contactPreference: 'In-app message',
    storageLocation: 'Campus help desk cabinet 2',
    image: '',
    reportedBy: ids.student,
    approvalStatus: 'Approved',
    itemStatus: 'Active',
    ...overrides,
  }
}

afterEach(() => mockingoose.resetAll())

test('health endpoint reports API and current database state', async () => {
  const response = await request(app).get('/api/health').expect(200)
  assert.deepEqual(response.body, { status: 'ok', database: 'disconnected' })
})

test('registration validates input, creates student-only accounts, and returns a JWT', async () => {
  const account = { ...users.student, name: 'New Student', email: 'new@unifind.test', password: 'hashed-password' }
  mockingoose(User).toReturn(null, 'findOne')
  mockingoose(User).toReturn(account, 'save')

  const response = await request(app).post('/api/auth/register').send({
    name: '  New Student  ',
    email: 'NEW@UNIFIND.TEST',
    universityId: 'UF-NEW-1',
    password: testPassword,
    role: 'admin',
  }).expect(201)

  assert.equal(response.body.user.role, 'student')
  assert.equal(response.body.user.name, 'New Student')
  assert.equal(response.body.user.email, 'new@unifind.test')
  assert.equal(response.body.user.password, undefined)
  assert.equal(jwt.verify(response.body.token, process.env.JWT_SECRET).sub, response.body.user.id)

  mockingoose.resetAll()
  mockingoose(User).toReturn(account, 'findOne')
  await request(app).post('/api/auth/register').send({
    name: 'Duplicate Student',
    email: 'new@unifind.test',
    universityId: 'UF-NEW-2',
    password: testPassword,
  }).expect(409)

  await request(app).post('/api/auth/register').send({
    name: 'A',
    email: 'not-an-email',
    universityId: 'x',
    password: 'short',
  }).expect(400)
})

test('login, current-user lookup, profile updates, and role authorization work', async () => {
  const passwordHash = await bcrypt.hash(testPassword, 4)
  mockUserLookups([
    { ...users.student, password: passwordHash },
    users.admin,
  ])

  const login = await request(app).post('/api/auth/login')
    .send({ email: 'STUDENT@UNIFIND.TEST', password: testPassword })
    .expect(200)
  assert.equal(login.body.user.email, users.student.email)
  await request(app).get('/api/auth/me')
    .set('Authorization', `Bearer ${login.body.token}`)
    .expect(200)
  await request(app).get('/api/auth/me').expect(401)
  await request(app).get('/api/admin/overview')
    .set('Authorization', `Bearer ${login.body.token}`)
    .expect(403)

  await request(app).patch('/api/auth/profile')
    .set('Authorization', `Bearer ${login.body.token}`)
    .send({ name: 'Updated Student' })
    .expect(200)
})

test('public item details hide private fields and contact requests require authentication', async () => {
  mockingoose(Item).toReturn(itemDocument(), 'findOne')
  mockingoose(User).toReturn({ ...users.student }, 'find')

  const publicResponse = await request(app).get(`/api/items/${ids.item}`).expect(200)
  assert.equal(publicResponse.body.item.identifyingFeatures, undefined)
  assert.equal(publicResponse.body.item.additionalInformation, undefined)
  assert.equal(publicResponse.body.item.contactPreference, undefined)
  assert.equal(publicResponse.body.item.storageLocation, undefined)

  await request(app).post(`/api/items/${ids.item}/contact`).expect(401)
})

test('report submission, moderation, and lost-item contact requests are exercised', async () => {
  const submittedItem = itemDocument({ approvalStatus: 'Pending Approval' })
  mockUserLookups([users.student, users.admin])
  mockingoose(Item).toReturn(submittedItem, 'save')
  mockingoose(Notification).toReturn({ _id: ids.item, recipientId: ids.admin, title: 'Update', message: 'Test' }, 'save')

  const created = await request(app).post('/api/items')
    .set('Authorization', `Bearer ${tokenFor(users.student)}`)
    .field('itemName', 'Blue water bottle')
    .field('category', 'Other')
    .field('description', 'Blue bottle with a distinctive sticker.')
    .field('itemType', 'Found')
    .field('dateOfIncident', '2026-10-28')
    .field('location', 'Main library')
    .field('additionalInformation', 'Near the north entrance.')
    .expect(201)
  assert.equal(created.body.item.approvalStatus, 'Pending Approval')
  assert.equal(created.body.item.additionalInformation, 'Near the north entrance.')

  mockingoose(Item).toReturn(submittedItem, 'findOne')
  const reviewed = await request(app).patch(`/api/admin/items/${ids.item}/review`)
    .set('Authorization', `Bearer ${tokenFor(users.admin)}`)
    .send({ approvalStatus: 'Approved' })
    .expect(200)
  assert.equal(reviewed.body.item.approvalStatus, 'Approved')

  await request(app).patch(`/api/admin/items/${ids.item}/review`)
    .set('Authorization', `Bearer ${tokenFor(users.student)}`)
    .send({ approvalStatus: 'Rejected' })
    .expect(403)

  mockingoose(Item).toReturn(itemDocument({ itemType: 'Lost', reportedBy: ids.student }), 'findOne')
  const contact = await request(app).post(`/api/items/${ids.item}/contact`)
    .set('Authorization', `Bearer ${tokenFor(users.admin)}`)
    .expect(201)
  assert.equal(contact.body.message, 'Contact request sent.')
  await request(app).post(`/api/items/${ids.item}/contact`)
    .set('Authorization', `Bearer ${tokenFor(users.student)}`)
    .expect(400)
})

test('claim submission requires a valid claimant and an available found item', async () => {
  mockUserLookups([users.student, users.admin])
  mockingoose(Item).toReturn(itemDocument(), 'findOne')
  mockingoose(Claim).toReturn(null, 'findOne')
  mockingoose(Claim).toReturn({
    _id: ids.item,
    itemId: ids.item,
    claimantId: ids.admin,
    ownershipDescription: 'This bottle belongs to me and has a blue sticker.',
    identifyingFeatures: 'My initials are marked on the base.',
    claimStatus: 'Pending Review',
  }, 'save')
  mockingoose(Notification).toReturn({
    _id: ids.item,
    recipientId: ids.admin,
    title: 'Claim update',
    message: 'A claim was received.',
  }, 'save')

  const claim = await request(app).post(`/api/items/${ids.item}/claims`)
    .set('Authorization', `Bearer ${tokenFor(users.admin)}`)
    .send({
      ownershipDescription: 'This bottle belongs to me and has a blue sticker.',
      identifyingFeatures: 'My initials are marked on the base.',
    })
    .expect(201)
  assert.equal(claim.body.claim.claimStatus, 'Pending Review')

  await request(app).post(`/api/items/${ids.item}/claims`)
    .send({
      ownershipDescription: 'This bottle belongs to me and has a blue sticker.',
      identifyingFeatures: 'My initials are marked on the base.',
    })
    .expect(401)
})

test('approved claims reserve found items for help-desk collection', async () => {
  const pendingClaim = {
    _id: ids.item,
    itemId: ids.item,
    claimantId: ids.student,
    claimStatus: 'Pending Review',
    activeClaim: true,
  }
  const item = itemDocument()
  mockUserLookups([users.admin, users.student])
  mockingoose(Item).toReturn(item, 'findOne')
  mockingoose(Item).toReturn({ ...item, itemStatus: 'Awaiting Collection' }, 'findOneAndUpdate')
  mockingoose(Claim).toReturn(pendingClaim, 'findOne')
  mockingoose(Claim).toReturn({ ...pendingClaim, claimStatus: 'Approved' }, 'findOneAndUpdate')
  mockingoose(Handover).toReturn({
    _id: ids.item,
    itemId: ids.item,
    claimId: ids.item,
    claimantId: ids.student,
    verifiedBy: ids.admin,
    handoverStatus: 'Awaiting Collection',
  }, 'save')
  mockingoose(Notification).toReturn({
    _id: ids.item,
    recipientId: ids.student,
    title: 'Item ready for collection',
    message: 'Your claim was approved.',
  }, 'save')

  const response = await request(app).patch(`/api/admin/claims/${ids.item}/review`)
    .set('Authorization', `Bearer ${tokenFor(users.admin)}`)
    .send({ claimStatus: 'Approved' })
  assert.equal(response.status, 200, response.body.message)
  assert.equal(response.body.claim.claimStatus, 'Approved')
})

test('help-desk completion requires its role and completes the handover', async () => {
  const handover = {
    _id: ids.item,
    itemId: ids.item,
    claimId: ids.item,
    claimantId: ids.student,
    verifiedBy: ids.admin,
    handoverStatus: 'Awaiting Collection',
  }
  mockUserLookups([users.student, { ...users.admin, role: 'helpdesk' }])
  mockingoose(Item).toReturn(itemDocument(), 'findOne')
  mockingoose(User).toReturn([{ ...users.student }], 'find')
  mockingoose(Handover).toReturn(handover, 'findOne')
  mockingoose(Handover).toReturn({ ...handover, handoverStatus: 'Completed' }, 'save')
  mockingoose(Claim).toReturn({ _id: ids.item }, 'findOneAndUpdate')
  mockingoose(Item).toReturn({ ...itemDocument(), itemStatus: 'Returned' }, 'findOneAndUpdate')
  mockingoose(Notification).toReturn({
    _id: ids.item,
    recipientId: ids.student,
    title: 'Item returned',
    message: 'Your item was collected.',
  }, 'save')

  await request(app).patch(`/api/helpdesk/handovers/${ids.item}/complete`)
    .set('Authorization', `Bearer ${tokenFor(users.student)}`)
    .send({})
    .expect(403)
  const response = await request(app).patch(`/api/helpdesk/handovers/${ids.item}/complete`)
    .set('Authorization', `Bearer ${tokenFor({ ...users.admin, role: 'helpdesk' })}`)
    .send({ remarks: 'Campus ID verified.' })
    .expect(200)
  assert.equal(response.body.handover.handoverStatus, 'Completed')
})

test('notification access is restricted to the recipient', async () => {
  const notification = {
    _id: ids.item,
    recipientId: new mongoose.Types.ObjectId(ids.student),
    title: 'Private update',
    message: 'A private message.',
    isRead: false,
  }
  mockUserLookups([users.student, users.admin])
  mockingoose(Notification).toReturn((query) => {
    const filter = query.getQuery()
    return String(filter.recipientId) === ids.student ? notification : null
  }, 'findOneAndUpdate')

  await request(app).patch(`/api/notifications/${ids.item}/read`)
    .set('Authorization', `Bearer ${tokenFor(users.admin)}`)
    .expect(404)
  await request(app).patch(`/api/notifications/${ids.item}/read`)
    .set('Authorization', `Bearer ${tokenFor(users.student)}`)
    .expect(200)
})
