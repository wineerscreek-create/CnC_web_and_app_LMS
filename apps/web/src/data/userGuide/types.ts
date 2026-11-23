import type { Role } from '@/lib/roleRoutes';

export interface GuideNoteOrWarning {
  type: 'note' | 'warning' | 'tip';
  text: string;
}

export interface GuideFAQ {
  id: string;
  question: string;
  shortDescription: string;
  purpose: string;
  steps: string[];
  expectedResult: string;
  noteOrWarning?: GuideNoteOrWarning;
  relatedFeatures?: string[];
}

export interface GuideModule {
  id: string;
  title: string;
  pageRoute: string;
  iconName: string;
  description: string;
  quickTips: string[];
  faqs: GuideFAQ[];
}

export interface RoleManual {
  role: Role;
  roleLabel: string;
  portalTitle: string;
  description: string;
  homeRoute: string;
  modules: GuideModule[];
}
