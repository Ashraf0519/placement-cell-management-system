# Placement Cell Management System
Stack: HTML/CSS/JS (client) • Node.js + Express (REST API) • MongoDB (Mongoose) • Docker

## Run
    docker compose up --build
- Website:        http://localhost:3000
- Database viewer: http://localhost:8081   (login: admin / admin123)

## Load sample data (for the demo)
In a second terminal, while the app is running:
    docker compose exec web node seed.js
Creates 6 students, 4 company drives and 8 applications. Safe to run again.

## Logins
- Admin: admin@placement.com / Admin@123
- Sample students: <rollno in lowercase>@college.edu / Student@123
  e.g. 24071a6909@college.edu / Student@123

## Database (MongoDB, database name: placement_cell)
- users         name, email, rollNo, password (bcrypt hash), role, branch, cgpa, phone, skills
- drives        company, role, package (LPA), location, description, minCgpa, openings, deadline
- applications  student -> users._id, drive -> drives._id, status (Applied/Shortlisted/Selected/Rejected)
  (unique on student + drive, so nobody can apply twice)

## Without Docker
Start MongoDB locally, then: npm install, npm start, npm run seed
