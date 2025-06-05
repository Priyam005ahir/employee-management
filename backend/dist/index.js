"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const errorHandler_1 = require("./middleware/errorHandler");
const helpers_1 = require("./utils/helpers");
// Import routes
const auth_1 = __importDefault(require("./routes/auth"));
const cameras_1 = __importDefault(require("./routes/cameras"));
const employees_1 = __importDefault(require("./routes/employees"));
const attendance_1 = __importDefault(require("./routes/attendance"));
const stats_1 = __importDefault(require("./routes/stats"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const models_1 = __importDefault(require("./routes/models"));
// Load environment variables
dotenv_1.default.config();
// Initialize express app
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Create logs directory
const logsDir = path_1.default.join(__dirname, '../logs');
(0, helpers_1.ensureDirectoryExists)(logsDir);
// Create uploads directory
const uploadsDir = path_1.default.join(__dirname, '../uploads');
(0, helpers_1.ensureDirectoryExists)(uploadsDir);
(0, helpers_1.ensureDirectoryExists)(path_1.default.join(uploadsDir, 'employees'));
// Setup request logging
const accessLogStream = fs_1.default.createWriteStream(path_1.default.join(logsDir, 'access.log'), { flags: 'a' });
// Middleware
app.use((0, helmet_1.default)()); // Security headers
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));
app.use(express_1.default.json({ limit: '10mb' })); // Parse JSON request body
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' })); // Parse URL-encoded request body
app.use((0, cookie_parser_1.default)()); // Parse cookies
app.use((0, morgan_1.default)('combined', { stream: accessLogStream })); // Request logging
// Serve static files
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads')));
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Safety Surveillance API is running',
        timestamp: new Date().toISOString()
    });
});
// API routes
app.use('/api/auth', auth_1.default);
app.use('/api/cameras', cameras_1.default);
app.use('/api/employees', employees_1.default);
app.use('/api/attendance', attendance_1.default);
app.use('/api/stats', stats_1.default);
app.use('/api/notifications', notifications_1.default);
app.use('/api/models', models_1.default);
// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: `Route ${req.originalUrl} not found`
    });
});
// Error handling middleware
app.use(errorHandler_1.errorHandler);
// Start server
app.listen(PORT, () => {
    console.log(`Safety Surveillance API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Promise Rejection:', err);
    // Log to file
    fs_1.default.appendFileSync(path_1.default.join(logsDir, 'errors.log'), `${new Date().toISOString()} - Unhandled Promise Rejection: ${err.stack}\n`);
});
// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // Log to file
    fs_1.default.appendFileSync(path_1.default.join(logsDir, 'errors.log'), `${new Date().toISOString()} - Uncaught Exception: ${err.stack}\n`);
    // Exit process
    process.exit(1);
});
exports.default = app;
