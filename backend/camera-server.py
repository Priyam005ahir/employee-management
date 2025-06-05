from urllib import response
from flask import Flask, Response, jsonify, request
from flask_cors import CORS
import cv2
import threading
from typing import Dict
from supabase import create_client, Client
from dotenv import load_dotenv
import os
import numpy as np
import base64
import logging
import mediapipe as mp
from datetime import datetime, time
import time
from urllib.parse import unquote
from sklearn.metrics.pairwise import cosine_similarity
import face_recognition
import pickle
import assistant
import tensorflow as tf
from flask_cors import CORS
from langchain.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain.schema.messages import SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain_community.chat_message_histories import ChatMessageHistory
from langchain_google_genai import ChatGoogleGenerativeAI
import queue
from functools import lru_cache
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="mediapipe")

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}},
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize Supabase client with environment variables
supabase_url = os.getenv("VITE_SUPABASE_URL")
supabase_key = os.getenv("VITE_SUPABASE_ANON_KEY")
supabase: Client = create_client(supabase_url, supabase_key)

# Initialize MediaPipe Hands for gesture detection
mp_hands = mp.solutions.hands
hands_processor = mp_hands.Hands(
    static_image_mode=False,
    max_num_hands=2,
    model_complexity=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.5
)

# Global state to track active models
active_models = {}

def fix_base64_padding(encoded_str: str) -> str:
    """Add padding to base64 string if needed."""
    padding = len(encoded_str) % 4
    if padding:
        encoded_str += '=' * (4 - padding)
    return encoded_str

def safe_base64_decode(encoded_str: str) -> bytes:
    """Safely decode base64 string with padding correction."""
    try:
        # First try direct decoding
        return base64.b64decode(encoded_str)
    except Exception:
        try:
            # Try with padding correction
            padded_str = fix_base64_padding(encoded_str)
            return base64.b64decode(padded_str)
        except Exception as e:
            logger.error(f"Failed to decode base64 string: {str(e)}")
            raise

class Assistant:
    def __init__(self):
        self.fire_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_FIRE"))
        self.helmet_model = self._initialize_model(os.getenv("GOOGLE_API_KEY_HELMET"))
        self.fire_chain = self._create_inference_chain(self.fire_model) if self.fire_model else None
        self.helmet_chain = self._create_inference_chain(self.helmet_model) if self.helmet_model else None
        self.last_inference_time = 0
        self.inference_cooldown = 0.5

    def _initialize_model(self, api_key):
        try:
            return ChatGoogleGenerativeAI(
                google_api_key=api_key,
                model="gemini-1.5-flash-latest",
                temperature=0.1,
                timeout=2
            )
        except Exception as e:
            app.logger.error(f"Model initialization error: {e}")
            return None

    def answer(self, image, prompt, model_type):
        if model_type == "fire":
            chain = self.fire_chain
        elif model_type == "helmet":
            chain = self.helmet_chain
        else:
            return "Invalid model type"

        if not chain:
            return "Model not initialized"

        current_time = time.time()
        if current_time - self.last_inference_time < self.inference_cooldown:
            return None

        try:
            response = chain.invoke(
                {"prompt": prompt, "image_base64": image},
                config={"configurable": {"session_id": "unused"}},
            ).strip()
            self.last_inference_time = current_time
            return response
        except Exception as e:
            return f"Error: {str(e)}"

    def _create_inference_chain(self, model):
        SYSTEM_PROMPT = """You are a multi-purpose detection assistant. Analyze the provided image and respond accordingly."""

        prompt_template = ChatPromptTemplate.from_messages([
            SystemMessage(content=SYSTEM_PROMPT),
            MessagesPlaceholder(variable_name="chat_history"),
            ("human", [
                {"type": "text", "text": "{prompt}"},
                {"type": "image_url", "image_url": "data:image/jpeg;base64,{image_base64}"},
            ]),
        ])

        chain = prompt_template | model | StrOutputParser()
        return RunnableWithMessageHistory(
            chain,
            lambda _: ChatMessageHistory(),
            input_messages_key="prompt",
            history_messages_key="chat_history",
        )

# Initialize the assistant globally
assistant = Assistant()

class CameraManager:
    def __init__(self):
        self.cameras: Dict[str, cv2.VideoCapture] = {}
        self.locks: Dict[str, threading.Lock] = {}
        self.frame_queues: Dict[str, queue.Queue] = {}  # Frame buffering

    def get_camera(self, camera_id: str, rtsp_url: str) -> cv2.VideoCapture:
        if camera_id not in self.cameras:
            cap = cv2.VideoCapture(rtsp_url, cv2.CAP_FFMPEG)
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer size
            self.cameras[camera_id] = cap
            self.locks[camera_id] = threading.Lock()
            self.frame_queues[camera_id] = queue.Queue(maxsize=2)  # Prevent backlog
        return self.cameras[camera_id]

    def release_camera(self, camera_id: str):
        if camera_id in self.cameras:
            self.cameras[camera_id].release()
            del self.cameras[camera_id]
            del self.locks[camera_id]

