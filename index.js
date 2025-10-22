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
app.use("/uploads", express.static("uploads")); // ENABLED

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
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)), // FIXED
});
const upload = multer({ storage });

async function run() {
    try {
        await client.connect();
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

        // CREATE SESSION — NO MULTER!
        app.post("/sessions", async (req, res) => {
            try {
                console.log("\n=== FRONTEND → BACKEND ===");
                console.log("Received body:", req.body);

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

                console.log("\n=== SAVING TO MONGO ===");
                console.log("With image:", newSession.image);

                const result = await sessionsCollection.insertOne(newSession);
                console.log("Inserted _id:", result.insertedId);

                res.status(201).json({
                    success: true,
                    message: "Session created",
                    insertedId: result.insertedId,
                    session: { ...newSession, _id: result.insertedId }
                });
            } catch (error) {
                console.error("ERROR:", error);
                res.status(500).json({ success: false, message: "Failed", error: error.message });
            }
        });

        // TEST
        app.get("/test-session/:id", async (req, res) => {
            const session = await sessionsCollection.findOne({ _id: new ObjectId(req.params.id) });
            if (!session) return res.status(404).json({ message: "Not found" });
            res.json({ message: "Full session", session });
        });

        // PUBLIC SESSIONS
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
            const existing = await bookingsCollection.findOne({ sessionId: sessionId.toString(), studentEmail });
            if (existing) return res.status(409).send({ success: false });
            const result = await bookingsCollection.insertOne({ sessionId: sessionId.toString(), studentEmail, tutorEmail, bookedAt: new Date(), status: "pending" });
            res.send(result.insertedId ? { success: true } : { success: false });
        });

        // START SERVER
        app.listen(port, () => {
            console.log(`Server running on http://localhost:${port}`);
        });

    } catch (error) {
        console.error("Startup failed:", error);
    }
}

run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Study-platform API is running');
});