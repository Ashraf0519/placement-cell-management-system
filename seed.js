// Fills the database with sample data for demonstration. Safe to run more than once.
// Student login for every sample student: <rollno in lowercase>@college.edu / Student@123
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/placement_cell';

const students = [
  ['24071A6909', 'Aarav Reddy', 'CSE', 8.7, 'HTML, CSS, JavaScript, Node.js'],
  ['24071A6932', 'Sneha Rao', 'CSE', 9.1, 'JavaScript, MongoDB, Express'],
  ['24071A6953', 'Karthik Varma', 'IT', 7.4, 'HTML, CSS, Docker'],
  ['24071A6902', 'Priya Sharma', 'CSE', 8.2, 'Node.js, REST APIs'],
  ['24071A6937', 'Rohan Kumar', 'IT', 6.6, 'HTML, CSS, JavaScript'],
  ['24071A6918', 'Divya Nair', 'CSE', 8.9, 'MongoDB, Node.js, Docker']
];
const day = 24 * 3600 * 1000, now = new Date();
const drives = [
  ['TCS', 'Software Developer', 7.0, 'Hyderabad', 7.0, 10, 20, 'Full-stack role working on web applications.'],
  ['Infosys', 'Systems Engineer', 4.5, 'Bengaluru', 6.0, 25, 30, 'Entry-level engineering role with training program.'],
  ['Wipro', 'Backend Engineer', 6.0, 'Pune', 7.5, 5, 15, 'Node.js and MongoDB backend development.'],
  ['Deloitte', 'Associate Analyst', 8.5, 'Hyderabad', 8.0, 3, 25, 'Technology consulting and analytics.']
];
// [roll, company, status]
const apps = [
  ['24071A6909', 'TCS', 'Selected'], ['24071A6909', 'Wipro', 'Shortlisted'],
  ['24071A6932', 'TCS', 'Selected'], ['24071A6932', 'Deloitte', 'Applied'],
  ['24071A6953', 'Infosys', 'Applied'], ['24071A6953', 'TCS', 'Rejected'],
  ['24071A6902', 'Wipro', 'Applied'], ['24071A6918', 'Deloitte', 'Shortlisted']
];

(async () => {
  await mongoose.connect(URI);
  const db = mongoose.connection;
  const U = db.collection('users'), D = db.collection('drives'), A = db.collection('applications');
  const stamp = { createdAt: now, updatedAt: now, __v: 0 };
  const hash = await bcrypt.hash('Student@123', 10);
  const sid = {}, did = {};
  for (const [roll, name, branch, cgpa, skills] of students) {
    const email = roll.toLowerCase() + '@college.edu';
    await U.updateOne({ email }, { $setOnInsert: { name, email, rollNo: roll, password: hash, role: 'student', branch, cgpa, phone: '9876543210', skills, ...stamp } }, { upsert: true });
    sid[roll] = (await U.findOne({ email }))._id;
  }
  for (const [company, role, pkg, location, minCgpa, openings, days, description] of drives) {
    await D.updateOne({ company, role }, { $setOnInsert: { company, role, package: pkg, location, description, minCgpa, openings, deadline: new Date(now.getTime() + days * day), ...stamp } }, { upsert: true });
    did[company] = (await D.findOne({ company, role }))._id;
  }
  for (const [roll, company, status] of apps) {
    await A.updateOne({ student: sid[roll], drive: did[company] }, { $setOnInsert: { student: sid[roll], drive: did[company], status, ...stamp } }, { upsert: true });
  }
  console.log(`Seeded: ${await U.countDocuments({ role: 'student' })} students, ${await D.countDocuments()} drives, ${await A.countDocuments()} applications`);
  await mongoose.disconnect();
})().catch(e => { console.error('Seed failed:', e.message); process.exit(1); });