camera_manager = CameraManager()

def generate_frames(camera_id: str, rtsp_url: str):
    camera = camera_manager.get_camera(camera_id, rtsp_url)
    if not camera.isOpened():
        app.logger.error(f"Failed to open camera {camera_id} with RTSP URL: {rtsp_url}")
        return
    lock = camera_manager.locks[camera_id]
    
    while True:
        with lock:
            success, frame = camera.read()
            if not success:
                app.logger.error(f"Failed to read frame from camera {camera_id}")
                break
            ret, buffer = cv2.imencode('.jpg', frame)
            if not ret:
                app.logger.error(f"Failed to encode frame from camera {camera_id}")
                break
            frame = buffer.tobytes()
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')

def get_rtsp_url(camera_id: str) -> str:
    response = supabase.table('cameras').select('rtsp_url').eq('camera_id', camera_id).execute()
    if response.data and len(response.data) > 0:
        return unquote(response.data[0]['rtsp_url'])
    return None

@app.route('/video_feed/<camera_id>')
def video_feed(camera_id):
    response = Response(
        generate_frames(camera_id, get_rtsp_url(camera_id)),
        mimetype='multipart/x-mixed-replace; boundary=frame'
    )
    response.headers['Access-Control-Allow-Origin'] = '*'
    return response

@app.route('/capture_frame/<camera_id>')
def capture_frame(camera_id):
    rtsp_url = get_rtsp_url(camera_id)
    if not rtsp_url:
        return {'error': 'Camera not found'}, 404
    
    camera = camera_manager.get_camera(camera_id, rtsp_url)
    lock = camera_manager.locks[camera_id]
    
    with lock:
        success, frame = camera.read()
        if not success:
            return {'error': 'Failed to capture frame'}, 500
        
        ret, buffer = cv2.imencode('.jpg', frame)
        if not ret:
            return {'error': 'Failed to encode frame'}, 500
            
        return Response(buffer.tobytes(), mimetype='image/jpeg')

@app.route('/health')
def health_check():
    return {'status': 'healthy'}

@app.route('/generate_face_encoding', methods=['POST'])
def generate_face_encoding():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    image_file = request.files['image']
    image = face_recognition.load_image_file(image_file)
    face_encodings = face_recognition.face_encodings(image)
    
    if not face_encodings:
        return jsonify({'error': 'No face detected'}), 400

    face_encoding = face_encodings[0]
    # Ensure proper padding in base64 encoding
    serialized_encoding = base64.b64encode(pickle.dumps(face_encoding)).decode('utf-8')
    
    return jsonify({
        'face_encoding': serialized_encoding,
        'message': 'Face encoding generated successfully'
    })


@app.route('/model-control', methods=['POST'])
def handle_model_control():
    try:
        data = request.get_json()
        camera_id = data['camera_id']
        model_id = data['model_id']
        action = data['action']
        if action == 'start':
            if camera_id in active_models:
                return jsonify({'error': 'Model already running'}), 400
                
            # Warm-up frame capture
            rtsp_url = get_rtsp_url(camera_id)
            test_cap = cv2.VideoCapture(rtsp_url)
            if not test_cap.isOpened():
                return jsonify({'error': 'Camera unreachable'}), 500
            test_cap.release()

            active_models[camera_id] = {'running': True}
            threading.Thread(
                target=run_model_inference,
                args=(camera_id, model_id),
                daemon=True
            ).start()

        elif action == 'stop':
            active_models.pop(camera_id, None)

        return jsonify({'status': 'success'})
    
    except Exception as e:
        logger.error(f"Model control error: {str(e)}")
        return jsonify({'error': str(e)}), 500
def get_model_details(model_id: str) -> dict:
    try:
        response = supabase.table('models').select('*').eq('model_id', model_id).execute()
        
        if response.data and len(response.data) > 0:
            return response.data[0]
        else:
            app.logger.error(f"No model found with ID: {model_id}")
            return {'error': 'Model not found'}
    except Exception as e:
        app.logger.error(f"Error fetching model details: {e}")
        return {'error': str(e)}

def run_model_inference(camera_id, model_id):
    rtsp_url = get_rtsp_url(camera_id)
    cap = cv2.VideoCapture(rtsp_url)
    
    model_details = get_model_details(model_id)
    if not model_details or 'error' in model_details:
        app.logger.error(f"Failed to get model details for {model_id}")
        return
    
    while active_models.get(camera_id, {}).get('running', False):
        ret, frame = cap.read()
        if not ret:
            continue
        
        # Process based on model type
        if model_details['type'] == 'helmet':
            process_helmet_model(frame, camera_id)
        elif model_details['type'] == 'fire':
            process_fire_model(frame, camera_id)
        elif model_details['type'] == 'attendance':
            process_attendance(frame, camera_id)
    
    cap.release()

