import { Request, Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

// Register a new user
//export const register = async (req: Request, res: Response, next: NextFunction) => {
 // try {
   // console.log(req.body)
   // const { username, email, password, name} = req.body;

   // if (!username || !email || !password || !name) {
    //  throw new ApiError(400, 'Please provide username, email, password, and name');
   // }

   // const userExists = await pool.query(
     // 'SELECT * FROM users WHERE email = $1 OR username = $2',
     // [email, username]
  //  );

   // if (userExists.rows.length > 0) {
    //  throw new ApiError(400, 'User with that email or username already exists');
   // }

   // const salt = await bcrypt.genSalt(10);
   // const hashedPassword = await bcrypt.hash(password, salt);

    //const result = await pool.query(
     // `INSERT INTO users (username, email, password, name) 
    //   VALUES ($1, $2, $3, $4) RETURNING user_id, username, email, name, role, created_at`,
    //  [username, email, hashedPassword, name]
   // );

   // const user = result.rows[0];
   // const accessToken = generateAccessToken(user.user_id, user.role);
   // const refreshToken = generateRefreshToken(user.user_id);

    //await pool.query(
     // 'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
     // [user.user_id, refreshToken]
   // );

   // setTokenCookies(res, accessToken, refreshToken);

   // res.status(201).json({
     // status: 'success',
     // message: 'User registered successfully',
     // data: {
       // user,
       // accessToken,
       // refreshToken
    //  }
//});
 // } catch (error) {
   // next(error);
  //}
//};

// Login user
//export const login = async (req: Request, res: Response, next: NextFunction) => {
  //try {
    //const { email, password } = req.body;

    //if (!email || !password) {
      //throw new ApiError(400, "Please provide email and password");
    //}

    //const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    //const user = result.rows[0];

    //if (!user) {
      //throw new ApiError(401, "Invalid credentials");
    //}

    //const isMatch = await bcrypt.compare(password, user.password);
   // if (!isMatch) {
     // throw new ApiError(401, "Invalid credentials");
    //}

   // const accessToken = generateAccessToken(user.user_id, user.role);
    //const refreshToken = generateRefreshToken(user.user_id);

    //await pool.query(
      //'INSERT INTO refresh_tokens (user_id, token) VALUES ($1, $2)',
      //[user.user_id, refreshToken]
    //);

    //setTokenCookies(res, accessToken, refreshToken);

    //res.status(200).json({
      //status: 'success',
      //message: 'Login successful',
      //data: {
        //user,
        //accessToken,
        //refreshToken
     // }
    //});
  //} catch (error) {
    //next(error);
  //}
//};

// Logout user
export const logout = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await pool.query(
        'DELETE FROM refresh_tokens WHERE token = $1',
        [refreshToken]
      );
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({
      status: 'success',
      message: 'Logout successful'
    });
  } catch (error) {
    next(error);
  }
};

// Refresh token
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      throw new ApiError(401, 'Refresh token not found');
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET as string);
    } catch (error) {
      throw new ApiError(401, 'Invalid refresh token');
    }

    const userId = (decoded as any).userId;

    const tokenExists = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND user_id = $2',
      [refreshToken, userId]
    );

    if (tokenExists.rows.length === 0) {
      throw new ApiError(401, 'Refresh token has been revoked');
    }

    const userResult = await pool.query(
      'SELECT role FROM users WHERE user_id = $1',
      [userId]
    );

    const role = userResult.rows[0].role;

    const accessToken = generateAccessToken(userId, role);

    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 15 * 60 * 1000
    });

    res.status(200).json({
      status: 'success',
      message: 'Token refreshed successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Get current user
export const getCurrentUser = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, 'Not authenticated');
    }

    const result = await pool.query(
      'SELECT user_id, username, email, name, role, created_at, updated_at FROM users WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new ApiError(404, 'User not found');
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Change password
export const changePassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      throw new ApiError(401, 'Not authenticated');
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      throw new ApiError(400, 'Please provide current password and new password');
    }

    const userResult = await pool.query(
      'SELECT * FROM users WHERE user_id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new ApiError(404, 'User not found');
    }

    const user = userResult.rows[0];

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);

    if (!isPasswordValid) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE user_id = $2',
      [hashedPassword, userId]
    );

    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [userId]
    );

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    next(error);
  }
};

// Forgot password
export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide an email address'
      });
    }

    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    res.status(200).json({
      status: 'success',
      message: 'If a user with that email exists, a password reset link has been sent'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'An error occurred while processing your request'
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      throw new ApiError(400, 'Reset token is required');
    }

    if (!password) {
      throw new ApiError(400, 'Please provide a new password');
    }

    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    const userResult = await pool.query(
      `SELECT * FROM users 
       WHERE reset_token = $1 AND reset_token_expiry > NOW()`,
      [hashedToken]
    );

    if (userResult.rows.length === 0) {
      throw new ApiError(400, 'Invalid or expired reset token');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      `UPDATE users 
       SET password = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = NOW() 
       WHERE user_id = $2`,
      [hashedPassword, userResult.rows[0].user_id]
    );

    await pool.query(
      'DELETE FROM refresh_tokens WHERE user_id = $1',
      [userResult.rows[0].user_id]
    );

    res.status(200).json({
      status: 'success',
      message: 'Password has been reset successfully. Please login with your new password.'
    });
  } catch (error) {
    next(error);
  }
};

// 🔐 Updated Token Generators
const generateAccessToken = (userId: string, role: string) => {
  return jwt.sign(
    { userId, role },
    process.env.ACCESS_TOKEN_SECRET as string,
    { expiresIn: '15m' }
  );
};

const generateRefreshToken = (userId: string) => {
  return jwt.sign(
    { userId },
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: '7d' }
  );
};

const setTokenCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60 * 1000
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
};
