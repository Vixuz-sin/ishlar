import os
import hashlib
from django.conf import settings
from django.utils import timezone
from django.db.models import Q, Count
from django.contrib.auth import authenticate, login as dj_login, logout as dj_logout
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework import status
from django.views.decorators.csrf import csrf_exempt

from .models import User, Chat, Message, Reaction
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
            cd = ChatSerializer(chat, context={'request_user': request.user}).data
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
        mids = sorted(member_ids)
        existing = Chat.objects.filter(type='private', members__id__in=member_ids)\
            .annotate(mcnt=Count('members'))\
            .filter(mcnt=len(member_ids))
        for chat in existing:
            chat_mids = sorted(chat.members.values_list('id', flat=True))
            if chat_mids == mids:
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

    if not chat.members.filter(id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)

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
        return Response({'message': MessageSerializer(msg, context={"request_user": request.user}).data}, status=201)


@csrf_exempt
@api_view(['POST'])
def send_message(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)

    try:
        chat_id = int(request.data.get('chat_id'))
    except (TypeError, ValueError):
        return Response({'error': 'chat_id required'}, status=400)

    try:
        chat = Chat.objects.get(id=chat_id)
    except Chat.DoesNotExist:
        return Response({'error': 'Chat not found'}, status=404)

    if not chat.members.filter(id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)

    text = request.data.get('text', '').strip()
    if not text:
        return Response({'error': 'Text required'}, status=400)

    reply_to = None
    reply_to_id = request.data.get('reply_to', None)
    if reply_to_id:
        try:
            reply_to = Message.objects.get(id=int(reply_to_id))
        except (ValueError, Message.DoesNotExist):
            pass

    msg = Message.objects.create(
        chat=chat, sender=request.user, text=text, reply_to=reply_to
    )
    msg.read_by.add(request.user)
    chat.last_message = msg
    chat.save(update_fields=['last_message'])
    return Response({'message': MessageSerializer(msg, context={"request_user": request.user}).data}, status=201)


@api_view(['GET'])
def chat_messages(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)

    if not Chat.objects.filter(id=chat_id, members__id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)

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
    result = MessageSerializer(messages[start:end], many=True, context={"request_user": request.user}).data
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
    return Response({'message': MessageSerializer(msg, context={"request_user": request.user}).data})


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
        return Response({'message': MessageSerializer(msg, context={"request_user": request.user}).data})
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
    return Response({'messages': MessageSerializer(messages, many=True, context={"request_user": request.user}).data})


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
    raw_name = hashlib.sha256(f"{timezone.now()}{file.name}".encode()).hexdigest()[:32]
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
    msg.read_by.add(request.user)
    Chat.objects.filter(id=chat_id).update(last_message=msg)
    return Response({'message': MessageSerializer(msg, context={"request_user": request.user}).data}, status=201)


