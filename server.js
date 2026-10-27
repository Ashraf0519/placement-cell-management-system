// Placement Cell Management System - Node.js + Express + MongoDB (Mongoose)
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_cell';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@placement.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';

/* ---------- Models ---------- */
const User = mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  rollNo: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'admin'], default: 'student' },
  branch: { type: String, trim: true, default: '' },
  cgpa: { type: Number, min: 0, max: 10 },
  phone: { type: String, trim: true, default: '' },
  skills: { type: String, trim: true, default: '' },
  placementStatus: { type: String, enum: ['Not Placed', 'Placed'], default: 'Not Placed' },
  placedCompany: { type: String, default: '' }
}, { timestamps: true }));

const Drive = mongoose.model('Drive', new mongoose.Schema({
  company: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  package: { type: Number, required: true, min: 0 },      // LPA
  location: { type: String, trim: true, default: '' },
  description: { type: String, trim: true, default: '' },
  minCgpa: { type: Number, min: 0, max: 10, default: 0 },
  openings: { type: Number, min: 1, default: 1 },
  deadline: { type: Date, required: true }
}, { timestamps: true }));

const appSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  drive: { type: mongoose.Schema.Types.ObjectId, ref: 'Drive', required: true },
  status: { type: String, enum: ['Applied', 'Shortlisted', 'Selected', 'Rejected'], default: 'Applied' },
  // readable copies so the record makes sense when viewed in Mongo Express
  studentName: String, rollNo: String, company: String, role: String
}, { timestamps: true });
appSchema.index({ student: 1, drive: 1 }, { unique: true });
const Application = mongoose.model('Application', appSchema);

/* ---------- Keep the database readable ---------- */
async function syncPlacement(studentId) {
  const sel = await Application.findOne({ student: studentId, status: 'Selected' });
  await User.updateOne({ _id: studentId }, sel
    ? { placementStatus: 'Placed', placedCompany: sel.company || '' }
    : { placementStatus: 'Not Placed', placedCompany: '' });
}
async function backfill() {
  const apps = await Application.find().populate('student', 'name rollNo').populate('drive', 'company role');
  for (const a of apps) {
    if (!a.student || !a.drive) continue;
    await Application.updateOne({ _id: a._id }, { studentName: a.student.name, rollNo: a.student.rollNo, company: a.drive.company, role: a.drive.role });
  }
  for (const u of await User.find({ role: 'student' }, '_id')) await syncPlacement(u._id);
}

/* ---------- App + helpers ---------- */
const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fail = (res, code, msg) => res.status(code).json({ error: msg });
const clean = u => ({ id: u._id, name: u.name, email: u.email, rollNo: u.rollNo, role: u.role,
  branch: u.branch, cgpa: u.cgpa, phone: u.phone, skills: u.skills,
  placementStatus: u.placementStatus, placedCompany: u.placedCompany });

const auth = role => wrap(async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) return fail(res, 401, 'Please log in first.');
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { return fail(res, 401, 'Session expired. Please log in again.'); }
  const user = await User.findById(payload.id);
  if (!user) return fail(res, 401, 'Account not found.');
  if (role && user.role !== role) return fail(res, 403, 'You do not have access to this action.');
  req.user = user; next();
});

const setCookie = (res, user) => res.cookie('token', jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' }),
  { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });

const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
const isId = id => mongoose.isValidObjectId(id);

/* ---------- Auth ---------- */
app.post('/api/register', wrap(async (req, res) => {
  const { name, email, rollNo, password, branch } = req.body;
  if (!name || name.trim().length < 2) return fail(res, 400, 'Enter your full name.');
  if (!isEmail(email)) return fail(res, 400, 'Enter a valid email address.');
  if (!rollNo || !/^[0-9A-Za-z]{6,15}$/.test(rollNo.trim())) return fail(res, 400, 'Enter a valid roll number (letters and digits only).');
  if (!password || password.length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
  if (await User.findOne({ email: email.toLowerCase().trim() })) return fail(res, 409, 'This email is already registered.');
  if (await User.findOne({ rollNo: rollNo.trim().toUpperCase() })) return fail(res, 409, 'This roll number is already registered.');
  const user = await User.create({ name, email, rollNo, branch, role: 'student', password: await bcrypt.hash(password, 10) });
  setCookie(res, user);
  res.status(201).json({ user: clean(user) });
}));

app.post('/api/login', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return fail(res, 400, 'Enter your email and password.');
  const user = await User.findOne({ email: String(email).toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.password))) return fail(res, 401, 'Incorrect email or password.');
  setCookie(res, user);
  res.json({ user: clean(user) });
}));

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/me', auth(), (req, res) => res.json({ user: clean(req.user) }));

app.put('/api/me', auth('student'), wrap(async (req, res) => {
  const { name, branch, cgpa, phone, skills } = req.body;
  if (name !== undefined && name.trim().length < 2) return fail(res, 400, 'Enter your full name.');
  if (cgpa !== undefined && cgpa !== '' && (isNaN(cgpa) || cgpa < 0 || cgpa > 10)) return fail(res, 400, 'CGPA must be between 0 and 10.');
  if (phone && !/^[0-9+\- ]{8,15}$/.test(phone)) return fail(res, 400, 'Enter a valid phone number.');
  Object.assign(req.user, { name: name ?? req.user.name, branch: branch ?? '', phone: phone ?? '', skills: skills ?? '',
    cgpa: cgpa === '' || cgpa === undefined ? undefined : Number(cgpa) });
  await req.user.save();
  await Application.updateMany({ student: req.user._id }, { studentName: req.user.name });
  res.json({ user: clean(req.user) });
}));

