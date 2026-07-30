import os
import uuid
from flask import Blueprint, request, jsonify, session, send_from_directory
from werkzeug.utils import secure_filename
from models import db, Message, Chat, User
from config import Config

uploads_bp = Blueprint('uploads', __name__)

ALLOWED_PHOTOS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ALLOWED_VIDEOS = {'mp4', 'mov', 'avi', 'mkv', 'webm'}
ALLOWED_AUDIOS = {'mp3', 'ogg', 'wav', 'flac', 'aac', 'm4a'}

def allowed_file(filename, allowed_set):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_set

def get_file_type(ext):
    ext = ext.lower()
    if ext in ALLOWED_PHOTOS: return 'photo'
    if ext in ALLOWED_VIDEOS: return 'video'
    if ext in ALLOWED_AUDIOS: return 'audio'
    return 'document'

@uploads_bp.route('/api/upload', methods=['POST'])
def upload_file():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    chat_id = request.form.get('chat_id', type=int)
    reply_to = request.form.get('reply_to', type=int)

    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400

    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    file_type = get_file_type(ext)

    folder_map = {'photo': 'photos', 'video': 'videos', 'audio': 'audios', 'document': 'photos'}
    subfolder = folder_map[file_type]

    filename = f'{uuid.uuid4().hex}.{ext}' if ext else f'{uuid.uuid4().hex}'
    filepath = os.path.join(Config.UPLOAD_FOLDER, subfolder, filename)
    file.save(filepath)

    file_size = os.path.getsize(filepath)

    if chat_id:
        msg = Message(
            chat_id=chat_id,
            sender_id=user_id,
            text=request.form.get('caption', ''),
            file_path=filename,
            file_type=file_type,
            file_size=file_size,
            reply_to=reply_to
        )
        db.session.add(msg)
        chat = db.session.get(Chat, chat_id)
        if chat:
            chat.last_message_id = msg.id
        db.session.commit()
        return jsonify({'message': msg.to_dict()}), 201

    return jsonify({
        'file_path': f'/uploads/{subfolder}/{filename}',
        'file_type': file_type,
        'file_size': file_size,
        'filename': filename
    })

@uploads_bp.route('/uploads/<subfolder>/<filename>')
def serve_file(subfolder, filename):
    folder = os.path.join(Config.UPLOAD_FOLDER, subfolder)
    return send_from_directory(folder, filename)

@uploads_bp.route('/api/upload/photo', methods=['POST'])
def upload_photo():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    file = request.files['file']
    if not allowed_file(file.filename, ALLOWED_PHOTOS):
        return jsonify({'error': 'Invalid photo format'}), 400
    ext = file.filename.rsplit('.', 1)[1].lower()
    filename = f'{uuid.uuid4().hex}.{ext}'
    filepath = os.path.join(Config.UPLOAD_FOLDER, 'photos', filename)
    file.save(filepath)
    return jsonify({'file_path': f'/uploads/photos/{filename}'})