@csrf_exempt
@api_view(['POST'])
def upload_photo(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    file = request.FILES.get('file')
    if not file:
        return Response({'error': 'No file'}, status=400)
    ext = os.path.splitext(file.name)[1]
    raw_name = hashlib.sha256(f"{timezone.now()}{file.name}".encode()).hexdigest()[:32]
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
    return Response({'chat': ChatSerializer(chat, context={'request_user': request.user}).data}, status=201)


@csrf_exempt
@api_view(['POST'])
def mark_read(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat = Chat.objects.get(id=chat_id)
    except Chat.DoesNotExist:
        return Response({'error': 'Chat not found'}, status=404)
    if not chat.members.filter(id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)
    msgs = Message.objects.filter(chat=chat).exclude(sender=request.user).exclude(read_by=request.user)
    request.user.read_messages.add(*list(msgs))
    return Response({'status': 'ok'})


@csrf_exempt
@api_view(['POST'])
def send_typing(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat_id = int(request.data.get('chat_id'))
    except (TypeError, ValueError):
        return Response({'error': 'chat_id required'}, status=400)
    User.objects.filter(id=request.user.id).update(typing_chat_id=chat_id, typing_at=timezone.now())
    return Response({'status': 'ok'})


@api_view(['GET'])
def poll_typing(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat_id = int(request.query_params.get('chat_id'))
    except (TypeError, ValueError):
        return Response({'typing': []})
    cutoff = timezone.now() - timezone.timedelta(seconds=4)
    typers = User.objects.filter(
        typing_chat_id=chat_id, typing_at__gte=cutoff
    ).exclude(id=request.user.id)
    return Response({'typing': [u.username for u in typers]})


@csrf_exempt
@api_view(['POST'])
def forward_message(request, message_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        msg = Message.objects.get(id=message_id)
    except Message.DoesNotExist:
        return Response({'error': 'Message not found'}, status=404)

    chat_ids = request.data.get('chat_ids', [])
    if not chat_ids:
        return Response({'error': 'chat_ids required'}, status=400)

    created = []
    for cid in chat_ids:
        try:
            chat = Chat.objects.get(id=int(cid))
        except (ValueError, Chat.DoesNotExist):
            continue
        if not chat.members.filter(id=request.user.id).exists():
            continue
        new_msg = Message.objects.create(
            chat=chat, sender=request.user, text=msg.text,
            file_path=msg.file_path, file_type=msg.file_type,
            file_size=msg.file_size
        )
        new_msg.read_by.add(request.user)
        chat.last_message = new_msg
        chat.save(update_fields=['last_message'])
        created.append(MessageSerializer(new_msg, context={"request_user": request.user}).data)

    return Response({'messages': created}, status=201)


@csrf_exempt
@api_view(['DELETE'])
def delete_chat(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat = Chat.objects.get(id=chat_id)
    except Chat.DoesNotExist:
        return Response({'error': 'Chat not found'}, status=404)
    if not chat.members.filter(id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)
    chat.members.remove(request.user)
    if chat.members.count() == 0:
        chat.delete()
    return Response({'status': 'ok'})


@csrf_exempt
@api_view(['POST', 'PATCH'])
def manage_chat(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat = Chat.objects.get(id=chat_id)
    except Chat.DoesNotExist:
        return Response({'error': 'Chat not found'}, status=404)
    if not chat.members.filter(id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)

    action = request.data.get('action')
    if action == 'add_members':
        ids = request.data.get('member_ids', [])
        chat.members.add(*User.objects.filter(id__in=ids))
        return Response({'chat': ChatSerializer(chat, context={'request_user': request.user}).data})
    if action == 'remove_member':
        uid = request.data.get('user_id')
        if uid and int(uid) != request.user.id:
            chat.members.remove(int(uid))
        return Response({'chat': ChatSerializer(chat, context={'request_user': request.user}).data})
    if action == 'rename':
        name = request.data.get('name', '').strip()
        if name:
            chat.name = name
            chat.save(update_fields=['name'])
        return Response({'chat': ChatSerializer(chat, context={'request_user': request.user}).data})
    return Response({'error': 'Unknown action'}, status=400)


@csrf_exempt
@api_view(['POST'])
def react_message(request, message_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    emoji = request.data.get('emoji', '').strip()
    if not emoji:
        return Response({'error': 'Emoji required'}, status=400)
    try:
        msg = Message.objects.get(id=message_id)
    except Message.DoesNotExist:
        return Response({'error': 'Message not found'}, status=404)
    if not msg.chat.members.filter(id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)

    reaction = Reaction.objects.filter(message=msg, user=request.user).first()
    if reaction:
        if reaction.emoji == emoji:
            reaction.delete()
        else:
            reaction.emoji = emoji
            reaction.save()
    else:
        Reaction.objects.create(message=msg, user=request.user, emoji=emoji)

    return Response({'message': MessageSerializer(msg, context={"request_user": request.user}).data})


@api_view(['GET'])
def search_messages(request):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    try:
        chat_id = int(request.query_params.get('chat_id'))
    except (TypeError, ValueError):
        return Response({'messages': []})
    query = request.query_params.get('q', '').strip()
    if not query:
        return Response({'messages': []})
    if not Chat.objects.filter(id=chat_id, members__id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)
    messages = Message.objects.filter(chat_id=chat_id, text__icontains=query)\
        .order_by('-created_at')[:100]
    return Response({'messages': MessageSerializer(messages, many=True, context={"request_user": request.user}).data})


@api_view(['GET'])
def chat_media(request, chat_id):
    if not request.user.is_authenticated:
        return Response({'error': 'Not authenticated'}, status=401)
    if not Chat.objects.filter(id=chat_id, members__id=request.user.id).exists():
        return Response({'error': 'Forbidden'}, status=403)
    media = Message.objects.filter(
        chat_id=chat_id, file_type__in=['photo', 'video']
    ).order_by('-created_at')[:200]
    return Response({'media': MessageSerializer(media, many=True, context={"request_user": request.user}).data})
