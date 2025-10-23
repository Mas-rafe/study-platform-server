const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express();

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;
const multer = require("multer");
const path = require("path");

// Middleware
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://study-platform-f9af6.firebaseapp.com',
    'https://study-platform-f9af6.web.app'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use("/uploads", express.static("uploads")); // FIXED: আনকমেন্ট করা হয়েছে

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fvalijd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send({ message: 'Unauthorized access' });
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) return res.status(403).send({ message: 'Forbidden access' });
        req.decoded = decoded;
        next();
    });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, "uploads/materials"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

async function run() {
    try {
        await client.connect(); // FIXED: আনকমেন্ট করা হয়েছে
        const db = client.db('studyPlatformDB');
        const usersCollection = db.collection('users');
        const sessionsCollection = db.collection('sessions');
        const bookingsCollection = db.collection('bookings');
        const reviewsCollection = db.collection('reviews');
        const notesCollection = db.collection("notes");
        const materialsCollection = db.collection("materials");

        console.log("MongoDB connected!");

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email });
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden: admin only' });
            }
            next();
        };

        // JWT
        app.post('/jwt', (req, res) => {
            const token = jwt.sign(req.body, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });

        // USERS
        app.post("/users", async (req, res) => {
            const user = req.body;
            const existing = await usersCollection.findOne({ email: user.email });
            if (existing) return res.send({ message: "User exists" });
            user.role = "student";
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.get("/users/:email", async (req, res) => {
            const user = await usersCollection.findOne({ email: req.params.email });
            res.send(user || {});
        });

        app.get('/users/me', verifyJWT, async (req, res) => {
            const user = await usersCollection.findOne({ email: req.decoded.email });
            res.send(user);
        });

        app.get('/users/public', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });

        // ADMIN: Get all users with search
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const { search } = req.query;
            const query = search ? {
                $or: [
                    { name: { $regex: search, $options: "i" } },
                    { email: { $regex: search, $options: "i" } },
                ],
            } : {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        app.patch('/users/:id/role', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;
            if (!["student", "tutor"].includes(role)) {
                return res.status(400).send({ success: false, message: "Invalid role" });
            }
            const filter = { _id: new ObjectId(id), role: { $ne: "admin" } };
            const updateDoc = { $set: { role } };
            const result = await usersCollection.updateOne(filter, updateDoc);
            if (result.matchedCount === 0) {
                return res.status(403).send({ success: false, message: "Cannot change admin role" });
            }
            res.send({ success: true, message: "Role updated", modifiedCount: result.modifiedCount });
        });

        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // CREATE SESSION
        app.post("/sessions", async (req, res) => {
            try {
                const { _id, ...data } = req.body;
                const required = ["title", "subject", "description", "registrationStart", "registrationEnd", "classStart", "classEnd", "duration", "tutorName", "tutorEmail"];
                for (const f of required) {
                    if (!data[f]) return res.status(400).json({ success: false, message: `Missing: ${f}` });
                }

                const newSession = {
                    title: data.title,
                    subject: data.subject,
                    description: data.description,
                    image: data.image || null,
                    registrationStart: new Date(data.registrationStart),
                    registrationEnd: new Date(data.registrationEnd),
                    classStart: new Date(data.classStart),
                    classEnd: new Date(data.classEnd),
                    duration: Number(data.duration),
                    registrationFee: Number(data.registrationFee) || 0,
                    tutorName: data.tutorName,
                    tutorEmail: data.tutorEmail,
                    status: "pending",
                    createdAt: new Date(),
                };

                const result = await sessionsCollection.insertOne(newSession);
                res.status(201).json({
                    success: true,
                    message: "Session created",
                    insertedId: result.insertedId,
                    session: { ...newSession, _id: result.insertedId }
                });
            } catch (error) {
                res.status(500).json({ success: false, message: "Failed", error: error.message });
            }
        });

        app.get("/test-session/:id", async (req, res) => {
            const session = await sessionsCollection.findOne({ _id: new ObjectId(req.params.id) });
            if (!session) return res.status(404).json({ message: "Not found" });
            res.json({ message: "Full session", session });
        });

        app.get("/sessions", async (req, res) => {
            const status = req.query.status;
            const filter = status ? { status } : {};
            const result = await sessionsCollection.find(filter).sort({ createdAt: -1 }).toArray();
            res.send(result);
        });

        app.get("/admin/sessions", verifyJWT, verifyAdmin, async (req, res) => {
            const sessions = await sessionsCollection.find({}).toArray();
            res.send(sessions);
        });

        app.get("/sessions/tutor/:email", async (req, res) => {
            const sessions = await sessionsCollection.find({ tutorEmail: req.params.email }).sort({ createdAt: -1 }).toArray();
            res.send(sessions);
        });

        app.get("/sessions/pending", verifyJWT, verifyAdmin, async (req, res) => {
            const pending = await sessionsCollection.find({ status: "pending" }).toArray();
            res.send(pending);
        });

        app.patch("/sessions/:id/approve", verifyJWT, verifyAdmin, async (req, res) => {
            const { fee = 0 } = req.body;
            const result = await sessionsCollection.updateOne(
                { _id: new ObjectId(req.params.id), status: "pending" },
                { $set: { status: "approved", registrationFee: fee } }
            );
            res.send(result.modifiedCount > 0 ? { success: true } : { success: false });
        });

        app.patch("/sessions/:id/reject", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await sessionsCollection.updateOne(
                { _id: new ObjectId(req.params.id), status: "pending" },
                { $set: { status: "rejected" } }
            );
            res.send(result.modifiedCount > 0 ? { success: true } : { success: false });
        });

        app.patch("/sessions/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const { id } = req.params;
            const updates = req.body;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid session ID" });
            const result = await sessionsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: updates }
            );
            res.send(result.modifiedCount > 0 ? { success: true } : { success: false });
        });

        app.delete("/sessions/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false, message: "Invalid session ID" });
            const result = await sessionsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result.deletedCount > 0 ? { success: true } : { success: false });
        });

        app.patch("/sessions/:id/resubmit", async (req, res) => {
            const id = req.params.id;
            const result = await sessionsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: "pending" } }
            );
            res.send(result);
        });

        app.get("/sessions/:id", async (req, res) => {
            if (!ObjectId.isValid(req.params.id)) return res.status(400).send({ message: "Invalid ID" });
            const session = await sessionsCollection.findOne({ _id: new ObjectId(req.params.id) });
            if (!session) return res.status(404).send({ message: "Not found" });
            res.send(session);
        });

        // MATERIALS
        app.post("/materials", upload.single("file"), async (req, res) => {
            const { sessionId, title, description, tutorEmail } = req.body;
            const fileUrl = `/uploads/materials/${req.file.filename}`;
            const material = { sessionId, title, description, tutorEmail, fileUrl, status: "pending", createdAt: new Date() };
            const result = await materialsCollection.insertOne(material);
            res.status(201).send({ success: true, result });
        });

        app.get("/materials", verifyJWT, verifyAdmin, async (req, res) => {
            const materials = await materialsCollection.find().sort({ createdAt: -1 }).toArray();
            res.send(materials);
        });

        app.get("/materials/pending", verifyJWT, verifyAdmin, async (req, res) => {
            const pending = await materialsCollection.find({ status: "pending" }).sort({ createdAt: -1 }).toArray();
            res.send(pending);
        });

        app.patch("/materials/:id/approve", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await materialsCollection.updateOne(
                { _id: new ObjectId(req.params.id), status: "pending" },
                { $set: { status: "approved" } }
            );
            res.send(result.modifiedCount > 0 ? { success: true } : { success: false });
        });

        app.patch("/materials/:id/reject", verifyJWT, verifyAdmin, async (req, res) => {
            const result = await materialsCollection.updateOne(
                { _id: new ObjectId(req.params.id), status: "pending" },
                { $set: { status: "rejected" } }
            );
            res.send(result.modifiedCount > 0 ? { success: true } : { success: false });
        });

        app.get("/materials/approved", async (req, res) => {
            const result = await materialsCollection.find({ status: "approved" }).toArray();
            res.send(result);
        });

        app.get("/materials/tutor/:email", async (req, res) => {
            const materials = await materialsCollection.find({ tutorEmail: req.params.email }).sort({ createdAt: -1 }).toArray();
            res.send(materials);
        });

        app.get("/materials/session/:sessionId", verifyJWT, async (req, res) => {
            const materials = await materialsCollection.find({ sessionId: req.params.sessionId, status: "approved" }).sort({ createdAt: -1 }).toArray();
            res.send(materials);
        });

        // ADMIN STATS
        app.get("/admin/stats", async (req, res) => {
            const stats = {
                totalUsers: await usersCollection.estimatedDocumentCount(),
                totalSessions: await sessionsCollection.estimatedDocumentCount(),
                pendingSessions: await sessionsCollection.countDocuments({ status: "pending" }),
                approvedSessions: await sessionsCollection.countDocuments({ status: "approved" }),
                rejectedSessions: await sessionsCollection.countDocuments({ status: "rejected" }),
                totalBookings: await bookingsCollection.estimatedDocumentCount(),
                totalReviews: await reviewsCollection.estimatedDocumentCount(),
                totalMaterials: await materialsCollection.estimatedDocumentCount(),
            };
            res.send(stats);
        });

        // BOOKINGS
        app.post("/bookings", async (req, res) => {
            const { sessionId, studentEmail, tutorEmail } = req.body;
            if (!sessionId || !studentEmail || !tutorEmail) return res.status(400).send({ success: false });
            const session = await sessionsCollection.findOne({ _id: new ObjectId(sessionId), status: "approved" });
            if (!session) return res.status(404).send({ success: false });
            const existing = await bookingsCollection.findOne({ sessionId, studentEmail }); // FIXED: toString() না দিয়ে direct
            if (existing) return res.status(409).send({ success: false });
            const result = await bookingsCollection.insertOne({ sessionId, studentEmail, tutorEmail, bookedAt: new Date(), status: "pending" });
            res.send(result.insertedId ? { success: true } : { success: false });
        });

        app.get("/bookings/student/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) return res.status(403).send({ message: "Forbidden" });
            const bookings = await bookingsCollection.find({ studentEmail: email }).sort({ bookedAt: -1 }).toArray();
            const enriched = await Promise.all(bookings.map(async (b) => {
                let sessionDoc = null;
                if (ObjectId.isValid(b.sessionId)) {
                    sessionDoc = await sessionsCollection.findOne({ _id: new ObjectId(b.sessionId) });
                }
                return {
                    ...b,
                    session: sessionDoc ? {
                        _id: sessionDoc._id.toString(),
                        title: sessionDoc.title,
                        tutorName: sessionDoc.tutorName,
                        registrationFee: sessionDoc.registrationFee,
                    } : null,
                };
            }));
            res.send(enriched);
        });

        app.get("/bookings", verifyJWT, verifyAdmin, async (req, res) => {
            const status = req.query.status;
            let filter = {};
            if (status) filter.status = status;
            const bookings = await bookingsCollection.find(filter).sort({ bookedAt: -1 }).toArray();
            res.send(bookings);
        });

        app.patch("/bookings/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const update = req.body;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false });
            const result = await bookingsCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: update }
            );
            res.send(result.modifiedCount > 0 ? { success: true } : { success: false });
        });

        app.delete("/bookings/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false });
            const result = await bookingsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result.deletedCount > 0 ? { success: true } : { success: false });
        });

        // REVIEWS
        app.post("/reviews", verifyJWT, async (req, res) => {
            const { sessionId, studentEmail, studentName, rating, comment } = req.body;
            if (!sessionId || !studentEmail || rating == null || !comment) return res.status(400).send({ message: "Missing fields" });
            const review = { sessionId, studentEmail, studentName, rating: Number(rating), comment, createdAt: new Date() };
            const result = await reviewsCollection.insertOne(review);
            res.send(result);
        });

        app.get("/reviews", verifyJWT, verifyAdmin, async (req, res) => {
            const reviews = await reviewsCollection.find({}).toArray();
            res.send(reviews);
        });

        app.delete("/reviews/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ success: false });
            const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result.deletedCount === 1 ? { success: true } : { success: false });
        });

        app.get("/reviews/:sessionId", async (req, res) => {
            const reviews = await reviewsCollection.find({ sessionId: req.params.sessionId }).toArray();
            res.send(reviews);
        });

        // NOTES
        app.post("/notes", verifyJWT, async (req, res) => {
            const { email, title, description } = req.body;
            if (req.decoded.email !== email) return res.status(403).send({ message: "Forbidden" });
            const note = { email, title, description, createdAt: new Date() };
            const result = await notesCollection.insertOne(note);
            res.status(201).send({ insertedId: result.insertedId });
        });

        app.get("/notes/student/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) return res.status(403).send({ message: "Forbidden" });
            const notes = await notesCollection.find({ email }).sort({ createdAt: -1 }).toArray();
            res.send(notes);
        });

        app.patch("/notes/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid note id" });
            const note = await notesCollection.findOne({ _id: new ObjectId(id) });
            if (!note || req.decoded.email !== note.email) return res.status(403).send({ message: "Forbidden" });
            const result = await notesCollection.updateOne({ _id: new ObjectId(id) }, { $set: req.body });
            res.send(result);
        });

        app.delete("/notes/:id", verifyJWT, async (req, res) => {
            const id = req.params.id;
            if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid note id" });
            const note = await notesCollection.findOne({ _id: new ObjectId(id) });
            if (!note || req.decoded.email !== note.email) return res.status(403).send({ message: "Forbidden" });
            const result = await notesCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });

        // TUTOR & STUDENT STATS
        app.get("/tutor/stats/:email", async (req, res) => {
            const email = req.params.email;
            const totalSessions = await sessionsCollection.countDocuments({ tutorEmail: email });
            const totalMaterials = await materialsCollection.countDocuments({ tutorEmail: email });
            const totalStudents = await bookingsCollection.countDocuments({ tutorEmail: email });
            const reviews = await reviewsCollection.find({ sessionId: { $in: (await sessionsCollection.find({ tutorEmail: email }).map(s => s._id.toString())) } }).toArray();
            const avgRating = reviews.length > 0 ? reviews.reduce((a, b) => a + b.rating, 0) / reviews.length : 0;
            res.send({ totalSessions, totalMaterials, totalStudents, avgRating });
        });

        app.get("/student/stats/:email", verifyJWT, async (req, res) => {
            const email = req.params.email;
            if (req.decoded.email !== email) return res.status(403).send({ message: "Forbidden" });
            const totalBookings = await bookingsCollection.countDocuments({ studentEmail: email });
            const totalReviews = await reviewsCollection.countDocuments({ studentEmail: email });
            const booked = await bookingsCollection.find({ studentEmail: email }).toArray();
            const sessionIds = booked.map(b => b.sessionId);
            const totalMaterials = await materialsCollection.countDocuments({ sessionId: { $in: sessionIds }, status: "approved" });
            res.send({ totalBookings, totalReviews, totalMaterials });
        });

    } catch (error) {
        console.error("Startup failed:", error);
    }
}



run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Study-platform API is running');
});
app.listen(port, () => {
    console.log(`study platform running on port ${port}`);
});
