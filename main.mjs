import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

// __dirname workaround for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { mongoose } from 'mongoose';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static('public'));

// Set up EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create uploads directory if it doesn't exist
try {
    await mkdir('uploads', { recursive: true });
} catch (err) {
    if (err.code !== 'EEXIST') throw err;
}

// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
            return cb(new Error('Only image files are allowed!'));
        }
        cb(null, true);
    }
});

// In-memory storage for history (replace with database in production)
let analysisHistory = [];

// Routes
app.get('/', (req, res) => {
    // Pass the history array to the template
    res.render('index', { 
        history: analysisHistory || [] 
    });
});

app.post('/upload', upload.single('food-image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    // Simulate AI analysis (replace with actual AI processing)
    const analysis = {
        id: Date.now(),
        filename: req.file.filename,
        foodName: "Sample Food", // Replace with AI analysis
        timestamp: new Date(),
        healthStatus: "Healthy", // Replace with AI analysis
        nutrition: {
            calories: 500,
            protein: 20,
            carbs: 30
        }
    };

    // Add to history
    analysisHistory.unshift(analysis);
    // Keep only last 10 items
    if (analysisHistory.length > 10) {
        analysisHistory = analysisHistory.slice(0, 10);
    }

    res.json({
        message: 'File uploaded successfully',
        analysis: analysis
    });
});

// Clear history
app.post('/clear-history', (req, res) => {
    analysisHistory = [];
    res.json({ message: 'History cleared successfully' });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});