'use client';

import * as React from 'react';
import { PageHeader } from '@/components/shared/page-header';
import { MessagingApp } from '@/components/messaging/MessagingApp';

export default function TrainerChatPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Trainer Messaging & Batch Channels"
        description="Official batch group communications, announcements, and direct messaging with assigned students and faculty."
      />
      <MessagingApp role="TRAINER" />
    </div>
  );
}
