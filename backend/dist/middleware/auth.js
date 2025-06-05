"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorize = exports.authenticate = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const errorHandler_1 = require("./errorHandler");
// Authenticate middleware
const authenticate = (req, res, next) => {
    var _a;
    try {
        // Get token from cookie or Authorization header
        const token = req.cookies.accessToken ||
            (((_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.startsWith('Bearer'))
                ? req.headers.authorization.split(' ')[1]
                : null);
        if (!token) {
            throw new errorHandler_1.ApiError(401, 'Not authenticated. Please log in');
        }
        // Verify token
        try {
            const decoded = jsonwebtoken_1.default.verify(token, process.env.ACCESS_TOKEN_SECRET);
            // Add user info to request
            req.user = {
                id: decoded.userId,
                role: decoded.role
            };
            next();
        }
        catch (error) {
            if (error instanceof jsonwebtoken_1.default.JsonWebTokenError) {
                throw new errorHandler_1.ApiError(401, 'Invalid token. Please log in again');
            }
            if (error instanceof jsonwebtoken_1.default.TokenExpiredError) {
                throw new errorHandler_1.ApiError(401, 'Token expired. Please refresh your token');
            }
            throw error;
        }
    }
    catch (error) {
        next(error);
    }
};
exports.authenticate = authenticate;
// Authorization middleware
const authorize = (...roles) => {
    /**
     * Middleware to authorize user access based on specified roles
     *
     * @param roles - Array of roles allowed to access the route
     * @returns A middleware function that checks user authentication and role permissions
     * @throws {ApiError} 401 if user is not authenticated
     * @throws {ApiError} 403 if user does not have required role permissions
     */
    return (req, res, next) => {
        if (!req.user) {
            return next(new errorHandler_1.ApiError(401, 'Not authenticated. Please log in'));
        }
        if (!roles.includes(req.user.role || '')) {
            return next(new errorHandler_1.ApiError(403, 'You do not have permission to perform this action'));
        }
        next();
    };
};
exports.authorize = authorize;
