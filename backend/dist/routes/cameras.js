"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cameraController_1 = require("../controllers/cameraController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * @route   GET /api/cameras
 * @desc    Get all cameras
 * @access  Private
 */
router.get('/', auth_1.authenticate, cameraController_1.getAllCameras);
/**
 * @route   GET /api/cameras/:id
 * @desc    Get a single camera by ID
 * @access  Private
 */
router.get('/:id', auth_1.authenticate, cameraController_1.getCamera);
/**
 * @route   POST /api/cameras
 * @desc    Create a new camera
 * @access  Private (Admin only)
 */
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), cameraController_1.createCamera);
/**
 * @route   PUT /api/cameras/:id
 * @desc    Update a camera
 * @access  Private (Admin only)
 */
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), cameraController_1.updateCamera);
/**
 * @route   DELETE /api/cameras/:id
 * @desc    Delete a camera
 * @access  Private (Admin only)
 */
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), cameraController_1.deleteCamera);
exports.default = router;
