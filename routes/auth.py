from flask import Blueprint, request, jsonify, session
from models import db, User
from datetime import datetime, timezone

auth = Blueprint('auth', __name__)

@auth.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or len(username) < 3:
        return jsonify({'error': 'Username must be at least 3 characters'}), 400
    if not password or len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({'error': 'Username already exists'}), 400

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    session['user_id'] = user.id
    return jsonify({'user': user.to_dict()}), 201

@auth.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'error': 'Invalid credentials'}), 401

    user.last_online = datetime.now(timezone.utc)
    db.session.commit()
    session['user_id'] = user.id
    return jsonify({'user': user.to_dict()})

@auth.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    return jsonify({'status': 'ok'})

@auth.route('/api/me')
def get_me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'user': user.to_dict()})