def process_helmet_model(frame, camera_id):
    _, buffer = cv2.imencode('.jpg', frame)
    encoded_frame = base64.b64encode(buffer).decode()
    
    response = assistant.answer(
        encoded_frame,
        "Detect if a person is wearing a helmet. Respond with 'Helmet detected' or 'No helmet detected'.",
        "helmet"
    )
    
    detected = response if response else 'No helmet detected'
    app.logger.info(f"Camera {camera_id}: {detected}")
    
    # Insert detection result into Supabase
    supabase.table('helmet_violations').insert({
        'camera_id': camera_id,
        'detected': detected,
        'created_at': datetime.now().isoformat()
    }).execute()

def process_fire_model(frame, camera_id):
    _, buffer = cv2.imencode('.jpg', frame)
    encoded_frame = base64.b64encode(buffer).decode()
    
    response = assistant.answer(
        encoded_frame,
        "Detect if there is a fire. Respond with 'Fire detected' or 'No fire detected'.",
        "fire"
    )
    
    detected = response if response else 'No fire detected'
    app.logger.info(f"Camera {camera_id}: {detected}")
    
    # Insert detection result into Supabase
    supabase.table('fire_detections').insert({
        'camera_id': camera_id,
        'detected': detected,
        'created_at': datetime.now().isoformat()
    }).execute()

# MODIFIED process_attendance FUNCTION
# UPDATED process_attendance function
def process_attendance(frame, camera_id):
    if not hasattr(process_attendance, "last_processed_time"):
        process_attendance.last_processed_time = 0

    # Process frame only once every 1 second
    current_time = time.time()
    if current_time - process_attendance.last_processed_time < 1:
        return
    process_attendance.last_processed_time = current_time

    # Preload employee face encodings
    if not hasattr(process_attendance, "employee_cache"):
        employees_response = supabase.table('employees').select('*').execute()
        process_attendance.employee_cache = [
            {**emp, "face_encoding": pickle.loads(safe_base64_decode(emp['face_encoding']))}
            for emp in employees_response.data
        ] if employees_response.data else []
        logger.info("Preloaded employee encodings for attendance system.")

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    frame_height, frame_width, _ = rgb_frame.shape

    # Detect faces
    face_locations = face_recognition.face_locations(rgb_frame, model="hog")
    if not face_locations:
        return

    face_encodings = face_recognition.face_encodings(rgb_frame, face_locations)

    # For each face found
    for face_encoding, face_location in zip(face_encodings, face_locations):
        similarities = face_recognition.face_distance(
            [e["face_encoding"] for e in process_attendance.employee_cache], 
            face_encoding
        )
        best_match_idx = np.argmin(similarities)

        if similarities[best_match_idx] < 0.55:
            employee = process_attendance.employee_cache[best_match_idx]
            logger.info(f"Attendance match: {employee['name']}")

            # Crop a region around face (expand a bit)
            top, right, bottom, left = face_location
            top = max(0, top - 100)
            bottom = min(frame_height, bottom + 100)
            left = max(0, left - 100)
            right = min(frame_width, right + 100)
            face_region = rgb_frame[top:bottom, left:right]

            # Gesture Detection around face
            hands = mp_hands.Hands(
                static_image_mode=False,
                max_num_hands=2,
                min_detection_confidence=0.7,
                min_tracking_confidence=0.6,
                model_complexity=1,
            )
            results = hands.process(face_region)

            gesture = None
            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    wrist = hand_landmarks.landmark[mp_hands.HandLandmark.WRIST]
                    thumb_tip = hand_landmarks.landmark[mp_hands.HandLandmark.THUMB_TIP]

                    if thumb_tip.y < wrist.y:  # thumb above wrist = thumb up
                        gesture = "thumb_up"
                    else:  # thumb below wrist = thumb down
                        gesture = "thumb_down"
                    break  # Only process one hand

            hands.close()

            if gesture:
                # Insert attendance log
                try:
                    supabase.table('attendance_logs').insert({
                        'employee_id': employee['employee_id'],
                        'camera_id': camera_id,
                        'gesture_detected': gesture,
                        'timestamp': datetime.now().isoformat()
                    }).execute()
                    logger.info(f"Logged attendance: {employee['name']} - {gesture}")
                except Exception as e:
                    logger.error(f"Database error: {str(e)}")
            
            # Clean up MediaPipe resources
            hands.close()

def calculate_angle(p1, p2, p3):
    """
    Calculate the angle between three points
    """
    import math
    
    # Calculate vectors
    v1 = (p2[0] - p1[0], p2[1] - p1[1])
    v2 = (p3[0] - p2[0], p3[1] - p2[1])
    
    # Calculate angle in degrees
    dot_product = v1[0] * v2[0] + v1[1] * v2[1]
    magnitudes = math.sqrt((v1[0]**2 + v1[1]**2) * (v2[0]**2 + v2[1]**2))
    
    if magnitudes == 0:
        return 0
        
    cos_angle = max(min(dot_product / magnitudes, 1), -1)
    angle_rad = math.acos(cos_angle)
    angle_deg = math.degrees(angle_rad)
    
    return angle_deg



# Add cleanup handler
@app.route('/shutdown', methods=['POST'])
def shutdown():
    hands_processor.close()
    logger.info("Cleaned up MediaPipe resources")
    return jsonify({'status': 'shutting down'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)