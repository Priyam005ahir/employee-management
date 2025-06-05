"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
router.post('/register', authController_1.register);
router.post('/login', authController_1.login);
router.post('/logout', auth_1.authenticate, authController_1.logout);
router.post('/refresh-token', authController_1.refreshToken);
router.get('/me', auth_1.authenticate, authController_1.getCurrentUser);
router.put('/change-password', auth_1.authenticate, authController_1.changePassword);
// Fix for forgotPassword route - use the correct type signature
router.post('/forgot-password', (req, res, next) => {
    (0, authController_1.forgotPassword)(req, res, next);
});
router.post('/reset-password/:token', authController_1.resetPassword);
exports.default = router;
