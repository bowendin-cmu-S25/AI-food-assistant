import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

// Create uploads directory if it doesn't exist
import { mkdir } from 'fs/promises';
try {
    await mkdir('uploads', { recursive: true });
} catch (err) {
    if (err.code !== 'EEXIST') throw err;
}

// Serve static files
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/upload', upload.single('food-image'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    // Here you would typically process the image with your AI model
    // For now, we'll just send back a success message
    res.json({
        message: 'File uploaded successfully',
        filename: req.file.filename
    });
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});