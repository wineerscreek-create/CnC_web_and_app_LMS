'use client';

import * as React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Ban,
  Check,
  CheckCheck,
  Download,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  MoreVertical,
  Paperclip,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';
import { MessagingWebSocketManager } from '@/lib/messaging/ws';
import { useAppSelector } from '@/store';

// ============================================================================
// Types
// ============================================================================

export interface MessagingGroup {
  id: string;
  name: string;
  normalizedKey: string;
  passoutYear?: string;
  branch?: string;
  section?: string;
  description?: string;
  memberCount: number;
  unreadCount: number;
  lastMessageAt?: string;
  lastMessageText?: string;
  joinedAt?: string;
}

export interface MessagingConversation {
  id: string;
  institutionId: string;
  user1Id: string;
  user2Id: string;
  lastMessageAt: string;
  lastMessageText: string;
  unreadCount: number;
  participant: {
    id: string;
    name: string;
    email: string;
    role: string;
    avatarColor?: string;
  };
  isBlockedByMe?: boolean;
  isBlockedByOther?: boolean;
}

export interface MessageAttachment {
  id?: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
}

export interface ChatMessage {
  id: string;
  groupId?: string;
  conversationId?: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  senderAvatarColor?: string;
  content: string;
  messageType: 'text' | 'announcement' | 'system' | 'file';
  replyToId?: string | null;
  replyToSnippet?: string | null;
  replyToSenderName?: string | null;
  isPinned: boolean;
  pinnedAt?: string | null;
  pinnedByName?: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  attachments?: MessageAttachment[];
  createdAt: string;
}

export interface GroupMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor?: string;
}

export interface DirectSearchUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor?: string;
  departmentName?: string;
  batchName?: string;
}

interface MessagingAppProps {
  role?: 'STUDENT' | 'TRAINER' | 'INSTITUTION_ADMIN' | 'SUPER_ADMIN';
}

// ============================================================================
// Component
// ============================================================================

