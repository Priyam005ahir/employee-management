import express from 'express';
//import { 
 //register, 
 // login, 
 // logout, 
 // refreshToken,
 // getCurrentUser,
 // changePassword,
 // forgotPassword,
  //resetPassword
//} from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = express.Router();

//router.post('/register', register);
//router.post('/login', login);
//router.post('/logout', authenticate, logout);
//router.post('/refresh-token', refreshToken);
//router.get('/me', authenticate, getCurrentUser);
//router.put('/change-password', authenticate, changePassword);

// Fix for forgotPassword route - use the correct type signature
router.post('/forgot-password', (req, res, next) => {
  //forgotPassword(req, res, next);
});

//router.post('/reset-password/:token', resetPassword);

export default router;
