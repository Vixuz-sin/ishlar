from rest_framework import serializers
from .models import User, Chat, Message


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'phone', 'avatar', 'bio', 'last_online']


class MessageSerializer(serializers.ModelSerializer):
    sender = UserSerializer(read_only=True)
    reply_to_data = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'chat_id', 'sender', 'text', 'file_path', 'file_type',
                   'file_size', 'reply_to', 'reply_to_data', 'edited', 'created_at']

    def get_reply_to_data(self, obj):
        if obj.reply_to:
            return {
                'id': obj.reply_to.id,
                'text': obj.reply_to.text[:100] if obj.reply_to.text else None,
                'sender': obj.reply_to.sender.username if obj.reply_to.sender else None,
                'file_type': obj.reply_to.file_type,
            }
        return None


class ChatSerializer(serializers.ModelSerializer):
    members = UserSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Chat
        fields = ['id', 'type', 'name', 'photo', 'members', 'last_message', 'created_at']

    def get_last_message(self, obj):
        if obj.last_message:
            return MessageSerializer(obj.last_message).data
        last = Message.objects.filter(chat=obj).order_by('-created_at').first()
        if last:
            return MessageSerializer(last).data
        return None
