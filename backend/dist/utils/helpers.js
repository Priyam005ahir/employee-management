"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateUniqueFilename = exports.maskSensitiveData = exports.createSlug = exports.getClientIp = exports.parseDateRange = exports.stringToBoolean = exports.sanitizeString = exports.formatFileSize = exports.isImageFile = exports.getFileExtension = exports.deleteFileIfExists = exports.ensureDirectoryExists = exports.createPaginationMeta = exports.calculateOffset = exports.getPaginationParams = exports.isValidUUID = exports.getTodayDate = exports.formatDate = exports.generateRandomString = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate a random string of specified length
 * @param length Length of the string to generate
 * @returns Random string
 */
const generateRandomString = (length = 32) => {
    return crypto_1.default.randomBytes(length).toString('hex').slice(0, length);
};
exports.generateRandomString = generateRandomString;
/**
 * Format date to ISO string without time
 * @param date Date to format
 * @returns Formatted date string (YYYY-MM-DD)
 */
const formatDate = (date) => {
    return date.toISOString().split('T')[0];
};
exports.formatDate = formatDate;
/**
 * Get today's date in ISO format
 * @returns Today's date in YYYY-MM-DD format
 */
const getTodayDate = () => {
    return (0, exports.formatDate)(new Date());
};
exports.getTodayDate = getTodayDate;
/**
 * Check if a string is a valid UUID
 * @param str String to check
 * @returns Boolean indicating if string is a valid UUID
 */
const isValidUUID = (str) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
};
exports.isValidUUID = isValidUUID;
/**
 * Get pagination parameters from request query
 * @param req Express request object
 * @returns Object with page and limit values
 */
const getPaginationParams = (req) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    return { page, limit };
};
exports.getPaginationParams = getPaginationParams;
/**
 * Calculate pagination offset based on page and limit
 * @param page Page number
 * @param limit Items per page
 * @returns Offset value
 */
const calculateOffset = (page, limit) => {
    return (page - 1) * limit;
};
exports.calculateOffset = calculateOffset;
/**
 * Create pagination metadata object
 * @param total Total number of items
 * @param page Current page
 * @param limit Items per page
 * @returns Pagination metadata object
 */
const createPaginationMeta = (total, page, limit) => {
    return {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1
    };
};
exports.createPaginationMeta = createPaginationMeta;
/**
 * Ensure a directory exists, create it if it doesn't
 * @param dirPath Directory path
 */
const ensureDirectoryExists = (dirPath) => {
    if (!fs_1.default.existsSync(dirPath)) {
        fs_1.default.mkdirSync(dirPath, { recursive: true });
    }
};
exports.ensureDirectoryExists = ensureDirectoryExists;
/**
 * Delete a file if it exists
 * @param filePath Path to the file
 * @returns Boolean indicating if file was deleted
 */
const deleteFileIfExists = (filePath) => {
    if (fs_1.default.existsSync(filePath)) {
        fs_1.default.unlinkSync(filePath);
        return true;
    }
    return false;
};
exports.deleteFileIfExists = deleteFileIfExists;
/**
 * Get file extension from filename
 * @param filename Filename
 * @returns File extension
 */
const getFileExtension = (filename) => {
    return path_1.default.extname(filename).toLowerCase();
};
exports.getFileExtension = getFileExtension;
/**
 * Check if a file is an image
 * @param filename Filename
 * @returns Boolean indicating if file is an image
 */
const isImageFile = (filename) => {
    const ext = (0, exports.getFileExtension)(filename);
    return ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext);
};
exports.isImageFile = isImageFile;
/**
 * Format file size in human-readable format
 * @param bytes File size in bytes
 * @returns Formatted file size string
 */
const formatFileSize = (bytes) => {
    if (bytes === 0)
        return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
exports.formatFileSize = formatFileSize;
/**
 * Sanitize a string for use in SQL queries
 * @param str String to sanitize
 * @returns Sanitized string
 */
const sanitizeString = (str) => {
    return str.replace(/['";\\]/g, '');
};
exports.sanitizeString = sanitizeString;
/**
 * Convert a string to boolean
 * @param value String value
 * @returns Boolean value
 */
const stringToBoolean = (value) => {
    if (!value)
        return false;
    return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
};
exports.stringToBoolean = stringToBoolean;
/**
 * Parse date range from request query
 * @param req Express request object
 * @returns Object with startDate and endDate
 */
const parseDateRange = (req) => {
    const startDate = req.query.startDate || null;
    const endDate = req.query.endDate || null;
    return { startDate, endDate };
};
exports.parseDateRange = parseDateRange;
/**
 * Get client IP address from request
 * @param req Express request object
 * @returns IP address string
 */
const getClientIp = (req) => {
    var _a;
    return (((_a = req.headers['x-forwarded-for']) === null || _a === void 0 ? void 0 : _a.split(',')[0]) ||
        req.socket.remoteAddress ||
        '');
};
exports.getClientIp = getClientIp;
/**
 * Create a URL-friendly slug from a string
 * @param str String to convert to slug
 * @returns URL-friendly slug
 */
const createSlug = (str) => {
    return str
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};
exports.createSlug = createSlug;
/**
 * Mask sensitive data in a string (e.g., for logging)
 * @param str String containing sensitive data
 * @returns String with masked sensitive data
 */
const maskSensitiveData = (str) => {
    // Mask email addresses
    str = str.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '***@***.***');
    // Mask credit card numbers
    str = str.replace(/\b(?:\d{4}[ -]?){3}(?:\d{4})\b/g, '****-****-****-****');
    // Mask phone numbers
    str = str.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '***-***-****');
    return str;
};
exports.maskSensitiveData = maskSensitiveData;
/**
 * Generate a unique filename with timestamp
 * @param originalFilename Original filename
 * @returns Unique filename
 */
const generateUniqueFilename = (originalFilename) => {
    const ext = path_1.default.extname(originalFilename);
    const basename = path_1.default.basename(originalFilename, ext);
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `${basename}-${timestamp}-${random}${ext}`;
};
exports.generateUniqueFilename = generateUniqueFilename;
