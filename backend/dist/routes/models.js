"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const modelController_1 = require("../controllers/modelController");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
/**
 * @route   GET /api/models
 * @desc    Get all AI models
 * @access  Private
 */
router.get('/', auth_1.authenticate, modelController_1.getAllModels);
/**
 * @route   GET /api/models/:id
 * @desc    Get a single AI model by ID
 * @access  Private
 */
router.get('/:id', auth_1.authenticate, modelController_1.getModel);
/**
 * @route   POST /api/models
 * @desc    Create a new AI model
 * @access  Private (Admin only)
 */
router.post('/', auth_1.authenticate, (0, auth_1.authorize)('admin'), modelController_1.createModel);
/**
 * @route   PUT /api/models/:id
 * @desc    Update an AI model
 * @access  Private (Admin only)
 */
router.put('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), modelController_1.updateModel);
/**
 * @route   DELETE /api/models/:id
 * @desc    Delete an AI model
 * @access  Private (Admin only)
 */
router.delete('/:id', auth_1.authenticate, (0, auth_1.authorize)('admin'), modelController_1.deleteModel);
/**
 * @route   POST /api/models/:id/start
 * @desc    Start an AI model on a specific camera
 * @access  Private
 */
router.post('/:id/start', auth_1.authenticate, modelController_1.startModel);
/**
 * @route   POST /api/models/:id/stop
 * @desc    Stop an AI model running on a specific camera
 * @access  Private
 */
router.post('/:id/stop', auth_1.authenticate, modelController_1.stopModel);
exports.default = router;