export function MessagingApp({ role: propRole }: MessagingAppProps) {
  const currentUser = useAppSelector((state) => state.auth.user);
  const currentUserId = currentUser?.id;
  const currentRole = propRole || (currentUser?.role as any) || 'STUDENT';
  const isTrainerOrAdmin = ['TRAINER', 'INSTITUTION_ADMIN', 'SUPER_ADMIN'].includes(currentRole);

  // Layout & Selection State
  const [activeTab, setActiveTab] = React.useState<'groups' | 'direct'>('groups');
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(null);
  const [activeConvId, setActiveConvId] = React.useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = React.useState(false);

  // Data State
  const [groups, setGroups] = React.useState<MessagingGroup[]>([]);
  const [conversations, setConversations] = React.useState<MessagingConversation[]>([]);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [activeGroupDetails, setActiveGroupDetails] = React.useState<{
    members: GroupMember[];
    pinnedMessages: ChatMessage[];
  } | null>(null);

  // Search & Filter
  const [filterQuery, setFilterQuery] = React.useState('');
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<DirectSearchUser[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = React.useState(false);

  // Input & Messaging State
  const [inputText, setInputText] = React.useState('');
  const [isAnnouncement, setIsAnnouncement] = React.useState(false);
  const [replyingTo, setReplyingTo] = React.useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = React.useState<ChatMessage | null>(null);
  const [attachedFiles, setAttachedFiles] = React.useState<MessageAttachment[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);

  // UI Panels
  const [showPinnedOnly, setShowPinnedOnly] = React.useState(false);
  const [showMembersDrawer, setShowMembersDrawer] = React.useState(false);
  const [blockedUsers, setBlockedUsers] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const wsManagerRef = React.useRef<MessagingWebSocketManager | null>(null);

  // --------------------------------------------------------------------------
  // Data Loaders
  // --------------------------------------------------------------------------
  const loadSidebar = React.useCallback(async () => {
    try {
      const [groupsRes, convsRes, blocksRes] = await Promise.all([
        api.get<any>('/messaging/groups'),
        api.get<any>('/messaging/conversations'),
        api.get<any>('/messaging/users/blocked').catch(() => ({ blockedUsers: [] })),
      ]);

      const gList: MessagingGroup[] = groupsRes?.groups ?? groupsRes?.data?.groups ?? [];
      const cList: MessagingConversation[] = convsRes?.conversations ?? convsRes?.data?.conversations ?? [];
      const bList: string[] = (blocksRes?.blockedUsers ?? blocksRes?.data?.blockedUsers ?? []).map(
        (u: any) => u.id
      );

      setGroups(gList);
      setConversations(cList);
      setBlockedUsers(bList);
      return { gList, cList };
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load conversations.');
      return { gList: [], cList: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  // --------------------------------------------------------------------------
  // WebSocket Lifecycle
  // --------------------------------------------------------------------------
  React.useEffect(() => {
    const ws = new MessagingWebSocketManager();
    wsManagerRef.current = ws;
    ws.connect();

    const unsubscribe = ws.addListener((payload) => {
      if (payload.event === 'new_message') {
        const msg: ChatMessage = payload.data;
        if (
          (activeGroupId && msg.groupId === activeGroupId) ||
          (activeConvId && msg.conversationId === activeConvId)
        ) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          scrollToBottom();
        }

        // Update last message in group / conv list
        if (msg.groupId) {
          setGroups((prev) =>
            prev.map((g) =>
              g.id === msg.groupId
                ? {
                    ...g,
                    lastMessageText: msg.content,
                    lastMessageAt: msg.createdAt,
                    unreadCount: g.id === activeGroupId ? 0 : g.unreadCount + 1,
                  }
                : g
            )
          );
        } else if (msg.conversationId) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === msg.conversationId
                ? {
                    ...c,
                    lastMessageText: msg.content,
                    lastMessageAt: msg.createdAt,
                    unreadCount: c.id === activeConvId ? 0 : c.unreadCount + 1,
                  }
                : c
            )
          );
        }
      } else if (payload.event === 'message_edited') {
        const updated = payload.data;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id
              ? { ...m, content: updated.content, isEdited: true }
              : m
          )
        );
      } else if (payload.event === 'message_deleted') {
        const deletedId = payload.data?.messageId || payload.data?.id;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === deletedId
              ? { ...m, isDeleted: true, content: 'This message was deleted' }
              : m
          )
        );
      } else if (payload.event === 'message_pinned') {
        const { messageId, isPinned, pinnedByName } = payload.data;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, isPinned, pinnedByName: isPinned ? pinnedByName : null }
              : m
          )
        );
      } else if (payload.event === 'room_revoked') {
        if (activeGroupId && payload.room === `group:${activeGroupId}`) {
          setErrorMessage('Your access to this batch group has been updated or revoked.');
          setActiveGroupId(null);
          setMobileShowChat(false);
          loadSidebar();
        }
      }
    });

    return () => {
      unsubscribe();
      ws.disconnect();
    };
  }, [activeGroupId, activeConvId, loadSidebar]);

  // Subscribe to active room
  React.useEffect(() => {
    const ws = wsManagerRef.current;
    if (!ws) return;

    if (activeGroupId) {
      const room = `group:${activeGroupId}`;
      ws.subscribeRoom(room);
      return () => ws.unsubscribeRoom(room);
    } else if (activeConvId) {
      const room = `conv:${activeConvId}`;
      ws.subscribeRoom(room);
      return () => ws.unsubscribeRoom(room);
    }
  }, [activeGroupId, activeConvId]);

  React.useEffect(() => {
    loadSidebar().then(({ gList, cList }) => {
      if (!activeGroupId && !activeConvId) {
        if (gList.length > 0) {
          selectGroup(gList[0].id);
        } else if (cList.length > 0) {
          selectConversation(cList[0].id);
        }
      }
    });
  }, [loadSidebar]);

  const selectGroup = async (groupId: string) => {
    setActiveGroupId(groupId);
    setActiveConvId(null);
    setMobileShowChat(true);
    setReplyingTo(null);
    setEditingMessage(null);
    setAttachedFiles([]);
    setErrorMessage(null);

    try {
      const [detailsRes, messagesRes] = await Promise.all([
        api.get<any>(`/messaging/groups/${groupId}`),
        api.get<any>(`/messaging/groups/${groupId}/messages?limit=60`),
      ]);

      const groupData = detailsRes?.group ?? detailsRes?.data ?? detailsRes;
      setActiveGroupDetails({
        members: groupData.members || [],
        pinnedMessages: groupData.pinnedMessages || [],
      });

      const msgList: ChatMessage[] = messagesRes?.messages ?? messagesRes?.data?.messages ?? [];
      setMessages(msgList);

      // Mark as read
      await api.post(`/messaging/groups/${groupId}/read`, {});
      setGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, unreadCount: 0 } : g))
      );
      scrollToBottom();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load group messages.');
    }
  };

  const selectConversation = async (convId: string) => {
    setActiveConvId(convId);
    setActiveGroupId(null);
    setActiveGroupDetails(null);
    setMobileShowChat(true);
    setReplyingTo(null);
    setEditingMessage(null);
    setAttachedFiles([]);
    setErrorMessage(null);

    try {
      const messagesRes = await api.get<any>(`/messaging/conversations/${convId}/messages?limit=60`);
      const msgList: ChatMessage[] = messagesRes?.messages ?? messagesRes?.data?.messages ?? [];
      setMessages(msgList);

      // Mark as read
      await api.post(`/messaging/conversations/${convId}/read`, {});
      setConversations((prev) =>
        prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
      scrollToBottom();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load direct messages.');
    }
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // --------------------------------------------------------------------------
  // Message Actions
  // --------------------------------------------------------------------------
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text && attachedFiles.length === 0) return;
    if (isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      if (editingMessage) {
        // Edit flow
        const res = await api.patch<any>(`/messaging/messages/${editingMessage.id}/edit`, {
          content: text,
        });
        const updated = res?.message ?? res?.data?.message ?? res;
        setMessages((prev) =>
          prev.map((m) => (m.id === editingMessage.id ? { ...m, content: text, isEdited: true } : m))
        );
        setEditingMessage(null);
        setInputText('');
      } else if (activeGroupId) {
        // Post to group
        const payload: any = {
          content: text,
          message_type: isAnnouncement ? 'announcement' : 'text',
          reply_to_id: replyingTo?.id || null,
          attachments: attachedFiles,
          is_pinned: isAnnouncement,
        };

        const res = await api.post<any>(`/messaging/groups/${activeGroupId}/messages`, payload);
        const newMsg: ChatMessage = res?.message ?? res?.data?.message ?? res;
        setMessages((prev) => [...prev, newMsg]);
        setInputText('');
        setReplyingTo(null);
        setAttachedFiles([]);
        setIsAnnouncement(false);
        scrollToBottom();
      } else if (activeConvId) {
        // Direct message
        const payload: any = {
          content: text,
          reply_to_id: replyingTo?.id || null,
          attachments: attachedFiles,
        };

        const res = await api.post<any>(`/messaging/conversations/${activeConvId}/messages`, payload);
        const newMsg: ChatMessage = res?.message ?? res?.data?.message ?? res;
        setMessages((prev) => [...prev, newMsg]);
        setInputText('');
        setReplyingTo(null);
        setAttachedFiles([]);
        scrollToBottom();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Are you sure you want to delete this message?')) return;
    try {
      await api.delete(`/messaging/messages/${messageId}`);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, isDeleted: true, content: 'This message was deleted' }
            : m
        )
      );
    } catch (err: any) {
      alert(err.message || 'Failed to delete message.');
    }
  };

  const handleTogglePin = async (messageId: string) => {
    if (!activeGroupId) return;
    try {
      const res = await api.post<any>(`/messaging/groups/${activeGroupId}/pin/${messageId}`, {});
      const { isPinned } = res?.data ?? res;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, isPinned } : m))
      );
      // Reload group details
      const detailsRes = await api.get<any>(`/messaging/groups/${activeGroupId}`);
      const groupData = detailsRes?.group ?? detailsRes?.data ?? detailsRes;
      setActiveGroupDetails((prev) =>
        prev ? { ...prev, pinnedMessages: groupData.pinnedMessages || [] } : null
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update pin state.');
    }
  };

  // --------------------------------------------------------------------------
  // User Search & Direct Conversation
  // --------------------------------------------------------------------------
  const handleSearchUsers = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearchingUsers(true);
    try {
      const res = await api.get<any>(`/messaging/users/search?q=${encodeURIComponent(query.trim())}`);
      const list: DirectSearchUser[] = res?.users ?? res?.data?.users ?? [];
      setSearchResults(list);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearchingUsers(false);
    }
  };

  const handleStartDirectChat = async (targetUser: DirectSearchUser) => {
    try {
      const res = await api.post<any>('/messaging/conversations/start', {
        target_user_id: targetUser.id,
      });
      const conv = res?.conversation ?? res?.data?.conversation ?? res;
      setIsSearchOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      await loadSidebar();
      setActiveTab('direct');
      selectConversation(conv.id);
    } catch (err: any) {
      alert(err.message || 'Could not start conversation with user.');
    }
  };

  // --------------------------------------------------------------------------
  // Blocking & Unblocking
  // --------------------------------------------------------------------------
  const handleToggleBlock = async (targetUserId: string, isCurrentlyBlocked: boolean) => {
    try {
      if (isCurrentlyBlocked) {
        await api.post('/messaging/users/unblock', { blocked_id: targetUserId });
        setBlockedUsers((prev) => prev.filter((id) => id !== targetUserId));
      } else {
        if (!confirm('Are you sure you want to block this user from sending you direct messages?')) {
          return;
        }
        await api.post('/messaging/users/block', {
          blocked_id: targetUserId,
          reason: 'User requested block',
        });
        setBlockedUsers((prev) => [...prev, targetUserId]);
      }
      await loadSidebar();
    } catch (err: any) {
      alert(err.message || 'Failed to update block state.');
    }
  };

  // --------------------------------------------------------------------------
  // File Uploads
  // --------------------------------------------------------------------------
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      alert('File size exceeds the 25MB limit.');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post<any>('/messaging/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const att: MessageAttachment = res?.data ?? res;
      setAttachedFiles((prev) => [...prev, att]);
    } catch (err: any) {
      alert(err.message || 'Failed to upload attachment.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --------------------------------------------------------------------------
  // Computed Active State
  // --------------------------------------------------------------------------
  const currentActiveGroup = groups.find((g) => g.id === activeGroupId);
  const currentActiveConv = conversations.find((c) => c.id === activeConvId);
  const activeParticipant = currentActiveConv?.participant;
  const isParticipantBlocked = activeParticipant
    ? blockedUsers.includes(activeParticipant.id) || currentActiveConv?.isBlockedByMe
    : false;
  const isBlockedByOther = currentActiveConv?.isBlockedByOther;

  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(filterQuery.toLowerCase())
  );
  const filteredConversations = conversations.filter((c) =>
    c.participant.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
    c.participant.email.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const displayedMessages = showPinnedOnly
    ? messages.filter((m) => m.isPinned && !m.isDeleted)
    : messages;

  return (
    <div className="flex h-[calc(100vh-12rem)] min-h-[600px] w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* ==================================================================== */}
      {/* SIDEBAR (Groups & Direct Messages)                                  */}
      {/* ==================================================================== */}
      <div
        className={cn(
          'flex h-full w-full flex-col border-r border-border bg-card md:w-80 lg:w-96',
          mobileShowChat ? 'hidden md:flex' : 'flex'
        )}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <MessageSquare className="size-4" />
              </div>
              <h2 className="font-semibold text-foreground text-sm">Institute Messaging</h2>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="size-8 p-0"
              title="New Direct Message"
              onClick={() => setIsSearchOpen(true)}
            >
              <UserPlus className="size-4" />
            </Button>
          </div>

          {/* Search filter input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/40 py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
            />
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('groups')}
              className={cn(
                'flex-1 rounded-md py-1 text-xs font-medium transition-all',
                activeTab === 'groups'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Batch Groups ({groups.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('direct')}
              className={cn(
                'flex-1 rounded-md py-1 text-xs font-medium transition-all',
                activeTab === 'direct'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Direct ({conversations.length})
            </button>
          </div>
        </div>

        {/* Sidebar List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/50">
          {loading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <RefreshCw className="size-4 animate-spin mx-auto mb-2" />
              Loading conversations...
            </div>
          ) : activeTab === 'groups' ? (
            filteredGroups.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                No batch groups found.
              </div>
            ) : (
              filteredGroups.map((group) => {
                const isSelected = activeGroupId === group.id;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => selectGroup(group.id)}
                    className={cn(
                      'flex w-full items-start gap-3 p-3.5 text-left transition-colors',
                      isSelected ? 'bg-accent/10' : 'hover:bg-muted/40'
                    )}
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-xs">
                      {group.branch || 'GP'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-foreground truncate">
                          {group.name}
                        </span>
                        {group.lastMessageAt && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {relativeTime(group.lastMessageAt)}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="truncate pr-2">
                          {group.lastMessageText || 'No messages yet'}
                        </span>
                        {group.unreadCount > 0 && (
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                            {group.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {group.section && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                            Sec {group.section}
                          </span>
                        )}
                        {group.passoutYear && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                            Batch {group.passoutYear}
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground ml-auto">
                          {group.memberCount} members
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })
            )
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No direct conversations yet. Click the + button above to start one.
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = activeConvId === conv.id;
              const p = conv.participant;
              const isBlocked = blockedUsers.includes(p.id) || conv.isBlockedByMe;

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => selectConversation(conv.id)}
                  className={cn(
                    'flex w-full items-start gap-3 p-3.5 text-left transition-colors',
                    isSelected ? 'bg-accent/10' : 'hover:bg-muted/40'
                  )}
                >
                  <div
                    className="flex size-9 shrink-0 items-center justify-center rounded-full font-semibold text-xs text-white"
                    style={{ backgroundColor: p.avatarColor || '#6366f1' }}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {p.name}
                      </span>
                      {conv.lastMessageAt && (
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {relativeTime(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span className="rounded bg-muted px-1 py-0.2 text-[9px] font-medium uppercase">
                        {p.role}
                      </span>
                      {isBlocked && (
                        <span className="text-destructive flex items-center gap-0.5">
                          <Ban className="size-2.5" /> Blocked
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span className="truncate pr-2">
                        {conv.lastMessageText || 'Start conversation...'}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-accent-foreground">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MAIN CHAT AREA                                                       */}
      {/* ==================================================================== */}
      <div
        className={cn(
          'flex h-full flex-1 flex-col bg-card/60',
          !mobileShowChat ? 'hidden md:flex' : 'flex'
        )}
      >
        {/* Chat Header */}
        <div className="flex h-16 items-center justify-between border-b border-border px-4 py-2 bg-card">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile back button */}
            <Button
              size="sm"
              variant="ghost"
              className="md:hidden size-8 p-0"
              onClick={() => setMobileShowChat(false)}
            >
              <ArrowLeft className="size-4" />
            </Button>

            {currentActiveGroup ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary font-semibold text-xs">
                  {currentActiveGroup.branch || 'GP'}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-foreground truncate">
                    {currentActiveGroup.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {currentActiveGroup.memberCount} members · Official Batch Channel
                  </p>
                </div>
              </div>
            ) : currentActiveConv ? (
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full font-semibold text-xs text-white"
                  style={{ backgroundColor: activeParticipant?.avatarColor || '#6366f1' }}
                >
                  {activeParticipant?.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-sm text-foreground truncate">
                      {activeParticipant?.name}
                    </h3>
                    <Badge tone="neutral" className="text-[10px] uppercase py-0 px-1">
                      {activeParticipant?.role}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {activeParticipant?.email}
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">Select a conversation</div>
            )}
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5">
            {currentActiveGroup && (
              <>
                <Button
                  size="sm"
                  variant={showPinnedOnly ? 'primary' : 'secondary'}
                  className="text-xs h-8 gap-1.5"
                  onClick={() => setShowPinnedOnly(!showPinnedOnly)}
                >
                  <Pin className="size-3.5" />
                  <span className="hidden sm:inline">Pinned</span>
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="text-xs h-8 gap-1.5"
                  onClick={() => setShowMembersDrawer(!showMembersDrawer)}
                >
                  <Users className="size-3.5" />
                  <span className="hidden sm:inline">Members</span>
                </Button>
              </>
            )}

            {currentActiveConv && activeParticipant && (
              <Button
                size="sm"
                variant={isParticipantBlocked ? 'danger' : 'secondary'}
                className="text-xs h-8 gap-1.5"
                onClick={() =>
                  handleToggleBlock(activeParticipant.id, !!isParticipantBlocked)
                }
              >
                <Ban className="size-3.5" />
                <span className="hidden sm:inline">
                  {isParticipantBlocked ? 'Unblock' : 'Block'}
                </span>
              </Button>
            )}
          </div>
        </div>

        {/* Error notification banner */}
        {errorMessage && (
          <div className="flex items-center justify-between bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-3.5" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Pinned Messages Bar (if any pinned in group) */}
        {currentActiveGroup && activeGroupDetails?.pinnedMessages && activeGroupDetails.pinnedMessages.length > 0 && !showPinnedOnly && (
          <div className="border-b border-border bg-accent/5 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Pin className="size-3.5 text-accent shrink-0" />
              <span className="text-xs font-semibold text-accent shrink-0">Announcement:</span>
              <span className="text-xs text-foreground truncate">
                {activeGroupDetails.pinnedMessages[0].content}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowPinnedOnly(true)}
              className="text-[11px] text-accent font-medium hover:underline shrink-0 ml-2"
            >
              View all ({activeGroupDetails.pinnedMessages.length})
            </button>
          </div>
        )}

        {/* Message Thread List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {displayedMessages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <MessageSquare className="size-10 stroke-1 mb-2 opacity-50" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs">Say hello or share an announcement with your batch!</p>
            </div>
          ) : (
            displayedMessages.map((msg) => {
              const isMe = msg.senderId === currentUserId;
              const isAnnouncementMsg = msg.messageType === 'announcement';
              const canEdit =
                isMe &&
                !msg.isDeleted &&
                Date.now() - new Date(msg.createdAt).getTime() <= 15 * 60 * 1000;
              const canDelete = isMe || isTrainerOrAdmin;

              return (
                <div
                  key={msg.id}
                  className={cn(
                    'group relative flex gap-3',
                    isMe ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  {/* Avatar */}
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-xs text-white"
                    style={{ backgroundColor: msg.senderAvatarColor || '#6366f1' }}
                  >
                    {msg.senderName.charAt(0).toUpperCase()}
                  </div>

                  {/* Message Bubble Container */}
                  <div className={cn('flex flex-col max-w-[80%] sm:max-w-[70%]', isMe ? 'items-end' : 'items-start')}>
                    {/* Header: Name, Role Badge, Time */}
                    <div className="flex items-center gap-1.5 mb-1 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{msg.senderName}</span>
                      <span className="rounded bg-muted px-1 py-0.2 text-[9px] uppercase font-medium">
                        {msg.senderRole}
                      </span>
                      {msg.isPinned && (
                        <span className="flex items-center gap-0.5 text-accent text-[10px] font-medium">
                          <Pin className="size-2.5" /> Pinned
                        </span>
                      )}
                      <span>·</span>
                      <span>{relativeTime(msg.createdAt)}</span>
                    </div>

                    {/* Announcement Banner */}
                    {isAnnouncementMsg && (
                      <div className="mb-1 flex items-center gap-1.5 rounded-t-lg bg-accent/20 px-3 py-1 text-xs font-semibold text-accent">
                        <Shield className="size-3.5" />
                        Official Announcement
                      </div>
                    )}

                    {/* Reply Context Bubble */}
                    {msg.replyToSnippet && (
                      <div className="mb-1 rounded border-l-2 border-accent bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground max-w-full truncate">
                        <span className="font-semibold text-foreground text-[10px] block">
                          {msg.replyToSenderName || 'Original message'}:
                        </span>
                        <span className="truncate block">{msg.replyToSnippet}</span>
                      </div>
                    )}

                    {/* Main Content Bubble */}
                    <div
                      className={cn(
                        'relative rounded-2xl px-4 py-2.5 text-sm shadow-2xs leading-relaxed',
                        msg.isDeleted
                          ? 'italic text-muted-foreground bg-muted/30 border border-dashed border-border'
                          : isAnnouncementMsg
                          ? 'bg-accent/10 border border-accent/30 text-foreground'
                          : isMe
                          ? 'bg-accent text-accent-foreground'
                          : 'bg-muted/70 text-foreground'
                      )}
                    >
                      {msg.content}
                      {msg.isEdited && !msg.isDeleted && (
                        <span className="ml-1.5 text-[10px] opacity-75 font-normal">
                          (edited)
                        </span>
                      )}

                      {/* Attachments rendering */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-2 space-y-1.5 pt-2 border-t border-border/30">
                          {msg.attachments.map((att, idx) => (
                            <a
                              key={idx}
                              href={att.fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-2 rounded-lg bg-background/50 p-2 text-xs hover:bg-background/80 transition-colors"
                            >
                              {att.fileType.startsWith('image/') ? (
                                <ImageIcon className="size-4 shrink-0 text-accent" />
                              ) : (
                                <FileText className="size-4 shrink-0 text-accent" />
                              )}
                              <span className="truncate flex-1 font-medium">{att.fileName}</span>
                              <Download className="size-3.5 shrink-0 opacity-70" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hover Quick Actions */}
                    {!msg.isDeleted && (
                      <div
                        className={cn(
                          'mt-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-[11px]',
                          isMe ? 'justify-end' : 'justify-start'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setReplyingTo(msg)}
                          className="hover:text-accent p-1 text-muted-foreground transition-colors"
                          title="Reply"
                        >
                          Reply
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingMessage(msg);
                              setInputText(msg.content);
                            }}
                            className="hover:text-accent p-1 text-muted-foreground transition-colors"
                            title="Edit within 15 mins"
                          >
                            Edit
                          </button>
                        )}
                        {currentActiveGroup && isTrainerOrAdmin && (
                          <button
                            type="button"
                            onClick={() => handleTogglePin(msg.id)}
                            className="hover:text-accent p-1 text-muted-foreground transition-colors"
                            title={msg.isPinned ? 'Unpin message' : 'Pin to top'}
                          >
                            {msg.isPinned ? 'Unpin' : 'Pin'}
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg.id)}
                            className="hover:text-destructive p-1 text-muted-foreground transition-colors"
                            title="Delete message"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Replying Banner */}
        {replyingTo && (
          <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-1.5 text-xs">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-accent">Replying to {replyingTo.senderName}:</span>
              <span className="text-muted-foreground truncate">{replyingTo.content}</span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* Editing Banner */}
        {editingMessage && (
          <div className="flex items-center justify-between border-t border-border bg-accent/10 px-4 py-1.5 text-xs text-accent">
            <span className="font-semibold">Editing message</span>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setInputText('');
              }}
              className="hover:underline"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Attached files preview */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border bg-muted/20 px-4 py-2">
            {attachedFiles.map((att, idx) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs"
              >
                <Paperclip className="size-3 text-accent" />
                <span className="max-w-[150px] truncate">{att.fileName}</span>
                <button
                  type="button"
                  onClick={() => setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))}
                  className="hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input Bar */}
        <div className="border-t border-border p-3 bg-card">
          {isParticipantBlocked ? (
            <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <div className="flex items-center gap-2">
                <Ban className="size-4" />
                <span>
                  You have blocked direct messaging with this user. Unblock to resume conversation.
                </span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() =>
                  activeParticipant && handleToggleBlock(activeParticipant.id, true)
                }
              >
                Unblock
              </Button>
            </div>
          ) : isBlockedByOther ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              <Ban className="size-4" />
              <span>You cannot send messages to this conversation at this time.</span>
            </div>
          ) : (
            <form onSubmit={handleSendMessage} className="space-y-2">
              {currentActiveGroup && isTrainerOrAdmin && (
                <div className="flex items-center gap-2 px-1">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={isAnnouncement}
                      onChange={(e) => setIsAnnouncement(e.target.checked)}
                      className="rounded border-border text-accent focus:ring-accent size-3.5"
                    />
                    <Shield className="size-3 text-accent" />
                    <span>Post as Official Announcement (Pins to top)</span>
                  </label>
                </div>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.zip,.txt"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="size-9 p-0 shrink-0"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || isSending}
                  title="Attach file (PDF, Doc, Image up to 25MB)"
                >
                  {isUploading ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Paperclip className="size-4" />
                  )}
                </Button>

                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder={
                    editingMessage
                      ? 'Edit your message...'
                      : currentActiveGroup
                      ? `Message ${currentActiveGroup.name}...`
                      : activeParticipant
                      ? `Message ${activeParticipant.name}...`
                      : 'Type a message...'
                  }
                  rows={1}
                  className="max-h-32 min-h-[38px] flex-1 resize-none rounded-lg border border-border bg-muted/40 p-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                />

                <Button
                  type="submit"
                  size="sm"
                  className="size-9 p-0 shrink-0"
                  disabled={(!inputText.trim() && attachedFiles.length === 0) || isSending}
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* DIRECT MESSAGE USER SEARCH MODAL                                     */}
      {/* ==================================================================== */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="size-4 text-accent" />
                <h3 className="font-semibold text-sm text-foreground">
                  Start Direct Message
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSearchOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">
                Search by Email or LMS User ID:
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="e.g. trainer@arya.edu or uuid..."
                  value={searchQuery}
                  onChange={(e) => handleSearchUsers(e.target.value)}
                  className="w-full rounded-lg border border-border bg-muted/40 py-2 pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Results list */}
            <div className="max-h-60 overflow-y-auto divide-y divide-border/60">
              {isSearchingUsers ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Searching institution directory...
                </div>
              ) : searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  {searchQuery ? 'No matching users found in your institution.' : 'Type to search.'}
                </div>
              ) : (
                searchResults.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleStartDirectChat(user)}
                    className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-xs text-white"
                        style={{ backgroundColor: user.avatarColor || '#6366f1' }}
                      >
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-foreground">{user.name}</div>
                        <div className="text-[11px] text-muted-foreground">{user.email}</div>
                      </div>
                    </div>
                    <Badge tone="neutral" className="text-[10px] uppercase">
                      {user.role}
                    </Badge>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* GROUP MEMBERS DRAWER / MODAL                                         */}
      {/* ==================================================================== */}
      {showMembersDrawer && activeGroupDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-accent" />
                <h3 className="font-semibold text-sm text-foreground">
                  Group Members ({activeGroupDetails.members.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMembersDrawer(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-border/60">
              {activeGroupDetails.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-2.5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex size-7 shrink-0 items-center justify-center rounded-full font-semibold text-xs text-white"
                      style={{ backgroundColor: member.avatarColor || '#6366f1' }}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-medium text-xs text-foreground">{member.name}</div>
                      <div className="text-[10px] text-muted-foreground">{member.email}</div>
                    </div>
                  </div>
                  <Badge tone="neutral" className="text-[9px] uppercase">
                    {member.role}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
