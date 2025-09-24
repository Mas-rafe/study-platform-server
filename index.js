const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const multer = require("multer");
const path = require("path");


//middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));





const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.fvalijd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

// JWT verify middleware
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' });
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }

        req.decoded = decoded;
        next();
    });
}

// Configure storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, "uploads/materials"); // all files will be stored in /uploads
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ storage });




async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const db = client.db('studyPlatformDB');
        const usersCollection = db.collection('users');
        const sessionsCollection = db.collection('sessions');
        const bookingsCollection = db.collection('bookings');
        const reviewsCollection = db.collection('reviews');
        // const notificationsCollection = db.collection('notifications');
        const materialsCollection = db.collection("materials"); // ✅ added


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const user = await usersCollection.findOne({ email });
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'Forbidden: admin only' });
            }
            next();
        };

        // JWT generate route
        app.post('/jwt', (req, res) => {
            const user = req.body; // { email: ... }
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        });
        // POST user when registering
        app.post("/users", async (req, res) => {
            try {
                const user = req.body;
                const existingUser = await usersCollection.findOne({ email: user.email });

                if (existingUser) {
                    return res.send({ message: "User already exists" });
                }

                user.role = "student"; // default role
                const result = await usersCollection.insertOne(user);
                res.send(result);
            } catch (err) {
                res.status(500).send({ error: err.message });
            }
        });

        // GET user role
        app.get("/users/:email", async (req, res) => {
            const email = req.params.email;
            const user = await usersCollection.findOne({ email });
            res.send(user);
        });


        // protected route - user নিজ data পাবে
        app.get('/users/me', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const user = await usersCollection.findOne({ email: decodedEmail });
            res.send(user);
        });
        // Public route: টেস্ট করার জন্য
        app.get('/users/public', async (req, res) => {
            const users = await usersCollection.find().toArray();
            res.send(users);
        });


        // POST: Create session
        // POST: Create session
        // ------------------
        app.post("/sessions", async (req, res) => {
            try {
                const { _id, ...data } = req.body;

                const newSession = {
                    title: data.title,
                    subject: data.subject,
                    description: data.description,
                    registrationStart: new Date(data.registrationStart),
                    registrationEnd: new Date(data.registrationEnd),
                    classStart: new Date(data.classStart),
                    classEnd: new Date(data.classEnd),
                    duration: Number(data.duration),
                    registrationFee: Number(data.registrationFee) || 0,
                    tutorName: data.tutorName,
                    tutorEmail: data.tutorEmail,

                    // default fields
                    status: "pending",   // every new session starts as pending
                    createdAt: new Date()
                };

                const result = await sessionsCollection.insertOne(newSession);
                res.send({
                    success: true,
                    message: "Session created successfully (pending approval)",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("❌ Error creating session:", error);
                res.status(500).send({
                    success: false,
                    message: "Failed to create session",
                });
            }
        });



        // GET: All sessions
        // ------------------
        // app.get("/sessions", async (req, res) => {
        //     try {
        //         const sessions = await sessionsCollection
        //             .find()
        //             .sort({ createdAt: -1 }) // latest first
        //             .toArray();
        //         res.send(sessions);
        //     } catch (error) {
        //         console.error(" Error fetching sessions:", error);
        //         res.status(500).send({ message: "Failed to fetch sessions" });
        //     }
        // });

        // GET: Approved sessions (for students)
        app.get("/sessions", async (req, res) => {
            try {
                const result = await sessionsCollection.find({ status: "approved" }).toArray();
                res.send(result);
            } catch (error) {
                console.error("❌ Error fetching sessions:", error);
                res.status(500).send({ message: "Failed to fetch sessions" });
            }
        });




        app.get("/reviews/:sessionId", async (req, res) => {
            const { sessionId } = req.params;
            const reviews = await reviewsCollection
                .find({ sessionId })
                .sort({ createdAt: -1 })
                .toArray();
            res.send(reviews);
        });

        // GET: All sessions (for admin)
        app.get("/sessions", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const result = await sessionsCollection.find({}).toArray(); // fetch all sessions
                res.send(result);
            } catch (error) {
                console.error("❌ Error fetching sessions:", error);
                res.status(500).send({ success: false, message: "Failed to fetch sessions" });
            }
        });




        // GET /sessions/pending → only admin can fetch pending sessions
        app.get("/sessions/pending", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                console.log("Fetching pending sessions...");
                const pendingSessions = await sessionsCollection
                    .find({ status: "pending" })
                    .toArray();
                console.log("Found pending sessions:", pendingSessions);
                res.send(pendingSessions);
            } catch (err) {
                console.error("Error fetching pending sessions:", err);
                res.status(500).send({ success: false, message: "Failed to fetch pending sessions" });
            }
        });

        //approve session
        app.patch("/sessions/:id/approve", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const { fee = 0 } = req.body;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: "Invalid session ID" });
                }

                const result = await sessionsCollection.updateOne(
                    { _id: new ObjectId(id), status: "pending" },
                    { $set: { status: "approved", registrationFee: fee } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Session approved" });
                } else {
                    res.status(404).send({ success: false, message: "Pending session not found" });
                }
            } catch (error) {
                console.error("❌ Error approving session:", error);
                res.status(500).send({ success: false, message: "Failed to approve session" });
            }
        });

        //reject session
        app.patch("/sessions/:id/reject", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;

                const result = await sessionsCollection.updateOne(
                    { _id: new ObjectId(id), status: "pending" },
                    { $set: { status: "rejected" } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Session rejected" });
                } else {
                    res.status(404).send({ success: false, message: "Pending session not found" });
                }
            } catch (err) {
                console.error(err);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });


        // PATCH /sessions/:id → update session details (admin only)
        app.patch("/sessions/:id", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const updates = req.body; // e.g., { title, subject, duration, registrationFee, status }

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: "Invalid session ID" });
                }

                const result = await sessionsCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updates }
                );

                if (result.modifiedCount > 0) {
                    return res.send({ success: true, message: "Session updated successfully" });
                } else {
                    return res.status(404).send({ success: false, message: "Session not found" });
                }
            } catch (err) {
                console.error("Error updating session:", err);
                res.status(500).send({ success: false, message: "Failed to update session" });
            }
        });


        app.delete("/sessions/:id", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;

                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: "Invalid session ID" });
                }

                const result = await sessionsCollection.deleteOne({ _id: new ObjectId(id) });

                if (result.deletedCount > 0) {
                    res.send({ success: true, deletedCount: result.deletedCount });
                } else {
                    res.status(404).send({ success: false, message: "Session not found" });
                }
            } catch (error) {
                console.error("❌ Error deleting session:", error);
                res.status(500).send({ success: false, message: "Failed to delete session" });
            }
        });


        // 🔄 Tutor's sessions (use tutor email)
        // Replaces your current: app.get("/sessions/:email")
        app.get("/sessions/tutor/:email", async (req, res) => {
            try {
                const email = req.params.email;
                const sessions = await sessionsCollection
                    .find({ tutorEmail: email })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(sessions);
            } catch (error) {
                console.error("Error fetching tutor sessions:", error);
                res.status(500).send({ message: "Failed to fetch tutor sessions" });
            }
        });

        // PATCH session resubmit (for rejected → pending)[tutors}]
        app.patch("/sessions/:id/resubmit", async (req, res) => {
            try {
                const id = req.params.id;
                const filter = { _id: new ObjectId(id) };
                const updateDoc = { $set: { status: "pending" } };
                const result = await sessionsCollection.updateOne(filter, updateDoc);
                res.send(result);
            } catch (error) {
                console.error("Error resubmitting session:", error);
                res.status(500).send({ message: "Failed to resubmit session" });
            }
        });


        // 🔄 Get single session by ID
        // Keep this route, but make sure it's below the tutor route
        app.get("/sessions/:id", async (req, res) => {
            const { id } = req.params;
            if (!ObjectId.isValid(id)) return res.status(400).send({ message: "Invalid session ID" });
            const session = await sessionsCollection.findOne({ _id: new ObjectId(id) });
            if (!session) return res.status(404).send({ message: "Session not found" });
            res.send(session);
        });

        // Get reviews for a session
        app.get("/reviews/:sessionId", async (req, res) => {
            const { sessionId } = req.params;
            if (!ObjectId.isValid(sessionId)) return res.status(400).send({ message: "Invalid session ID" });
            const reviews = await reviewsCollection
                .find({ sessionId: new ObjectId(sessionId) })
                .sort({ createdAt: -1 })
                .toArray();

            res.send(reviews);
        });




        // Admin stats route
        app.get("/admin/stats", async (req, res) => {
            try {
                const usersCount = await usersCollection.estimatedDocumentCount();
                const sessionsCount = await sessionsCollection.estimatedDocumentCount();

                const pendingCount = await sessionsCollection.countDocuments({ status: "pending" });
                const approvedCount = await sessionsCollection.countDocuments({ status: "approved" });
                const rejectedCount = await sessionsCollection.countDocuments({ status: "rejected" });

                const bookingsCount = await bookingsCollection.estimatedDocumentCount();
                const reviewsCount = await reviewsCollection.estimatedDocumentCount();
                const notificationsCount = await notificationsCollection.estimatedDocumentCount();
                const materialsCount = await materialsCollection.estimatedDocumentCount(); // ✅ new

                res.send({
                    totalUsers: usersCount,
                    totalSessions: sessionsCount,
                    pendingSessions: pendingCount,
                    approvedSessions: approvedCount,
                    rejectedSessions: rejectedCount,
                    totalBookings: bookingsCount,
                    totalReviews: reviewsCount,
                    totalNotifications: notificationsCount,
                    totalMaterials: materialsCount, // ✅ show in dashboard
                });
            } catch (err) {
                console.error("Error fetching admin stats:", err);
                res.status(500).send({ error: "Failed to fetch admin stats" });
            }
        });

        //for search:Admin Dashboard> manage Users
        // Get all users (only admin can do this)
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const { search } = req.query;
            const query = search
                ? {
                    $or: [
                        { name: { $regex: search, $options: "i" } },
                        { email: { $regex: search, $options: "i" } },
                    ],
                }
                : {};

            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        // Update user role
        // Update user role (only student <-> tutor, never admin)
        app.patch('/users/:id/role', verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                const { role } = req.body;

                // Only allow student/tutor roles
                if (!["student", "tutor"].includes(role)) {
                    return res.status(400).send({ success: false, message: "Invalid role" });
                }

                // Prevent changing admin role
                const filter = { _id: new ObjectId(id), role: { $ne: "admin" } };
                const updateDoc = { $set: { role } };

                const result = await usersCollection.updateOne(filter, updateDoc);

                if (result.matchedCount === 0) {
                    return res.status(403).send({ success: false, message: "Cannot change admin role" });
                }

                res.send({ success: true, message: "Role updated", modifiedCount: result.modifiedCount });
            } catch (err) {
                console.error("Error updating role:", err);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });

        // Delete user
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
        });


        // POST /bookings → student books a session
        app.post("/bookings", async (req, res) => {
            try {
                const { sessionId, studentEmail, tutorEmail } = req.body;

                console.log("Incoming booking data:", req.body);

                if (!sessionId || !studentEmail || !tutorEmail) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing required fields",
                    });
                }

                if (!ObjectId.isValid(sessionId)) {
                    return res.status(400).send({ success: false, message: "Invalid session ID" });
                }

                // Check session exists & approved
                const session = await sessionsCollection.findOne({
                    _id: new ObjectId(sessionId),
                    status: "approved",
                });

                if (!session) {
                    return res.status(404).send({
                        success: false,
                        message: "Session not found or not approved",
                    });
                }

                // Duplicate booking check (compare as string)
                const existingBooking = await bookingsCollection.findOne({
                    sessionId: sessionId.toString(),
                    studentEmail,
                });

                if (existingBooking) {
                    return res.status(409).send({
                        success: false,
                        message: "You already booked this session",
                    });
                }
                ;
                // Insert booking
                const booking = {
                    sessionId: sessionId.toString(), // store as string
                    studentEmail,
                    tutorEmail,
                    bookedAt: new Date(),
                    status: "pending",
                };

                const result = await bookingsCollection.insertOne(booking);

                if (result.insertedId) {
                    res.send({ success: true, message: "Session booked successfully!" });
                } else {
                    res.status(500).send({ success: false, message: "Failed to book session" });
                }
            } catch (err) {
                console.error("Error creating booking:", err);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });

        app.post("/reviews", async (req, res) => {
            try {
                const { sessionId, studentEmail, studentName, rating, comment } = req.body;

                if (!sessionId || !studentEmail || rating == null || !comment) {
                    return res.status(400).send({ success: false, message: "Missing required fields" });
                }

                const review = {
                    sessionId: sessionId.toString(),
                    studentEmail,
                    studentName,
                    rating,
                    comment,
                    createdAt: new Date(),
                };

                const result = await reviewsCollection.insertOne(review);

                if (result.insertedId) {
                    res.send({ success: true, message: "Review added successfully!" });
                } else {
                    res.status(500).send({ success: false, message: "Failed to add review" });
                }
            } catch (err) {
                console.error("Error adding review:", err);
                res.status(500).send({ success: false, message: "Server error" });
            }
        });

        // GET all reviews (admin only)
        app.get("/reviews", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const reviews = await reviewsCollection.find({}).toArray();
                res.send(reviews);
            } catch (error) {
                console.error("❌ Error fetching reviews:", error);
                res.status(500).send({ success: false, message: "Failed to fetch reviews" });
            }
        });

        // DELETE review (admin only)
        app.delete("/reviews/:id", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const id = req.params.id;
                if (!ObjectId.isValid(id)) {
                    return res.status(400).send({ success: false, message: "Invalid review ID" });
                }

                const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
                if (result.deletedCount > 0) {
                    res.send({ success: true, message: "Review deleted" });
                } else {
                    res.status(404).send({ success: false, message: "Review not found" });
                }
            } catch (error) {
                console.error("❌ Error deleting review:", error);
                res.status(500).send({ success: false, message: "Failed to delete review" });
            }
        });

        //Api s for material
        // POST /materials (with file upload)
        app.post("/materials", upload.single("file"), async (req, res) => {
            try {
                const { sessionId, title, description, tutorEmail } = req.body;
                const fileUrl = `/uploads/materials/${req.file.filename}`;

                const material = {
                    sessionId,
                    title,
                    description,
                    tutorEmail,
                    fileUrl,
                    status: "pending",   // 👈 default status
                    createdAt: new Date(),
                };

                const result = await materialsCollection.insertOne(material);
                res.status(201).send({ success: true, result });
            } catch (error) {
                console.error("Error uploading material:", error);
                res.status(500).send({ error: "Failed to upload material" });
            }
        });

        // Serve uploaded files statically
        app.use("/uploads", express.static("uploads"));


        // GET all materials → optional: admin only
        app.get("/materials", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const materials = await materialsCollection
                    .find()
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(materials);
            } catch (error) {
                console.error("❌ Error fetching materials:", error);
                res.status(500).send({ success: false, message: "Failed to fetch materials" });
            }
        });


        // GET /materials/pending → fetch all pending materials (admin only)
        app.get("/materials/pending", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const pendingMaterials = await materialsCollection
                    .find({ status: "pending" })
                    .sort({ createdAt: -1 }) // latest first
                    .toArray();

                res.send(pendingMaterials);
            } catch (error) {
                console.error("❌ Error fetching pending materials:", error);
                res.status(500).send({ success: false, message: "Failed to fetch pending materials" });
            }
        });


        // PATCH /materials/:id/approve

        app.patch("/materials/:id/approve", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const result = await materialsCollection.updateOne(
                    { _id: new ObjectId(id), status: "pending" },
                    { $set: { status: "approved" } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Material approved" });
                } else {
                    res.status(404).send({ success: false, message: "Pending material not found" });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: "Failed to approve material" });
            }
        });

        // PATCH /materials/:id/reject
        app.patch("/materials/:id/reject", verifyJWT, verifyAdmin, async (req, res) => {
            try {
                const { id } = req.params;
                const result = await materialsCollection.updateOne(
                    { _id: new ObjectId(id), status: "pending" },
                    { $set: { status: "rejected" } }
                );

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Material rejected" });
                } else {
                    res.status(404).send({ success: false, message: "Pending material not found" });
                }
            } catch (error) {
                res.status(500).send({ success: false, message: "Failed to reject material" });
            }
        });


        // GET /materials/approved
        app.get("/materials/approved", async (req, res) => {
            try {
                const result = await materialsCollection.find({ status: "approved" }).toArray();
                res.send(result);
            } catch (error) {
                res.status(500).send({ error: "Failed to fetch approved materials" });
            }
        });

        app.get("/materials/tutor/:email", async (req, res) => {
            try {
                const email = req.params.email;
                const materials = await materialsCollection
                    .find({ tutorEmail: email })
                    .sort({ createdAt: -1 })
                    .toArray();

                res.send(materials);
            } catch (error) {
                console.error("Error fetching tutor materials:", error);
                res.status(500).send({ message: "Failed to fetch tutor materials" });
            }
        });


        //tutor email stats
        app.get("/tutor/stats/:email", async (req, res) => {
            try {
                const email = req.params.email;

                // Double-check which field you saved in MongoDB
                const totalSessions = await sessionsCollection.countDocuments({ tutorEmail: email });
                const totalMaterials = await materialsCollection.countDocuments({ tutorEmail: email });
                const totalStudents = await bookingsCollection.countDocuments({ tutorEmail: email });

                // Average rating
                const reviews = await reviewsCollection.find({ tutorEmail: email }).toArray();
                let avgRating = 0;
                if (reviews.length > 0) {
                    const ratings = reviews.map(r => Number(r.rating) || 0);
                    avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
                }

                res.send({
                    totalSessions,
                    totalMaterials,
                    totalStudents,
                    avgRating,
                });
            } catch (err) {
                console.error("❌ Error fetching tutor stats:", err);
                res.status(500).send({
                    message: "Failed to fetch tutor stats",
                    error: err.message,
                });
            }
        });














        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Study-platform testing')
})

app.listen(port, () => {
    console.log(`study platform running on port ${port}`)
})



