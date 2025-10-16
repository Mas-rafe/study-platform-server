# 📘 Study Platform Backend (MERN)

The **Study Platform Backend** is the server-side part of the MERN-based study management system.  
It provides secure REST APIs for authentication, session management, user roles (Student, Tutor, Admin), bookings, reviews, notes, and study materials.  
All routes are built using **Express.js** with **MongoDB Atlas** as the database and **JWT** for authentication.

---

## 🌐 Live Server
**Backend URL:** study-platform-server-ruddy.vercel.app

**Frontend Repo:**    https://github.com/Mas-rafe/study-platform-client
**Frontend Live Link:** https://study-platform-f9af6.firebaseapp.com/

---

## ⚙️ Technologies Used
- **Node.js** – JavaScript runtime  
- **Express.js** – Web framework for REST APIs  
- **MongoDB Atlas** – Cloud database  
- **JWT (JSON Web Token)** – Authentication and authorization  
- **dotenv** – Environment variable management  
- **CORS** – Cross-origin resource sharing  
- **Vercel** – Backend deployment  

---

## 🧩 Core Features
- 🔐 **JWT Authentication** for secure API access  
- 👥 **Role-based system** (Student, Tutor, Admin)  
- 📚 **Session Management** — Add, fetch, approve/reject study sessions  
- 🧾 **Bookings Management** — Students can book sessions; Admins can view and manage  
- 🧠 **Notes & Materials CRUD** — Tutors and students can manage study notes  
- ⭐ **Reviews System** — Students can review sessions and tutors  
- 🌍 **CORS-enabled APIs** for smooth frontend communication  
- 🚀 **Hosted on Vercel** with live production build  

---


---

## 🧠 Key API Endpoints

### 🧍 User APIs
| Method | Endpoint | Description |
|--------|-----------|-------------|
| `POST` | `/users` | Create a new user |
| `GET` | `/users/:email` | Get user by email |
| `PATCH` | `/users/:email` | Update user role |

---

### 🎓 Session APIs
| Method | Endpoint | Description |
|--------|-----------|-------------|
| `POST` | `/sessions` | Add a new study session |
| `GET` | `/sessions` | Get all sessions (public) |
| `GET` | `/sessions/:id` | Get single session by ID |
| `PATCH` | `/sessions/:id/approve` | Approve a session (Admin only) |
| `PATCH` | `/sessions/:id/reject` | Reject a session (Admin only) |

---

### 📅 Booking APIs
| Method | Endpoint | Description |
|--------|-----------|-------------|
| `POST` | `/bookings` | Book a session |
| `GET` | `/bookings` | Get all bookings (Admin) |
| `GET` | `/bookings?email={email}` | Get bookings by user email |

---

### 📝 Notes & Materials
| Method | Endpoint | Description |
|--------|-----------|-------------|
| `POST` | `/notes` | Add new note |
| `GET` | `/notes?email={email}` | Get notes by email |
| `DELETE` | `/notes/:id` | Delete note by ID |
| `POST` | `/materials` | Upload study materials |
| `GET` | `/materials` | Get all study materials |

---

## 🧰 Dependencies
```json
"dependencies": {
  "express": "^4.18.2",
  "cors": "^2.8.5",
  "dotenv": "^16.3.1",
  "jsonwebtoken": "^9.0.0",
  "mongodb": "^6.2.0"
}
