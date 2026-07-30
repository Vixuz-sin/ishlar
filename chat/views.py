import os
import hashlib
from django.conf import settings
from django.utils import timezone
from django.db.models import Q
from django.contrib.auth import authenticate, login as dj_login, logout as dj_logout
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt

from .models import User, Chat, Message
from .serializers import UserSerializer, ChatSerializer, MessageSerializer


def get_online_status(user):
    if not user.last_online:
        return 'offline'
    delta = timezone.now() - user.last_online
    if delta.total_seconds() < 300:
        return 'online'
    return 'offline'


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    if not username or len(username) < 3:
        return Response({'error': 'Username must be at least 3 characters'}, status=400)
    if not password or len(password) < 4:
        return Response({'error': 'Password must be at least 4 characters'}, status=400)
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Username already exists'}, status=400)

    user = User(username=username)
    user.set_password(password)
    user.save()

    dj_login(request, user)
    return Response({'user': UserSerializer(user).data}, status=201)


@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get('username', '').strip()
    password = request.data.get('password', '')

    user = authenticate(request, username=username, password=password)
    if not user:
        return Response({'error': 'Invalid credentials'}, status=401)

    user.last_online = timezone.now()
    user.save(update_fields=['last_online'])
    dj_login(request, user)
    return Response({'user': UserSerializer(user).data})


@csrf_exempt
@api_view(['POST'])
def logout(request):
    dj_logout(request)
    return Response({'status': 'ok'})


