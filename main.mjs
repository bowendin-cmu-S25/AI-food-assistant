import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { mkdir } from 'fs/promises';
import mongoose from 'mongoose';
import sharp from 'sharp';
import fs from 'fs';
import { OpenAI } from 'openai';

const api_key = process.env.OPENAI_API_KEY;

if (!api_key) {
    console.error('OPENAI_API_KEY is not set');
    process.exit(1);
}

const openai = new OpenAI({
    apiKey: api_key
});

// __dirname workaround for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Image size constants
const IMAGE_SIZES = {
    THUMBNAIL: { width: 200, height: 200 },
    MEDIUM: { width: 600, height: 600 },
    LARGE: { width: 1200, height: 1200 }
};

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/foodassistant')
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

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
        // Check file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only JPG, JPEG, and PNG images are allowed'));
        }
        
        // Check file size (5MB limit)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (parseInt(req.headers['content-length']) > maxSize) {
            return cb(new Error('File size should be less than 5MB'));
        }
        
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB in bytes
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

app.post('/upload', upload.single('food-image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
        // Get the uploaded file path
        const filePath = req.file.path;
        const timestamp = Date.now();
        
        // Process images with fixed sizes
        const processedImages = await Promise.all([
            // Thumbnail
            sharp(filePath)
                .resize(IMAGE_SIZES.THUMBNAIL.width, IMAGE_SIZES.THUMBNAIL.height, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 80 })
                .toFile(path.join('uploads', `thumb_${timestamp}.jpg`)),
            
            // Medium size
            sharp(filePath)
                .resize(IMAGE_SIZES.MEDIUM.width, IMAGE_SIZES.MEDIUM.height, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 85 })
                .toFile(path.join('uploads', `medium_${timestamp}.jpg`)),
            
            // Large size
            sharp(filePath)
                .resize(IMAGE_SIZES.LARGE.width, IMAGE_SIZES.LARGE.height, {
                    fit: 'cover',
                    position: 'center'
                })
                .jpeg({ quality: 90 })
                .toFile(path.join('uploads', `large_${timestamp}.jpg`))
        ]).catch(error => {
            console.error('Error processing images:', error);
            throw new Error('Failed to process image');
        });

        // Clean up original file
        await fs.promises.unlink(filePath).catch(console.error);

        const imagePath = path.join('uploads', `large_${timestamp}.jpg`);
        const base64Image = await fs.promises.readFile(imagePath, "base64");

        const completion = await openai.chat.completions.create({
            model: "gpt-4.1-mini",
            messages: [
                {
                    role: "system",
                    content: `
You are a food nutrition analysis assistant. When given a food image, your job is to identify the food item and estimate its nutritional properties.

Always respond in the following strict JSON format:

{
  "foodName": "string (e.g., Caesar Salad)",
  "isHealthy": "yes" | "no" | "unsure",
  "calories": number (estimated total kcal),
  "protein": number (grams),
  "carbs": number (grams),
  "fat": number (grams),
  "notes": "short free-text explanation or warning (optional)"
}

If the image is not of food, or you can't identify any food/meal in the image, do NOT output json, instead just respond with "No food detected."

For the numbers, an estimate is ok based on what you think.
If you are unsure, still return a complete JSON with best guesses and note uncertainty in the "notes" field.
Do not include any explanation outside the JSON object.
`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`,
                            },
                        },
                    ],
                },
            ],
        });

        const aiDescription = completion.choices[0].message.content || "No response from AI.";

        console.log("AI response:", aiDescription);

        let parsed;
        try {
            parsed = JSON.parse(aiDescription);
        } catch (e) {
            return res.status(400).json({
                error: 'Unable to interpret the image as food. Please upload a clear photo of a meal.'
            });
        }

        const analysis = {
            id: timestamp,
            filename: `large_${timestamp}.jpg`,
            thumbnail: `thumb_${timestamp}.jpg`,
            mediumImage: `medium_${timestamp}.jpg`,
            foodName: parsed.foodName,
            timestamp: new Date(),
            healthStatus: parsed.isHealthy === "yes" ? "Healthy" : parsed.isHealthy === "no" ? "Unhealthy" : "Unsure",
            nutrition: {
                calories: parsed.calories,
                protein: parsed.protein,
                carbs: parsed.carbs,
                fat: parsed.fat
            },
            notes: parsed.notes,
            rawDescription: aiDescription
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
    } catch (error) {
        console.error('Error processing image:', error);
        res.status(500).json({ error: error.message || 'Error processing image' });
    }
});

// Clear history
app.post('/clear-history', async (req, res) => {
    try {
        // Get all files in the uploads directory
        const files = await fs.promises.readdir('uploads');
        
        // Delete all files in the uploads directory
        await Promise.all(files.map(file => 
            fs.promises.unlink(path.join('uploads', file))
                .catch(err => console.error(`Error deleting file ${file}:`, err))
        ));

        // Clear the history array
        analysisHistory = [];
        
        res.json({ 
            message: 'History cleared successfully',
            filesDeleted: files.length
        });
    } catch (error) {
        console.error('Error clearing history:', error);
        res.status(500).json({ 
            error: 'Failed to clear history',
            details: error.message
        });
    }
});

app.get('/history', (req, res) => {
    res.render('history', {
        history: analysisHistory || []
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File size should be less than 5MB' });
        }
        return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});