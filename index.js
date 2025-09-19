const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const app = express()
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

//middleware
app.use(cors());
app.use(express.json());





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



async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
        const db = client.db('studyPlatformDB');
        const usersCollection = db.collection('users');
        const sessionsCollection = db.collection('sessions');
        const bookingsCollection = db.collection('bookings');
        const reviewsCollection = db.collection('reviews');
        const notificationsCollection = db.collection('notifications');
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
        // ------------------
        app.post("/sessions", async (req, res) => {
            try {
                const { _id, ...session } = req.body;

                // add default fields
                session.status = "pending";      // every new session starts as pending
                session.createdAt = new Date();  // useful for sorting later

                const result = await sessionsCollection.insertOne(session);
                res.send({
                    success: true,
                    message: "Session created successfully (pending approval)",
                    insertedId: result.insertedId,
                });
            } catch (error) {
                console.error("❌ Error creating session:", error);
                res.status(500).send({
                    success: false,
                    message: "Failed to create session"
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

        // GET /studySessions/pending
        app.get("/sessions/pending", async (req, res) => {
            try {
                const pendingSessions = await sessionsCollection
                    .find({ status: "pending" })
                    .toArray();
                res.send(pendingSessions);
            } catch (err) {
                res.status(500).send({ error: "Failed to fetch pending sessions" });
            }
        });

        // PATCH: Approve session
        app.patch("/sessions/:id/approve", async (req, res) => {
            try {
                const id = req.params.id;

                let filter;
                try {
                    filter = { _id: new ObjectId(id) };  // try ObjectId
                } catch {
                    filter = { _id: id };  // fallback to string
                }

                const result = await sessionsCollection.updateOne(
                    filter,
                    { $set: { status: "approved" } }
                );

                console.log("🔎 Approve filter:", filter, "Result:", result);

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Session approved" });
                } else {
                    res.status(404).send({ success: false, message: "Session not found" });
                }
            } catch (error) {
                console.error("❌ Error approving session:", error);
                res.status(500).send({ success: false, message: "Failed to approve session" });
            }
        });

        // PATCH: Reject session
        app.patch("/sessions/:id/reject", async (req, res) => {
            try {
                const id = req.params.id;

                let filter;
                try {
                    filter = { _id: new ObjectId(id) };
                } catch {
                    filter = { _id: id };
                }

                const result = await sessionsCollection.updateOne(
                    filter,
                    { $set: { status: "rejected" } }
                );

                console.log("🔎 Reject filter:", filter, "Result:", result);

                if (result.modifiedCount > 0) {
                    res.send({ success: true, message: "Session rejected" });
                } else {
                    res.status(404).send({ success: false, message: "Session not found" });
                }
            } catch (error) {
                console.error("❌ Error rejecting session:", error);
                res.status(500).send({ success: false, message: "Failed to reject session" });
            }
        });




        app.get("/sessions/:email", async (req, res) => {
            try {
                const email = req.params.email;
                const sessions = await sessionsCollection
                    .find({ tutorEmail: email })
                    .sort({ createdAt: -1 })
                    .toArray();
                res.send(sessions);
            } catch (error) {
                console.error(" Error fetching tutor sessions:", error);
                res.status(500).send({ message: "Failed to fetch tutor sessions" });
            }
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
        app.patch('/users/:id/role', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const { role } = req.body;
            const result = await usersCollection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { role } }
            );
            res.send(result);
        });

        // Delete user
        app.delete('/users/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
            res.send(result);
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