@api_view(['GET'])
def me(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    data = UserSerializer(request.user).data
    data['online_status'] = get_online_status(request.user)
    return Response({'user': data})


@csrf_exempt
@api_view(['GET', 'POST'])
def chats(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)

    if request.method == 'GET':
        chat_list = request.user.chats.all().order_by('-created_at')
        data = []
        for chat in chat_list:
            cd = ChatSerializer(chat).data
            for m in cd['members']:
                if m['id'] != request.user.id:
                    m['online_status'] = get_online_status(User.objects.get(id=m['id']))
            data.append(cd)
        return Response({'chats': data})

    chat_type = request.data.get('type', 'private')
    name = request.data.get('name', None)
    member_ids = request.data.get('member_ids', [])

    if request.user.id not in member_ids:
        member_ids.append(request.user.id)

    if chat_type == 'private' and len(member_ids) == 2:
        existing = Chat.objects.filter(type='private').prefetch_related('members')
        for chat in existing:
            mids = sorted([m.id for m in chat.members.all()])
            if mids == sorted(member_ids):
                return Response({'chat': ChatSerializer(chat).data, 'existing': True})

    chat = Chat.objects.create(type=chat_type, name=name)
    chat.members.add(*User.objects.filter(id__in=member_ids))
    return Response({'chat': ChatSerializer(chat).data}, status=201)


@csrf_exempt
@api_view(['GET', 'POST'])
def chat_detail(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)

    try:
        chat = Chat.objects.get(id=chat_id)
    except Chat.DoesNotExist:
        return Response({'error': 'Chat not found'}, status=404)

    if request.method == 'GET':
        return Response({'chat': ChatSerializer(chat).data})

    if request.method == 'POST':
        text = request.data.get('text', '').strip()
        file_path = request.data.get('file_path', None)
        file_type = request.data.get('file_type', None)
        file_size = request.data.get('file_size', None)
        reply_to_id = request.data.get('reply_to', None)

        if not text and not file_path:
            return Response({'error': 'Text or file required'}, status=400)

        reply_to = None
        if reply_to_id:
            try:
                reply_to = Message.objects.get(id=reply_to_id)
            except Message.DoesNotExist:
                pass

        msg = Message.objects.create(
            chat=chat, sender=request.user, text=text,
            file_path=file_path, file_type=file_type,
            file_size=file_size, reply_to=reply_to
        )
        chat.last_message = msg
        chat.save(update_fields=['last_message'])
        return Response({'message': MessageSerializer(msg).data}, status=201)


@api_view(['GET'])
def chat_messages(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)

    try:
        page = int(request.query_params.get('page', 1))
        per_page = int(request.query_params.get('per_page', 50))
    except ValueError:
        page = 1
        per_page = 50

    messages = Message.objects.filter(chat_id=chat_id).order_by('-created_at')
    total = messages.count()
    start = (page - 1) * per_page
    end = start + per_page
    result = MessageSerializer(messages[start:end], many=True).data
    result.reverse()

    return Response({
        'messages': result, 'page': page,
        'total': total, 'pages': max(1, (total + per_page - 1) // per_page)
    })


@api_view(['GET'])
def get_message(request, message_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        msg = Message.objects.get(id=message_id)
    except Message.DoesNotExist:
        return Response({'error': 'Not found'}, status=404)
    return Response({'message': MessageSerializer(msg).data})


@csrf_exempt
@api_view(['DELETE'])
def delete_message(request, message_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        msg = Message.objects.get(id=message_id, sender=request.user)
        msg.delete()
        return Response({'status': 'ok'})
    except Message.DoesNotExist:
        return Response({'error': 'Not found or not yours'}, status=404)


@csrf_exempt
@api_view(['PATCH'])
def edit_message(request, message_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    text = request.data.get('text', '').strip()
    if not text:
        return Response({'error': 'Text required'}, status=400)
    try:
        msg = Message.objects.get(id=message_id, sender=request.user)
        msg.text = text
        msg.edited = True
        msg.save(update_fields=['text', 'edited'])
        return Response({'message': MessageSerializer(msg).data})
    except Message.DoesNotExist:
        return Response({'error': 'Not found or not yours'}, status=404)


@api_view(['GET'])
def search_users(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response({'users': []})
    filters = Q()
    if query.isdigit():
        filters |= Q(id=int(query))
    filters |= Q(username__icontains=query)
    filters |= Q(phone__icontains=query)
    filters &= ~Q(id=request.user.id)
    users = User.objects.filter(filters)[:20]
    return Response({'users': UserSerializer(users, many=True).data})


@api_view(['GET'])
def list_users(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    users = User.objects.exclude(id=request.user.id)
    return Response({'users': UserSerializer(users, many=True).data})


@api_view(['GET'])
def poll_messages(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat_id = int(request.query_params.get('chat_id'))
        after = int(request.query_params.get('after', -1))
    except (TypeError, ValueError):
        return Response({'messages': []})
    messages = Message.objects.filter(chat_id=chat_id, id__gt=after).order_by('created_at')
    return Response({'messages': MessageSerializer(messages, many=True).data})


@csrf_exempt
@api_view(['POST'])
def upload_file(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    file = request.FILES.get('file')
    chat_id = request.data.get('chat_id')
    caption = request.data.get('caption', '')
    reply_to_id = request.data.get('reply_to', None)

    if not file or not chat_id:
        return Response({'error': 'File and chat_id required'}, status=400)
    try:
        chat_id = int(chat_id)
    except ValueError:
        return Response({'error': 'Invalid chat_id'}, status=400)

    ext = os.path.splitext(file.name)[1]
    raw_name = hashlib.md5(f"{timezone.now()}{file.name}".encode()).hexdigest()
    ftype = file.content_type.split('/')[0] if '/' in file.content_type else 'file'
    subfolder = f"{ftype}s"
    filename = f"{raw_name}{ext}"

    upload_dir = os.path.join(settings.MEDIA_ROOT, subfolder)
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, filename), 'wb+') as dest:
        for chunk in file.chunks():
            dest.write(chunk)

    rel_path = f"{subfolder}/{filename}"
    reply_to = None
    if reply_to_id:
        try:
            reply_to = Message.objects.get(id=int(reply_to_id))
        except (ValueError, Message.DoesNotExist):
            pass

    msg = Message.objects.create(
        chat_id=chat_id, sender=request.user,
        text=caption or '', file_path=rel_path,
        file_type=ftype, file_size=file.size, reply_to=reply_to
    )
    Chat.objects.filter(id=chat_id).update(last_message=msg)
    return Response({'message': MessageSerializer(msg).data}, status=201)


@csrf_exempt
@api_view(['POST'])
def upload_photo(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'No file'}, status=400)
    ext = os.path.splitext(file.name)[1]
    raw_name = hashlib.md5(f"{timezone.now()}{file.name}".encode()).hexdigest()
    filename = f"{raw_name}{ext}"
    upload_dir = os.path.join(settings.MEDIA_ROOT, 'avatars')
    os.makedirs(upload_dir, exist_ok=True)
    with open(os.path.join(upload_dir, filename), 'wb+') as dest:
        for chunk in file.chunks():
            dest.write(chunk)
    User.objects.filter(id=request.user.id).update(avatar=filename)
    return Response({'avatar': f'/uploads/avatars/{filename}'})


@csrf_exempt
@api_view(['PATCH'])
def update_profile(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    bio = request.data.get('bio', '').strip()
    phone = request.data.get('phone', '').strip()
    if bio:
        User.objects.filter(id=request.user.id).update(bio=bio)
    if phone:
        User.objects.filter(id=request.user.id).update(phone=phone)
    user = User.objects.get(id=request.user.id)
    return Response({'user': UserSerializer(user).data})


@api_view(['GET'])
def online_users(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    cutoff = timezone.now() - timezone.timedelta(minutes=5)
    users = User.objects.filter(last_online__gte=cutoff).exclude(id=request.user.id)[:50]
    return Response({'users': UserSerializer(users, many=True).data})


@csrf_exempt
@api_view(['POST'])
def create_group(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    name = request.data.get('name', '').strip()
    member_ids = request.data.get('member_ids', [])
    if not name:
        return Response({'error': 'Group name required'}, status=400)
    if request.user.id not in member_ids:
        member_ids.append(request.user.id)
    chat = Chat.objects.create(type='group', name=name)
    chat.members.add(*User.objects.filter(id__in=member_ids))
    return Response({'chat': ChatSerializer(chat).data}, status=201)
