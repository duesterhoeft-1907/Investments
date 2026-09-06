export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';

export interface Lead {
  id: number;
  ref: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  city: string;
  postalCode: string;
  country: string;
  assetClassId: number | null;
  assetClass: string | null;
  assetClassSlug: string | null;
  teamId: number | null;
  team: string | null;
  teamColor: string | null;
  ownerId: number | null;
  owner: { id: number | null; name: string; email: string; accent: string } | null;
  status: LeadStatus;
  statusLabel: string;
  stageChangedAt: string | null;
  source: string;
  score: number;
  volumeBand: string;
  volumeLabel: string;
  volumeValue: number;
  horizon: string;
  horizonLabel: string;
  experience: string;
  experienceLabel: string;
  goal: string;
  contactPref: string;
  contactPrefLabel: string;
  contactWindow: string;
  message: string;
  consentMarketing: boolean;
  slaDueAt: string | null;
  firstContactAt: string | null;
  firstContactBy: number | null;
  responseSeconds: number | null;
  slaBreached: boolean;
  hasPortal: boolean;
  portalToken: string | null;
  portalLastLogin: string | null;
  lostReason: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Activity {
  id: number;
  leadId: number;
  type: string;
  title: string;
  body: string;
  outcome: string;
  direction: string;
  durationS: number;
  isPinned: boolean;
  meta: Record<string, unknown>;
  user: { id: number; name: string; accent: string } | null;
  occurredAt: string | null;
  createdAt: string | null;
  leadName?: string;
  leadRef?: string;
}

export interface Attachment {
  id: number;
  leadId: number;
  activityId: number | null;
  kind: 'file' | 'voice';
  filename: string;
  url: string;
  mime: string;
  sizeBytes: number;
  durationS: number;
  transcript: string;
  visibleToClient: boolean;
  uploadedBy: string | null;
  createdAt: string | null;
}

export interface Task {
  id: number;
  leadId: number | null;
  kind: 'task' | 'call' | 'meeting';
  title: string;
  description: string;
  dueAt: string | null;
  durationMin: number;
  recurrence: string;
  status: 'open' | 'done' | 'cancelled';
  completedAt: string | null;
  visibleToClient: boolean;
  assignee: { id: number; name: string; accent: string } | null;
  leadName: string | null;
  createdAt: string | null;
}

export interface Offer {
  id: number;
  leadId: number;
  title: string;
  summary: string;
  body: string;
  amount: number;
  currency: string;
  status: 'draft' | 'sent' | 'accepted' | 'declined';
  generatedBy: 'human' | 'ai' | 'template';
  validUntil: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
}

export interface EmailEntry {
  id: number;
  to: string;
  subject: string;
  template: string;
  status: string;
  preview: string;
  createdAt: string | null;
}

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  title: string;
  phone: string;
  role: 'admin' | 'manager' | 'agent';
  accent: string;
  lastSeenAt: string | null;
  teams: Array<{ id: number; slug: string; name: string; color: string; slaMinutes: number; teamRole: string }>;
}

export interface DirectoryUser {
  id: number;
  email: string;
  name: string;
  title: string;
  phone: string;
  role: string;
  accent: string;
  online: boolean;
  lastSeenAt: string | null;
  teams: Array<{ id: number; name: string; color: string }>;
}

export interface Team {
  id: number;
  slug: string;
  name: string;
  description: string;
  color: string;
  slaMinutes: number;
  leadCount: number;
  awaiting: number;
  members: Array<{ id: number; name: string; title: string; accent: string; teamRole: string }>;
  assetClasses: Array<{ id: number; slug: string; name: string }>;
}

export interface Channel {
  id: number;
  slug: string | null;
  name: string;
  type: 'company' | 'team' | 'dm';
  teamId: number | null;
  teamColor: string | null;
  topic: string;
  unread: number;
  lastBody: string;
  lastAt: string | null;
  partner: { id: number; name: string; accent: string } | null;
}

export interface ChatMessage {
  id: number;
  channelId: number;
  body: string;
  kind: 'text' | 'system' | 'lead_alert';
  leadId: number | null;
  leadName: string | null;
  leadRef: string | null;
  meta: Record<string, unknown>;
  author: { id: number; name: string; accent: string; title: string } | null;
  createdAt: string | null;
}

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  link: string;
  leadId: number | null;
  urgency: 'normal' | 'high' | 'critical';
  isRead: boolean;
  createdAt: string | null;
}

export interface DashboardStats {
  range: { days: number };
  totals: {
    leads: number;
    awaiting: number;
    breached: number;
    won: number;
    lost: number;
    pipelineValue: number;
    wonValue: number;
    answered: number;
    avgResponseSeconds: number | null;
    avgResponseLabel: string | null;
    medianResponseSeconds: number | null;
    medianResponseLabel: string | null;
    slaComplianceRate: number | null;
    conversionRate: number;
  };
  byStatus: Array<{ status: LeadStatus; label: string; count: number; value: number }>;
  byTeam: Array<{
    id: number; name: string; color: string; slaMinutes: number; leads: number;
    avgResponse: number | null; avgResponseLabel: string | null;
    breached: number; awaiting: number; won: number;
  }>;
  byAsset: Array<{ name: string; slug: string; leads: number; value: number }>;
  leaderboard: Array<{
    id: number; name: string; accent: string; title: string; leads: number;
    avgResponse: number | null; avgResponseLabel: string | null; won: number; breached: number;
  }>;
  timeline: Array<{ day: string; leads: number; avgResponse: number | null; won: number }>;
  urgent: Lead[];
  onlineUserIds: number[];
}

export interface WizardConfig {
  company: { name: string; phone: string; email: string };
  assetClasses: Array<{
    id: number; slug: string; name: string; tagline: string; description: string;
    icon: string; teamName: string | null; teamColor: string | null; slaMinutes: number | null;
  }>;
  volumeBands: Array<{ value: string; label: string }>;
  horizons: Array<{ value: string; label: string }>;
  experience: Array<{ value: string; label: string }>;
  contactPrefs: Array<{ value: string; label: string }>;
  contactWindows: Array<{ value: string; label: string }>;
  defaultSlaMinutes: number;
}
