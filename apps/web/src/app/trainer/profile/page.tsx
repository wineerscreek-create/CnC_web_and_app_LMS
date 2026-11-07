'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Award,
  BookOpen,
  Briefcase,
  Camera,
  Check,
  CheckCircle2,
  ExternalLink,
  Globe,
  GraduationCap,
  Layers,
  Linkedin,
  MapPin,
  MessageSquare,
  Plus,
  Save,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { AsyncSection } from '@/components/shared/state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ProgressBar } from '@/components/shared/progress-bits';
import { api, type ApiError } from '@/lib/api';
import { num } from '@/lib/format';
import { cn } from '@/lib/cn';
import { useApi } from '@/hooks/useApi';

export default function TrainerProfilePage() {
  const query = useApi<any>('/trainer/profile');
  const [activeTab, setActiveTab] = React.useState<'basic' | 'professional' | 'education' | 'social' | 'teaching'>('basic');
  const [saving, setSaving] = React.useState(false);
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Form states
  const [displayName, setDisplayName] = React.useState('');
  const [headline, setHeadline] = React.useState('');
  const [designation, setDesignation] = React.useState('');
  const [location, setLocation] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [publicSlug, setPublicSlug] = React.useState('');
  const [isPublished, setIsPublished] = React.useState(true);

  const [bio, setBio] = React.useState('');
  const [yearsExperience, setYearsExperience] = React.useState<number>(5);
  const [currentOrg, setCurrentOrg] = React.useState('');
  const [expertiseInput, setExpertiseInput] = React.useState('');
  const [expertiseTags, setExpertiseTags] = React.useState<string[]>([]);
  const [methodology, setMethodology] = React.useState('');
  const [languagesInput, setLanguagesInput] = React.useState('');
  const [languages, setLanguages] = React.useState<string[]>(['English']);

  // Education & Certifications
  const [education, setEducation] = React.useState<Array<{ degree: string; institution: string; year: string }>>([]);
  const [certifications, setCertifications] = React.useState<Array<{ name: string; issuer: string; year: string; url?: string }>>([]);

  // Social & Teaching
  const [linkedin, setLinkedin] = React.useState('');
  const [portfolio, setPortfolio] = React.useState('');
  const [website, setWebsite] = React.useState('');
  const [github, setGithub] = React.useState('');

  const [coursesInput, setCoursesInput] = React.useState('');
  const [courses, setCourses] = React.useState<string[]>([]);
  const [targetAudience, setTargetAudience] = React.useState('');
  const [achievementsInput, setAchievementsInput] = React.useState('');
  const [achievements, setAchievements] = React.useState<string[]>([]);

  const [profilePhotoUrl, setProfilePhotoUrl] = React.useState<string | null>(null);
  const [completionPercent, setCompletionPercent] = React.useState<number>(0);

  // Populate from query data
  React.useEffect(() => {
    if (query.data) {
      const d = query.data;
      setDisplayName(d.displayName || d.name || '');
      setHeadline(d.headline || '');
      setDesignation(d.designation || 'Corporate Trainer');
      setLocation(d.location || 'New Delhi, India');
      setPhone(d.phone || '');
      setPublicSlug(d.publicSlug || '');
      setIsPublished(d.isPublished !== false);
      setBio(d.bio || '');
      setYearsExperience(d.yearsExperience ?? 5);
      setCurrentOrg(d.currentOrg || 'Winners Creek LMS');
      setExpertiseTags(d.expertiseTags || []);
      setMethodology(d.methodology || '');
      setLanguages(d.languages || ['English']);
      setEducation(d.education || []);
      setCertifications(d.certifications || []);
      setLinkedin(d.socialLinks?.linkedin || '');
      setPortfolio(d.socialLinks?.portfolio || '');
      setWebsite(d.socialLinks?.website || '');
      setGithub(d.socialLinks?.github || '');
      setCourses(d.teachingInfo?.courses || []);
      setTargetAudience(d.teachingInfo?.targetAudience || '');
      setAchievements(d.teachingInfo?.achievements || []);
      setProfilePhotoUrl(d.profilePhotoUrl || null);
      setCompletionPercent(d.completionPercent || 0);
    }
  }, [query.data]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must not exceed 5 MB.');
      return;
    }

    setUploadingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post<any>('/trainer/profile/photo', formData);
      if (res.success && res.data?.profilePhotoUrl) {
        setProfilePhotoUrl(res.data.profilePhotoUrl);
        toast.success('Profile avatar updated successfully!');
        query.refetch();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to upload avatar');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload = {
        displayName,
        headline,
        designation,
        location,
        phone,
        publicSlug,
        isPublished,
        bio,
        yearsExperience: Number(yearsExperience),
        currentOrg,
        expertiseTags,
        methodology,
        languages,
        education,
        certifications,
        socialLinks: {
          linkedin: linkedin.trim() || undefined,
          portfolio: portfolio.trim() || undefined,
          website: website.trim() || undefined,
          github: github.trim() || undefined,
        },
        teachingInfo: {
          courses,
          targetAudience,
          achievements,
        },
      };

      const res = await api.patch<any>('/trainer/profile', payload);
      if (res.success) {
        toast.success('Trainer profile updated successfully!');
        if (res.data?.completionPercent !== undefined) {
          setCompletionPercent(res.data.completionPercent);
        }
        query.refetch();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to save trainer profile');
    } finally {
      setSaving(false);
    }
  };

  const addTag = (
    val: string,
    setVal: React.Dispatch<React.SetStateAction<string>>,
    list: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const trimmed = val.trim();
    if (trimmed && !list.includes(trimmed)) {
      setList([...list, trimmed]);
      setVal('');
    }
  };

  const removeTag = (tag: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    setList(list.filter((t) => t !== tag));
  };

  return (
    <AsyncSection query={query} skeleton="detail">
      {(data) => (
        <div className="space-y-6 animate-enter">
          {/* Top Hero Banner & Profile Status */}
          <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xs">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                {/* Photo Upload Area */}
                <div className="relative group size-20 sm:size-24 rounded-2xl overflow-hidden border-2 border-primary/30 bg-muted flex items-center justify-center shrink-0">
                  {profilePhotoUrl ? (
                    <Image
                      src={profilePhotoUrl}
                      alt={displayName}
                      fill
                      sizes="(max-width: 640px) 80px, 96px"
                      className="object-cover"
                    />
                  ) : (
                    <User className="size-10 text-muted-foreground" />
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhoto}
                    className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[10px] font-medium"
                  >
                    <Camera className="size-5 mb-0.5" />
                    {uploadingPhoto ? 'Uploading...' : 'Change'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </div>

                {/* Name & Headline */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="font-heading text-xl sm:text-2xl font-bold text-foreground truncate">
                      {displayName || 'Faculty Trainer'}
                    </h1>
                    {isPublished && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 className="size-3" /> Published
                      </span>
                    )}
                  </div>
                  <p className="text-xs sm:text-sm text-primary font-medium mt-0.5">
                    {headline || designation}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3.5" /> {location}
                    </span>
                    <span>·</span>
                    <span>{yearsExperience} Years Exp</span>
                  </div>
                </div>
              </div>

              {/* Actions & Completion */}
              <div className="flex flex-col sm:items-end gap-3">
                <div className="flex items-center gap-2">
                  {publicSlug && (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/trainers/${publicSlug}`} target="_blank">
                        <ExternalLink className="size-3.5 mr-1" /> View Public Page
                      </Link>
                    </Button>
                  )}
                  <Button
                    onClick={handleSaveProfile}
                    disabled={saving}
                    variant="primary"
                    size="sm"
                    className="shadow-xs"
                  >
                    <Save className="size-3.5 mr-1" />
                    {saving ? 'Saving...' : 'Save Profile'}
                  </Button>
                </div>

                {/* Progress bar */}
                <div className="w-full sm:w-60">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-muted-foreground font-medium">Profile Completeness</span>
                    <span className="font-bold text-foreground">{completionPercent}%</span>
                  </div>
                  <ProgressBar value={completionPercent} className="h-1.5" />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Sessions conducted"
              value={num(data.stats?.sessionsConducted ?? data.sessionsConducted ?? 0)}
              icon={<GraduationCap />}
              tone="charcoal"
            />
            <StatCard
              label="Participant rating"
              value={data.stats?.averageFeedback ?? data.averageFeedback ?? 5.0}
              outOf={5}
              icon={<Star />}
              tone="mustard"
              deltaLabel={`${num(data.stats?.feedbackCount ?? data.feedbackEntries ?? 12)} student reviews`}
            />
            <StatCard
              label="Public Showcase Status"
              value={isPublished ? 'Live in Directory' : 'Draft Mode'}
              icon={<Globe />}
              tone="teal"
              deltaLabel={publicSlug ? `/trainers/${publicSlug}` : 'Slug needed'}
            />
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-border gap-2 overflow-x-auto pb-px">
            {[
              { id: 'basic', label: 'Basic Info', icon: User },
              { id: 'professional', label: 'Professional Bio', icon: Briefcase },
              { id: 'education', label: 'Education & Certifications', icon: Award },
              { id: 'social', label: 'Social & Web', icon: Share2 },
              { id: 'teaching', label: 'Courses & Teaching', icon: BookOpen },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab 1: Basic Info */}
          {activeTab === 'basic' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Basic Information</CardTitle>
                  <CardSubtitle>Identity, designation and public showcase URL slug</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Display Name</label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Monika Sharma"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">Official Email</label>
                    <Input
                      value={data.email || ''}
                      disabled
                      className="mt-1 bg-muted/50 cursor-not-allowed"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Professional Headline</label>
                    <Input
                      value={headline}
                      onChange={(e) => setHeadline(e.target.value)}
                      placeholder="e.g. Lead Communication Coach & Executive Presence Mentor"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">Designation</label>
                    <Input
                      value={designation}
                      onChange={(e) => setDesignation(e.target.value)}
                      placeholder="e.g. Senior Corporate Trainer"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Location</label>
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. New Delhi & Bengaluru, India"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">Contact Phone</label>
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Public URL Slug</label>
                    <div className="mt-1 flex items-center rounded-lg border border-border bg-muted/30 px-3">
                      <span className="text-xs text-muted-foreground">/trainers/</span>
                      <input
                        value={publicSlug}
                        onChange={(e) => setPublicSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                        placeholder="your-name"
                        className="flex-1 bg-transparent px-1 py-2 text-xs font-semibold text-foreground outline-hidden"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <input
                      type="checkbox"
                      id="publish-check"
                      checked={isPublished}
                      onChange={(e) => setIsPublished(e.target.checked)}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <label htmlFor="publish-check" className="text-xs font-medium text-foreground cursor-pointer">
                      Publish profile on the public Winners Creek &quot;Meet Our Expert Trainers&quot; showcase
                    </label>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Tab 2: Professional Info */}
          {activeTab === 'professional' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Professional Background & Methodology</CardTitle>
                  <CardSubtitle>Detailed bio, organizations, specialization tags, and teaching philosophy</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">Biographical Overview</label>
                  <textarea
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Describe your corporate background, achievements, and training track record..."
                    className="mt-1 w-full rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-foreground">Years of Experience</label>
                    <Input
                      type="number"
                      step="0.5"
                      value={yearsExperience}
                      onChange={(e) => setYearsExperience(parseFloat(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-foreground">Current Organization</label>
                    <Input
                      value={currentOrg}
                      onChange={(e) => setCurrentOrg(e.target.value)}
                      placeholder="e.g. Winners Creek Academy"
                      className="mt-1"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Areas of Expertise (Tags)</label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={expertiseInput}
                      onChange={(e) => setExpertiseInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(expertiseInput, setExpertiseInput, expertiseTags, setExpertiseTags);
                        }
                      }}
                      placeholder="Type a skill and press Enter (e.g. Executive Presence, Mock Interviews)"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addTag(expertiseInput, setExpertiseInput, expertiseTags, setExpertiseTags)}
                    >
                      <Plus className="size-4" /> Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {expertiseTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary border border-primary/20"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag, expertiseTags, setExpertiseTags)}
                          className="hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Training Methodology</label>
                  <textarea
                    rows={3}
                    value={methodology}
                    onChange={(e) => setMethodology(e.target.value)}
                    placeholder="Describe how you structure sessions, e.g. experiential simulations, video feedback..."
                    className="mt-1 w-full rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* Tab 3: Education & Certifications */}
          {activeTab === 'education' && (
            <div className="space-y-6">
              {/* Education List */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Academic Qualifications</CardTitle>
                    <CardSubtitle>Degrees and academic institutions</CardSubtitle>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setEducation([...education, { degree: '', institution: '', year: `${new Date().getFullYear()}` }])
                    }
                  >
                    <Plus className="size-3.5 mr-1" /> Add Degree
                  </Button>
                </CardHeader>
                <CardBody className="space-y-3">
                  {education.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">No academic qualifications listed yet.</p>
                  ) : (
                    education.map((edu, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <div className="grid gap-2 sm:grid-cols-3 flex-1">
                          <Input
                            placeholder="Degree (e.g. MBA in HR)"
                            value={edu.degree}
                            onChange={(e) => {
                              const updated = [...education];
                              updated[idx].degree = e.target.value;
                              setEducation(updated);
                            }}
                          />
                          <Input
                            placeholder="Institution (e.g. Delhi University)"
                            value={edu.institution}
                            onChange={(e) => {
                              const updated = [...education];
                              updated[idx].institution = e.target.value;
                              setEducation(updated);
                            }}
                          />
                          <Input
                            placeholder="Year (e.g. 2018)"
                            value={edu.year}
                            onChange={(e) => {
                              const updated = [...education];
                              updated[idx].year = e.target.value;
                              setEducation(updated);
                            }}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEducation(education.filter((_, i) => i !== idx))}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>

              {/* Certifications List */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Professional Certifications</CardTitle>
                    <CardSubtitle>Industry accreditations and credentials</CardSubtitle>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      setCertifications([
                        ...certifications,
                        { name: '', issuer: '', year: `${new Date().getFullYear()}`, url: '' },
                      ])
                    }
                  >
                    <Plus className="size-3.5 mr-1" /> Add Certification
                  </Button>
                </CardHeader>
                <CardBody className="space-y-3">
                  {certifications.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic py-2">No professional certifications listed.</p>
                  ) : (
                    certifications.map((cert, idx) => (
                      <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <div className="grid gap-2 sm:grid-cols-4 flex-1">
                          <Input
                            placeholder="Certification Name"
                            value={cert.name}
                            onChange={(e) => {
                              const updated = [...certifications];
                              updated[idx].name = e.target.value;
                              setCertifications(updated);
                            }}
                          />
                          <Input
                            placeholder="Issuing Body (e.g. ICF, NLP)"
                            value={cert.issuer}
                            onChange={(e) => {
                              const updated = [...certifications];
                              updated[idx].issuer = e.target.value;
                              setCertifications(updated);
                            }}
                          />
                          <Input
                            placeholder="Year (e.g. 2021)"
                            value={cert.year}
                            onChange={(e) => {
                              const updated = [...certifications];
                              updated[idx].year = e.target.value;
                              setCertifications(updated);
                            }}
                          />
                          <Input
                            placeholder="Verification URL (optional)"
                            value={cert.url || ''}
                            onChange={(e) => {
                              const updated = [...certifications];
                              updated[idx].url = e.target.value;
                              setCertifications(updated);
                            }}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setCertifications(certifications.filter((_, i) => i !== idx))}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardBody>
              </Card>
            </div>
          )}

          {/* Tab 4: Social & Web */}
          {activeTab === 'social' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Social Presence & Links</CardTitle>
                  <CardSubtitle>LinkedIn profile (recommended) and portfolio references</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Linkedin className="size-4 text-[#0A66C2]" /> LinkedIn Profile (Compulsory for Showcase)
                  </label>
                  <Input
                    value={linkedin}
                    onChange={(e) => setLinkedin(e.target.value)}
                    placeholder="https://linkedin.com/in/yourprofile"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Globe className="size-4 text-emerald-500" /> Personal Portfolio / Website
                  </label>
                  <Input
                    value={portfolio}
                    onChange={(e) => setPortfolio(e.target.value)}
                    placeholder="https://yourportfolio.com"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <ExternalLink className="size-4 text-primary" /> Alternate Institutional Profile
                  </label>
                  <Input
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://institution.edu/faculty/you"
                    className="mt-1"
                  />
                </div>
              </CardBody>
            </Card>
          )}

          {/* Tab 5: Courses & Teaching */}
          {activeTab === 'teaching' && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Courses, Target Audience & Key Achievements</CardTitle>
                  <CardSubtitle>Curriculum topics handled and career training milestones</CardSubtitle>
                </div>
              </CardHeader>
              <CardBody className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground">Courses & Modules Taught</label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={coursesInput}
                      onChange={(e) => setCoursesInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(coursesInput, setCoursesInput, courses, setCourses);
                        }
                      }}
                      placeholder="Add course title (e.g. Workplace Communication, Campus Interview Prep)"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addTag(coursesInput, setCoursesInput, courses, setCourses)}
                    >
                      <Plus className="size-4" /> Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {courses.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground border border-border"
                      >
                        {c}
                        <button
                          type="button"
                          onClick={() => removeTag(c, courses, setCourses)}
                          className="hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Target Audience</label>
                  <Input
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="e.g. Pre-final & Final Year Engineering Graduates, Emerging Corporate Leaders"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-foreground">Key Milestones & Achievements</label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={achievementsInput}
                      onChange={(e) => setAchievementsInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          addTag(achievementsInput, setAchievementsInput, achievements, setAchievements);
                        }
                      }}
                      placeholder="e.g. Mentored 12,000+ university candidates with 94% placement conversion"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => addTag(achievementsInput, setAchievementsInput, achievements, setAchievements)}
                    >
                      <Plus className="size-4" /> Add
                    </Button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {achievements.map((ach) => (
                      <span
                        key={ach}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 border border-amber-500/20"
                      >
                        {ach}
                        <button
                          type="button"
                          onClick={() => removeTag(ach, achievements, setAchievements)}
                          className="hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          )}

          {/* Bottom Save Action */}
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              variant="primary"
              size="md"
              className="shadow-md"
            >
              <Save className="size-4 mr-1.5" />
              {saving ? 'Saving changes...' : 'Save Profile Changes'}
            </Button>
          </div>
        </div>
      )}
    </AsyncSection>
  );
}
