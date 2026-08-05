from rest_framework import serializers
from .models import User, Chat, Message, Reaction


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'phone', 'avatar', 'bio', 'last_online']


class ReactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reaction
        fields = ['id', 'emoji', 'user_id']


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    reply_to_data = serializers.SerializerMethodField()
    read = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'chat_id', 'sender', 'text', 'file_path', 'file_type',
                   'file_size', 'reply_to', 'reply_to_data', 'edited', 'read',
                   'reactions', 'created_at']

    def get_reply_to_data(self, obj):
        if obj.reply_to:
            return {
                'id': obj.reply_to.id,
                'text': obj.reply_to.text[:100] if obj.reply_to.text else None,
                'sender': obj.reply_to.sender.username if obj.reply_to.sender else None,
                'file_type': obj.reply_to.file_type,
            }
        return None

    def get_read(self, obj):
        req_user = self.context.get('request_user') if self.context else None
        if not req_user:
            return False
        if obj.sender_id == req_user.id:
            return obj.read_by.exclude(id=req_user.id).exists()
        return obj.read_by.filter(id=req_user.id).exists()

    def get_reactions(self, obj):
        req_user = self.context.get('request_user') if self.context else None
        agg = {}
        for r in obj.reactions.all():
            agg.setdefault(r.emoji, []).append(r.user_id)
        return [
            {
                'emoji': emoji,
                'count': len(ids),
                'reacted': bool(req_user and req_user.id in ids),
            }
            for emoji, ids in agg.items()
        ]


class ChatSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = Chat
        fields = ['id', 'type', 'name', 'photo', 'members', 'last_message',
                  'unread_count', 'created_at']

    def get_unread_count(self, obj):
        req_user = self.context.get('request_user') if self.context else None
        if not req_user:
            return 0
        return Message.objects.filter(chat=obj).exclude(sender=req_user)\
            .exclude(read_by=req_user).count()

    def get_last_message(self, obj):
        if obj.last_message:
            return MessageSerializer(obj.last_message, context=self.context).data
        last = Message.objects.filter(chat=obj).order_by('-created_at').first()
        if last:
            return MessageSerializer(last, context=self.context).data
        return None