/* ---------- Drives ---------- */
app.get('/api/drives', auth(), wrap(async (req, res) => {
  res.json({ drives: await Drive.find().sort({ deadline: 1 }) });
}));

app.post('/api/drives', auth('admin'), wrap(async (req, res) => {
  const { company, role, package: pkg, location, description, minCgpa, openings, deadline } = req.body;
  if (!company || !role) return fail(res, 400, 'Company and role are required.');
  if (pkg === '' || pkg === undefined || isNaN(pkg) || pkg < 0) return fail(res, 400, 'Enter a valid package in LPA.');
  if (!deadline || isNaN(Date.parse(deadline))) return fail(res, 400, 'Choose a valid deadline.');
  const drive = await Drive.create({ company, role, package: Number(pkg), location, description,
    minCgpa: Number(minCgpa) || 0, openings: Number(openings) || 1, deadline });
  res.status(201).json({ drive });
}));

app.delete('/api/drives/:id', auth('admin'), wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'Invalid drive.');
  const affected = await Application.distinct('student', { drive: req.params.id });
  await Drive.findByIdAndDelete(req.params.id);
  await Application.deleteMany({ drive: req.params.id });
  for (const id of affected) await syncPlacement(id);
  res.json({ ok: true });
}));

/* ---------- Applications ---------- */
app.post('/api/drives/:id/apply', auth('student'), wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'Invalid drive.');
  const drive = await Drive.findById(req.params.id);
  if (!drive) return fail(res, 404, 'This drive no longer exists.');
  if (await Application.exists({ student: req.user._id, status: 'Selected' }))
    return fail(res, 403, 'You are already selected (placed), so you cannot apply to more drives. This keeps the chance open for other students.');
  if (new Date(drive.deadline) < new Date(new Date().toDateString())) return fail(res, 400, 'The deadline for this drive has passed.');
  if (drive.minCgpa > 0 && req.user.cgpa === undefined) return fail(res, 400, 'Add your CGPA in Profile before applying.');
  if (req.user.cgpa < drive.minCgpa) return fail(res, 400, `This drive needs a minimum CGPA of ${drive.minCgpa}.`);
  try { await Application.create({ student: req.user._id, drive: drive._id, studentName: req.user.name, rollNo: req.user.rollNo, company: drive.company, role: drive.role }); }
  catch (e) { if (e.code === 11000) return fail(res, 409, 'You have already applied to this drive.'); throw e; }
  res.status(201).json({ ok: true });
}));

app.get('/api/applications/mine', auth('student'), wrap(async (req, res) => {
  const applications = await Application.find({ student: req.user._id }).populate('drive').sort({ createdAt: -1 });
  res.json({ applications: applications.filter(a => a.drive) });
}));

app.get('/api/applications', auth('admin'), wrap(async (req, res) => {
  const applications = await Application.find().populate('student', 'name email rollNo branch cgpa').populate('drive', 'company role').sort({ createdAt: -1 });
  res.json({ applications: applications.filter(a => a.student && a.drive) });
}));

app.put('/api/applications/:id', auth('admin'), wrap(async (req, res) => {
  if (!isId(req.params.id)) return fail(res, 400, 'Invalid application.');
  if (!['Applied', 'Shortlisted', 'Selected', 'Rejected'].includes(req.body.status)) return fail(res, 400, 'Invalid status.');
  const a = await Application.findById(req.params.id);
  if (!a) return fail(res, 404, 'Application not found.');
  if (req.body.status === 'Selected' && await Application.exists({ student: a.student, status: 'Selected', _id: { $ne: a._id } }))
    return fail(res, 400, 'This student is already selected in another drive.');
  a.status = req.body.status;
  await a.save();
  await syncPlacement(a.student);
  res.json({ application: a });
}));

/* ---------- Admin ---------- */
app.get('/api/students', auth('admin'), wrap(async (req, res) => {
  res.json({ students: (await User.find({ role: 'student' }).sort({ rollNo: 1 })).map(clean) });
}));

app.get('/api/stats', auth('admin'), wrap(async (req, res) => {
  const [students, drives, applications, selected] = await Promise.all([
    User.countDocuments({ role: 'student' }), Drive.countDocuments(), Application.countDocuments(),
    Application.countDocuments({ status: 'Selected' })]);
  res.json({ students, drives, applications, selected });
}));

/* ---------- Errors ---------- */
app.use('/api', (req, res) => fail(res, 404, 'Not found.'));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.name === 'ValidationError') return fail(res, 400, Object.values(err.errors)[0].message);
  fail(res, 500, 'Something went wrong on the server. Try again.');
});

/* ---------- Start ---------- */
async function seedAdmin() {
  if (!(await User.findOne({ email: ADMIN_EMAIL }))) {
    await User.create({ name: 'Placement Officer', email: ADMIN_EMAIL, role: 'admin', password: await bcrypt.hash(ADMIN_PASSWORD, 10) });
    console.log(`Admin created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  }
}
mongoose.connect(MONGO_URI).then(async () => {
  await User.init(); await Application.init();
  await seedAdmin();
  await backfill();
  app.listen(PORT, () => console.log(`Running at http://localhost:${PORT}`));
}).catch(e => { console.error('MongoDB connection failed:', e.message); process.exit(1); });
