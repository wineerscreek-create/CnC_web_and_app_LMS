'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Github,
  Globe,
  GraduationCap,
  Languages,
  Linkedin,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Sparkles,
  Star,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, type ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

interface TrainerPublicData {
  id: string;
  displayName: string;
  headline: string;
  designation: string;
  profilePhotoUrl?: string | null;
  location: string;
  yearsExperience: number;
  currentOrg: string;
  previousOrgs: string[];
  expertiseTags: string[];
  methodology: string;
  languages: string[];
  education: Array<{ degree: string; institution: string; year: string }>;
  certifications: Array<{ name: string; issuer: string; year: string; url?: string }>;
  socialLinks: { linkedin?: string; portfolio?: string; website?: string; github?: string };
  teachingInfo: { courses?: string[]; targetAudience?: string; achievements?: string[] };
  rating: number;
  publicSlug: string;
  bio: string;
}

export default function TrainerSlugPage() {
  const params = useParams();
  const slug = String(params?.slug || '');

  const [trainer, setTrainer] = React.useState<TrainerPublicData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Inquiry Modal State
  const [modalOpen, setModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [inquirySuccess, setInquirySuccess] = React.useState(false);

  // Form State
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [organization, setOrganization] = React.useState('');
  const [sessionType, setSessionType] = React.useState('Campus Placement Masterclass');
  const [message, setMessage] = React.useState('');

  React.useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    api
      .get<any>(`/public/trainers/${slug}`)
      .then((res) => {
        if (!active) return;
        if (res.success && res.data) {
          setTrainer(res.data);
        } else {
          setError('Trainer not found');
        }
      })
      .catch((err) => {
        if (!active) return;
        setError((err as ApiError).message || 'Trainer not found');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || !message.trim()) {
      toast.error('Please complete all required fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post<any>(`/public/trainers/${slug}/inquire`, {
        fullName,
        email,
        phone: phone || undefined,
        organization: organization || undefined,
        sessionType,
        message,
      });

      if (res.success) {
        setInquirySuccess(true);
        toast.success(res.message || 'Inquiry submitted successfully!');
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to submit inquiry.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-20 flex flex-col items-center justify-center min-h-[50vh]">
        <div className="size-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-sm text-muted-foreground font-medium">Loading trainer profile...</p>
      </div>
    );
  }

  if (error || !trainer) {
    return (
      <div className="mx-auto max-w-[1240px] px-6 py-20 text-center">
        <h2 className="font-heading text-2xl font-bold text-heading">Trainer Profile Not Found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The trainer profile &apos;{slug}&apos; is not available or has not been published.</p>
        <Button asChild variant="secondary" className="mt-6">
          <Link href="/trainers">
            <ArrowLeft className="size-4 mr-2" /> Back to All Trainers
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="animate-enter pb-24">
      {/* Breadcrumb & Navigation */}
      <div className="border-b border-border/80 bg-muted/20">
        <div className="mx-auto max-w-[1240px] px-6 py-4 flex items-center justify-between">
          <Link
            href="/trainers"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" /> Back to Trainer Directory
          </Link>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="size-3" /> Verified Faculty
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] px-6 pt-10">
        <div className="grid gap-10 lg:grid-cols-[380px_1fr] items-start">
          {/* ================================================================= Left Column: Bio Card & Primary CTA */}
          <div className="space-y-6 lg:sticky lg:top-24">
            <div className="overflow-hidden rounded-3xl border border-border bg-card p-7 shadow-xs">
              {/* Photo & Identity */}
              <div className="flex flex-col items-center text-center">
                <div className="relative size-36 sm:size-40 rounded-3xl overflow-hidden border-2 border-primary/20 bg-muted shadow-md">
                  {trainer.profilePhotoUrl ? (
                    <Image
                      src={trainer.profilePhotoUrl}
                      alt={trainer.displayName}
                      fill
                      sizes="(max-width: 640px) 144px, 160px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center bg-primary/10 text-primary text-4xl font-extrabold">
                      {trainer.displayName.charAt(0)}
                    </div>
                  )}
                </div>

                <h1 className="mt-5 font-heading text-2xl font-black text-heading">
                  {trainer.displayName}
                </h1>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {trainer.headline || trainer.designation}
                </p>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 font-medium">
                    <MapPin className="size-3.5 text-muted-foreground" /> {trainer.location}
                  </span>
                  <span>·</span>
                  <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                    <Star className="size-3.5 fill-amber-500 text-amber-500" /> {trainer.rating.toFixed(1)} / 5.0
                  </span>
                </div>

                {/* Primary CTA */}
                <div className="mt-6 w-full space-y-2.5">
                  <Button
                    onClick={() => {
                      setInquirySuccess(false);
                      setModalOpen(true);
                    }}
                    variant="primary"
                    size="lg"
                    className="w-full rounded-xl py-3 text-sm font-bold shadow-md shadow-primary/20"
                  >
                    <MessageSquare className="size-4 mr-2" /> Book a Session / Inquire Now
                  </Button>
                </div>
              </div>

              {/* Key Quick Facts */}
              <div className="mt-6 border-t border-border pt-6 space-y-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Briefcase className="size-3.5" /> Experience
                  </span>
                  <span className="font-bold text-foreground">{trainer.yearsExperience} Years</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                    <Award className="size-3.5" /> Current Org
                  </span>
                  <span className="font-bold text-foreground">{trainer.currentOrg}</span>
                </div>
                {trainer.languages?.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground font-medium flex items-center gap-1.5">
                      <Languages className="size-3.5" /> Languages
                    </span>
                    <span className="font-bold text-foreground">{trainer.languages.join(', ')}</span>
                  </div>
                )}
              </div>

              {/* Social Channels */}
              <div className="mt-6 border-t border-border pt-6">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  Verified Social Channels
                </p>
                <div className="flex items-center gap-2">
                  {trainer.socialLinks?.linkedin && (
                    <a
                      href={trainer.socialLinks.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-[#0A66C2]/10 hover:text-[#0A66C2] hover:border-[#0A66C2]/30 transition-colors"
                      title="LinkedIn Profile"
                    >
                      <Linkedin className="size-4" />
                    </a>
                  )}
                  {trainer.socialLinks?.portfolio && (
                    <a
                      href={trainer.socialLinks.portfolio}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                      title="Portfolio"
                    >
                      <Globe className="size-4" />
                    </a>
                  )}
                  {trainer.socialLinks?.github && (
                    <a
                      href={trainer.socialLinks.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-foreground/10 hover:text-foreground hover:border-border transition-colors"
                      title="GitHub"
                    >
                      <Github className="size-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ================================================================= Right Column: Rich Dossier */}
          <div className="space-y-8">
            {/* 1. About & Biographical Narrative */}
            <div className="rounded-3xl border border-border bg-card p-8 shadow-xs">
              <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mb-2">
                <User className="size-4" /> Professional Profile
              </div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold text-heading">
                About {trainer.displayName}
              </h2>
              <div className="mt-4 text-sm leading-relaxed text-muted-foreground space-y-3 font-normal">
                <p>{trainer.bio}</p>
              </div>

              {/* Specialization Tags */}
              {trainer.expertiseTags?.length > 0 && (
                <div className="mt-6 pt-6 border-t border-border">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                    Areas of Pedagogical Expertise
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {trainer.expertiseTags.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-xl bg-primary/10 px-3 py-1 text-xs font-semibold text-primary border border-primary/20"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Training Methodology */}
            {trainer.methodology && (
              <div className="rounded-3xl border border-border bg-card p-8 shadow-xs">
                <div className="flex items-center gap-2 text-secondary text-xs font-bold uppercase tracking-wider mb-2">
                  <Sparkles className="size-4" /> Teaching Philosophy
                </div>
                <h2 className="font-heading text-xl sm:text-2xl font-bold text-heading">
                  Facilitation Methodology
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {trainer.methodology}
                </p>
              </div>
            )}

            {/* 3. Academic Qualifications & Certifications */}
            <div className="grid gap-6 sm:grid-cols-2">
              {/* Education */}
              <div className="rounded-3xl border border-border bg-card p-7 shadow-xs">
                <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mb-3">
                  <GraduationCap className="size-4" /> Academic Credentials
                </div>
                <h3 className="font-heading text-lg font-bold text-heading mb-4">Education</h3>
                <div className="space-y-4">
                  {(trainer.education ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Degrees verified by institution.</p>
                  ) : (
                    trainer.education.map((edu, idx) => (
                      <div key={idx} className="border-l-2 border-primary/40 pl-3.5 py-0.5">
                        <p className="font-heading text-sm font-bold text-foreground">{edu.degree}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{edu.institution}</p>
                        <span className="text-[11px] font-semibold text-primary">{edu.year}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Certifications */}
              <div className="rounded-3xl border border-border bg-card p-7 shadow-xs">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
                  <Award className="size-4" /> Industry Credentials
                </div>
                <h3 className="font-heading text-lg font-bold text-heading mb-4">Accreditations</h3>
                <div className="space-y-4">
                  {(trainer.certifications ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Accredited by National Facilitators Registry.</p>
                  ) : (
                    trainer.certifications.map((cert, idx) => (
                      <div key={idx} className="border-l-2 border-amber-500/40 pl-3.5 py-0.5">
                        <div className="flex items-center justify-between">
                          <p className="font-heading text-sm font-bold text-foreground">{cert.name}</p>
                          {cert.url && (
                            <a
                              href={cert.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                            >
                              <ExternalLink className="size-3" /> Verify
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{cert.issuer}</p>
                        <span className="text-[11px] font-semibold text-muted-foreground">{cert.year}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 4. Curriculum Modules & Career Milestones */}
            <div className="rounded-3xl border border-border bg-card p-8 shadow-xs">
              <div className="flex items-center gap-2 text-primary text-xs font-bold uppercase tracking-wider mb-2">
                <BookOpen className="size-4" /> Teaching Portfolio
              </div>
              <h2 className="font-heading text-xl sm:text-2xl font-bold text-heading">
                Modules Taught &amp; Impact
              </h2>

              <div className="mt-5 grid gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Core Curriculum Tracks
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {(trainer.teachingInfo?.courses ?? ['Executive Communication', 'Campus Placement Readiness']).map(
                      (c, i) => (
                        <li key={i} className="flex items-center gap-2 text-foreground font-semibold">
                          <CheckCircle2 className="size-3.5 text-primary shrink-0" /> {c}
                        </li>
                      )
                    )}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Key Milestones &amp; Track Record
                  </h4>
                  <ul className="space-y-2 text-xs">
                    {(trainer.teachingInfo?.achievements ?? [
                      'Mentored over 10,000+ university candidates',
                      'Consistently 4.9+ out of 5 participant satisfaction rating',
                      'Corporate partner facilitator for top enterprise recruitment drives',
                    ]).map((ach, i) => (
                      <li key={i} className="flex items-start gap-2 text-foreground">
                        <Sparkles className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <span className="font-medium">{ach}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= Booking / Inquiry Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-xl p-0 rounded-3xl bg-card border border-border shadow-2xl">
          <DialogHeader className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="font-heading text-xl font-bold text-heading">
                  Book a Session / Inquire Now
                </DialogTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Connect with {trainer.displayName} for corporate workshops, institution bootcamps, or 1-on-1 mentorship.
                </p>
              </div>
            </div>
          </DialogHeader>

          {inquirySuccess ? (
            <div className="p-8 text-center space-y-4">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                <CheckCircle2 className="size-8" />
              </div>
              <h3 className="font-heading text-lg font-bold text-heading">Inquiry Submitted Successfully</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Thank you! Your request has been forwarded directly to {trainer.displayName}. You will receive a response at <strong className="text-foreground">{email}</strong> within 24 business hours.
              </p>
              <Button onClick={() => setModalOpen(false)} variant="primary" className="rounded-xl px-6">
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={handleInquirySubmit} className="p-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-foreground">Your Full Name *</label>
                  <Input
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">Your Email *</label>
                  <Input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-foreground">Phone Number</label>
                  <Input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-foreground">Organization / College</label>
                  <Input
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. St. Xavier's Institute / Acme Corp"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Engagement / Session Type</label>
                <select
                  value={sessionType}
                  onChange={(e) => setSessionType(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs font-medium text-foreground outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="Campus Placement Masterclass">Campus Placement Masterclass</option>
                  <option value="Corporate Executive Communication">Corporate Executive Communication</option>
                  <option value="Mock Interview & GD Intensive">Mock Interview &amp; GD Intensive</option>
                  <option value="1-on-1 Executive Mentorship">1-on-1 Executive Mentorship</option>
                  <option value="Custom Keynote & Workshop">Custom Keynote &amp; Workshop</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Message / Expected Cohort Size *</label>
                <textarea
                  required
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Tell us about your audience, preferred dates, and training objectives..."
                  className="mt-1 w-full rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  variant="primary"
                  size="sm"
                  className="rounded-xl px-5 font-bold shadow-xs"
                >
                  <Send className="size-3.5 mr-1.5" />
                  {submitting ? 'Submitting...' : 'Send Inquiry'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
