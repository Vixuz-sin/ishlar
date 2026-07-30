from flask import Blueprint, request, jsonify, session
from models import db, Message, Chat, User

messages_bp = Blueprint('messages', __name__)

@messages_bp.route('/api/chats', methods=['GET'])
def get_chats():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    chats = user.chats
    result = []
    for chat in chats:
        data = chat.to_dict()
        last_msg = Message.query.filter_by(chat_id=chat.id).order_by(Message.created_at.desc()).first()
        if last_msg:
            data['last_message'] = last_msg.to_dict()
        result.append(data)
    return jsonify({'chats': result})

@messages_bp.route('/api/chats', methods=['POST'])
def create_chat():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    data = request.json
    chat_type = data.get('type', 'private')
    name = data.get('name', None)
    member_ids = data.get('member_ids', [])

    if user_id not in member_ids:
        member_ids.append(user_id)

    if chat_type == 'private' and len(member_ids) == 2:
        existing = Chat.query.filter(Chat.type == 'private').all()
        for chat in existing:
            mids = sorted([m.id for m in chat.members])
            if mids == sorted(member_ids):
                return jsonify({'chat': chat.to_dict(), 'existing': True})

    chat = Chat(type=chat_type, name=name)
    for mid in member_ids:
        member = db.session.get(User, mid)
        if member:
            chat.members.append(member)

    db.session.add(chat)
    db.session.commit()
    return jsonify({'chat': chat.to_dict()}), 201

@messages_bp.route('/api/chats/<int:chat_id>/messages', methods=['GET'])
def get_messages(chat_id):
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401

    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 50, type=int)

    messages = Message.query.filter_by(chat_id=chat_id)\
        .order_by(Message.created_at.desc())\
        .paginate(page=page, per_page=per_page, error_out=False)

    result = [m.to_dict() for m in messages.items]
    result.reverse()
    return jsonify({
        'messages': result,
        'page': page,
        'total': messages.total,
        'pages': messages.pages
    })

@messages_bp.route('/api/messages/<int:message_id>', methods=['GET'])
def get_message(message_id):
    msg = db.session.get(Message, message_id)
    if not msg:
        return jsonify({'error': 'Message not found'}), 404
    return jsonify({'message': msg.to_dict()})

@messages_bp.route('/api/users/search', methods=['GET'])
def search_users():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'users': []})
    
    from sqlalchemy import or_
    filters = [User.id != user_id]
    
    if query.isdigit():
        filters.append(User.id == int(query))
    
    filters.append(User.username.ilike(f'%{query}%'))
    filters.append(User.phone.ilike(f'%{query}%'))
    
    users = User.query.filter(or_(*filters)).limit(20).all()
    return jsonify({'users': [u.to_dict() for u in users]})

@messages_bp.route('/api/send', methods=['POST'])
def send_message():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    data = request.json
    chat_id = data.get('chat_id')
    text = data.get('text', '').strip()
    if not chat_id or not text:
        return jsonify({'error': 'Chat ID and text required'}), 400
    msg = Message(chat_id=chat_id, sender_id=user_id, text=text)
    db.session.add(msg)
    chat = db.session.get(Chat, chat_id)
    if chat:
        chat.last_message_id = msg.id
    db.session.commit()
    return jsonify({'message': msg.to_dict()}), 201

@messages_bp.route('/api/users', methods=['GET'])
def get_users():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Not authenticated'}), 401
    users = User.query.filter(User.id != user_id).all()
    return jsonify({'users': [u.to_dict() for u in users]})
