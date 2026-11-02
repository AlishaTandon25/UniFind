require('dotenv').config()
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const { User } = require('./models')

async function seed() {
  if (!process.env.MONGODB_URI) throw new Error('Set MONGODB_URI in server/.env before seeding.')
  const accounts = [
    { name: 'UniFind Administrator', email: 'admin@unifind.edu', universityId: 'UF-ADMIN-001', password: process.env.SEED_ADMIN_PASSWORD, role: 'admin' },
    { name: 'Campus Help Desk', email: 'helpdesk@unifind.edu', universityId: 'UF-HELP-001', password: process.env.SEED_HELPDESK_PASSWORD, role: 'helpdesk' },
    { name: 'Demo Student', email: 'student@unifind.edu', universityId: 'UF-STUDENT-001', password: process.env.SEED_STUDENT_PASSWORD, role: 'student' },
  ]
  if (accounts.some((account) => !account.password)) {
    throw new Error('Set SEED_ADMIN_PASSWORD, SEED_HELPDESK_PASSWORD, and SEED_STUDENT_PASSWORD in server/.env before seeding.')
  }
  await mongoose.connect(process.env.MONGODB_URI)
  for (const account of accounts) {
    const password = await bcrypt.hash(account.password, 12)
    await User.findOneAndUpdate({ email: account.email }, { ...account, password, accountStatus: 'active' }, { upsert: true, new: true, runValidators: true })
  }
  console.log('Demo accounts seeded. Change these passwords before any public deployment.')
  await mongoose.disconnect()
}

seed().catch(async (error) => {
  console.error(error)
  await mongoose.disconnect()
  process.exit(1)
})
