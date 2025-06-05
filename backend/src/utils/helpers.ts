import { Request } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

/**
 * Generate a random string of specified length
 * @param length Length of the string to generate
 * @returns Random string
 */
export const generateRandomString = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
};

/**
 * Format date to ISO string without time
 * @param date Date to format
 * @returns Formatted date string (YYYY-MM-DD)
 */
export const formatDate = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Get today's date in ISO format
 * @returns Today's date in YYYY-MM-DD format
 */
export const getTodayDate = (): string => {
  return formatDate(new Date());
};

/**
 * Check if a string is a valid UUID
 * @param str String to check
 * @returns Boolean indicating if string is a valid UUID
 */
export const isValidUUID = (str: string): boolean => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
};

/**
 * Get pagination parameters from request query
 * @param req Express request object
 * @returns Object with page and limit values
 */
export const getPaginationParams = (req: Request): { page: number; limit: number } => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  return { page, limit };
};

/**
 * Calculate pagination offset based on page and limit
 * @param page Page number
 * @param limit Items per page
 * @returns Offset value
 */
export const calculateOffset = (page: number, limit: number): number => {
  return (page - 1) * limit;
};

/**
 * Create pagination metadata object
 * @param total Total number of items
 * @param page Current page
 * @param limit Items per page
 * @returns Pagination metadata object
 */
export const createPaginationMeta = (total: number, page: number, limit: number) => {
  return {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1
  };
};

/**
 * Ensure a directory exists, create it if it doesn't
 * @param dirPath Directory path
 */
export const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Delete a file if it exists
 * @param filePath Path to the file
 * @returns Boolean indicating if file was deleted
 */
export const deleteFileIfExists = (filePath: string): boolean => {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
};

/**
 * Get file extension from filename
 * @param filename Filename
 * @returns File extension
 */
export const getFileExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase();
};

/**
 * Check if a file is an image
 * @param filename Filename
 * @returns Boolean indicating if file is an image
 */
export const isImageFile = (filename: string): boolean => {
  const ext = getFileExtension(filename);
  return ['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext);
};

/**
 * Format file size in human-readable format
 * @param bytes File size in bytes
 * @returns Formatted file size string
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Sanitize a string for use in SQL queries
 * @param str String to sanitize
 * @returns Sanitized string
 */
export const sanitizeString = (str: string): string => {
  return str.replace(/['";\\]/g, '');
};

/**
 * Convert a string to boolean
 * @param value String value
 * @returns Boolean value
 */
export const stringToBoolean = (value: string | undefined): boolean => {
  if (!value) return false;
  return ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
};

/**
 * Parse date range from request query
 * @param req Express request object
 * @returns Object with startDate and endDate
 */
export const parseDateRange = (req: Request): { startDate: string | null; endDate: string | null } => {
  const startDate = req.query.startDate as string || null;
  const endDate = req.query.endDate as string || null;
  return { startDate, endDate };
};

/**
 * Get client IP address from request
 * @param req Express request object
 * @returns IP address string
 */
export const getClientIp = (req: Request): string => {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    ''
  );
};

/**
 * Create a URL-friendly slug from a string
 * @param str String to convert to slug
 * @returns URL-friendly slug
 */
export const createSlug = (str: string): string => {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Mask sensitive data in a string (e.g., for logging)
 * @param str String containing sensitive data
 * @returns String with masked sensitive data
 */
export const maskSensitiveData = (str: string): string => {
  // Mask email addresses
  str = str.replace(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi, '***@***.***');
  
  // Mask credit card numbers
  str = str.replace(/\b(?:\d{4}[ -]?){3}(?:\d{4})\b/g, '****-****-****-****');
  
  // Mask phone numbers
  str = str.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '***-***-****');
  
  return str;
};

/**
 * Generate a unique filename with timestamp
 * @param originalFilename Original filename
 * @returns Unique filename
 */
export const generateUniqueFilename = (originalFilename: string): string => {
  const ext = path.extname(originalFilename);
  const basename = path.basename(originalFilename, ext);
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  
  return `${basename}-${timestamp}-${random}${ext}`;
};
