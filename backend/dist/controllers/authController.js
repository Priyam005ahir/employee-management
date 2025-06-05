"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetPassword = exports.forgotPassword = exports.changePassword = exports.getCurrentUser = exports.refreshToken = exports.logout = exports.login = exports.register = void 0;
const db_1 = __importDefault(require("../config/db"));
const errorHandler_1 = require("../middleware/errorHandler");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const crypto_1 = __importDefault(require("crypto"));
// Register a new user
const register = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, email, password, name } = req.body;
        // Validate input
        if (!username || !email || !password || !name) {
            throw new errorHandler_1.ApiError(400, 'Please provide username, email, password, and name');
        }
        // Check if user already exists
        const userExists = yield db_1.default.query('SELECT * FROM users WHERE email = $1 OR username = $2', [email, username]);
        if (userExists.rows.length > 0) {
            throw new errorHandler_1.ApiError(400, 'User with that email or username already exists');
        }
        // Hash password
        const salt = yield bcrypt_1.default.genSalt(10);
        const hashedPassword = yield bcrypt_1.default.hash(password, salt);
        // Create user
        const result = yield db_1.default.query(`INSERT INTO users (username, email, password, name) 
       VALUES ($1, $2, $3, $4) RETURNING user_id, username, email, name, role, created_at`, [username, email, hashedPassword, name]);
        // Generate tokens
        const accessToken = generateAccessToken(result.rows[0].user_id);
        const refreshToken = generateRefreshToken(result.rows[0].user_id);
        // Save refresh token to database
        yield db_1.default.query('INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)', [result.rows[0].user_id, refreshToken]);
        // Set cookies
        setTokenCookies(res, accessToken, refreshToken);
        res.status(201).json({
            status: 'success',
            message: 'User registered successfully',
            data: {
                user: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.register = register;
// Login user
const login = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password } = req.body;
        // Validate input
        if (!username || !password) {
            throw new errorHandler_1.ApiError(400, 'Please provide username and password');
        }
        // Check if user exists
        const result = yield db_1.default.query('SELECT * FROM users WHERE username = $1 OR email = $1', [username]);
        if (result.rows.length === 0) {
            throw new errorHandler_1.ApiError(401, 'Invalid credentials');
        }
        const user = result.rows[0];
        // Check password
        const isPasswordValid = yield bcrypt_1.default.compare(password, user.password);
        if (!isPasswordValid) {
            throw new errorHandler_1.ApiError(401, 'Invalid credentials');
        }
        // Generate tokens
        const accessToken = generateAccessToken(user.user_id);
        const refreshToken = generateRefreshToken(user.user_id);
        // Save refresh token to database
        yield db_1.default.query('INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)', [user.user_id, refreshToken]);
        // Set cookies
        setTokenCookies(res, accessToken, refreshToken);
        // Remove password from response
        const userResponse = Object.assign({}, user);
        delete userResponse.password;
        res.status(200).json({
            status: 'success',
            message: 'Login successful',
            data: {
                user: userResponse
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.login = login;
// Logout user
const logout = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (refreshToken) {
            // Delete refresh token from database
            yield db_1.default.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
        }
        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        res.status(200).json({
            status: 'success',
            message: 'Logout successful'
        });
    }
    catch (error) {
        next(error);
    }
});
exports.logout = logout;
// Refresh token
const refreshToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const refreshToken = req.cookies.refreshToken;
        if (!refreshToken) {
            throw new errorHandler_1.ApiError(401, 'Refresh token not found');
        }
        // Verify refresh token
        let decoded;
        try {
            decoded = jsonwebtoken_1.default.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        }
        catch (error) {
            throw new errorHandler_1.ApiError(401, 'Invalid refresh token');
        }
        // Check if refresh token exists in database
        const tokenExists = yield db_1.default.query('SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2', [refreshToken, decoded.userId]);
        if (tokenExists.rows.length === 0) {
            throw new errorHandler_1.ApiError(401, 'Refresh token has been revoked');
        }
        // Generate new access token
        const accessToken = generateAccessToken(decoded.userId);
        // Set new access token cookie
        res.cookie('accessToken', accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 15 * 60 * 1000 // 15 minutes
        });
        res.status(200).json({
            status: 'success',
            message: 'Token refreshed successfully'
        });
    }
    catch (error) {
        next(error);
    }
});
exports.refreshToken = refreshToken;
// Get current user
const getCurrentUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            throw new errorHandler_1.ApiError(401, 'Not authenticated');
        }
        const result = yield db_1.default.query('SELECT user_id, username, email, name, role, created_at, updated_at FROM users WHERE user_id = $1', [userId]);
        if (result.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'User not found');
        }
        res.status(200).json({
            status: 'success',
            data: {
                user: result.rows[0]
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.getCurrentUser = getCurrentUser;
// Change password
const changePassword = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        if (!userId) {
            throw new errorHandler_1.ApiError(401, 'Not authenticated');
        }
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            throw new errorHandler_1.ApiError(400, 'Please provide current password and new password');
        }
        // Get user
        const userResult = yield db_1.default.query('SELECT * FROM users WHERE user_id = $1', [userId]);
        if (userResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(404, 'User not found');
        }
        const user = userResult.rows[0];
        // Verify current password
        const isPasswordValid = yield bcrypt_1.default.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            throw new errorHandler_1.ApiError(401, 'Current password is incorrect');
        }
        // Hash new password
        const salt = yield bcrypt_1.default.genSalt(10);
        const hashedPassword = yield bcrypt_1.default.hash(newPassword, salt);
        // Update password
        yield db_1.default.query('UPDATE users SET password = $1, updated_at = NOW() WHERE user_id = $2', [hashedPassword, userId]);
        // Invalidate all refresh tokens for this user
        yield db_1.default.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
        // Clear cookies
        res.clearCookie('accessToken');
        res.clearCookie('refreshToken');
        res.status(200).json({
            status: 'success',
            message: 'Password changed successfully. Please login again.'
        });
    }
    catch (error) {
        next(error);
    }
});
exports.changePassword = changePassword;
// Forgot password
const forgotPassword = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({
                status: 'error',
                message: 'Please provide an email address'
            });
        }
        // Check if user exists
        const userResult = yield db_1.default.query('SELECT * FROM users WHERE email = $1', [email]);
        // Don't reveal if user exists or not for security
        res.status(200).json({
            status: 'success',
            message: 'If a user with that email exists, a password reset link has been sent'
        });
    }
    catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            status: 'error',
            message: 'An error occurred while processing your request'
        });
    }
});
exports.forgotPassword = forgotPassword;
// Reset password
const resetPassword = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.params;
        const { password } = req.body;
        if (!token) {
            throw new errorHandler_1.ApiError(400, 'Reset token is required');
        }
        if (!password) {
            throw new errorHandler_1.ApiError(400, 'Please provide a new password');
        }
        // Hash token to compare with stored hash
        const hashedToken = crypto_1.default
            .createHash('sha256')
            .update(token)
            .digest('hex');
        // Find user with this token
        const userResult = yield db_1.default.query(`SELECT * FROM users 
       WHERE reset_token = $1 AND reset_token_expiry > NOW()`, [hashedToken]);
        if (userResult.rows.length === 0) {
            throw new errorHandler_1.ApiError(400, 'Invalid or expired reset token');
        }
        // Hash new password
        const salt = yield bcrypt_1.default.genSalt(10);
        const hashedPassword = yield bcrypt_1.default.hash(password, salt);
        // Update user password and clear reset token
        yield db_1.default.query(`UPDATE users 
       SET password = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW() 
       WHERE user_id = $2`, [hashedPassword, userResult.rows[0].user_id]);
        // Invalidate all refresh tokens for this user
        yield db_1.default.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userResult.rows[0].user_id]);
        res.status(200).json({
            status: 'success',
            message: 'Password has been reset successfully. Please login with your new password.'
        });
    }
    catch (error) {
        next(error);
    }
});
exports.resetPassword = resetPassword;
// Helper functions
const generateAccessToken = (userId) => {
    return jsonwebtoken_1.default.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '15m' });
};
const generateRefreshToken = (userId) => {
    return jsonwebtoken_1.default.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};
const setTokenCookies = (res, accessToken, refreshToken) => {
    res.cookie('accessToken', accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};
