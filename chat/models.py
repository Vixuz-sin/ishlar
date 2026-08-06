from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone


class User(AbstractUser):
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    avatar = models.CharField(max_length=256, null=True, blank=True)
    bio = models.CharField(max_length=128, null=True, blank=True)
    last_online = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(default=timezone.now)
    typing_chat = models.ForeignKey('Chat', null=True, blank=True, on_delete=models.SET_NULL, related_name='typers')
    typing_at = models.DateTimeField(null=True, blank=True)
    blocked_users = models.ManyToManyField('self', symmetrical=False, blank=True, related_name='blocked_by')

    def __str__(self):
        return self.username


class Chat(models.Model):
    PRIVATE = 'private'
    GROUP = 'group'
    CHANNEL = 'channel'
    CHAT_TYPES = [(PRIVATE, 'Private'), (GROUP, 'Group'), (CHANNEL, 'Channel')]

    type = models.CharField(max_length=10, choices=CHAT_TYPES, default=PRIVATE)
    name = models.CharField(max_length=64, null=True, blank=True)
    photo = models.CharField(max_length=256, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    members = models.ManyToManyField(User, related_name='chats')
    owner = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_chats')
    slow_mode = models.IntegerField(default=0)
    last_message = models.ForeignKey('Message', on_delete=models.SET_NULL, null=True, blank=True, related_name='+')

    def __str__(self):
        return self.name or f'{self.type} chat {self.id}'


class Message(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='messages')
    text = models.TextField(null=True, blank=True)
    file_path = models.CharField(max_length=256, null=True, blank=True)
    file_type = models.CharField(max_length=10, null=True, blank=True)
    file_size = models.IntegerField(null=True, blank=True)
    reply_to = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='replies')
    read_by = models.ManyToManyField(User, related_name='read_messages', blank=True)
    edited = models.BooleanField(default=False)
    pinned = models.BooleanField(default=False)
    pinned_at = models.DateTimeField(null=True, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    autodelete_at = models.DateTimeField(null=True, blank=True)
    poll = models.OneToOneField('Poll', null=True, blank=True, on_delete=models.SET_NULL, related_name='message')
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f'Msg {self.id} by {self.sender.username}'


class Poll(models.Model):
    chat = models.ForeignKey(Chat, on_delete=models.CASCADE, related_name='polls')
    question = models.CharField(max_length=256)
    options = models.JSONField(default=list)
    votes = models.JSONField(default=dict)
    multiple = models.BooleanField(default=False)
    closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(default=timezone.now)


class Reaction(models.Model):
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='reactions')
    emoji = models.CharField(max_length=16)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ('message', 'user')
