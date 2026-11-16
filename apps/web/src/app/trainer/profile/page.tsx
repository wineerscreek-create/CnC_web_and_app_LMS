'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Award,
  BookOpen,
  Briefcase,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Download,
  Eye,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Layers,
  Linkedin,
  MapPin,
  MessageSquare,
  Paperclip,
  Plus,
  Save,
  Share2,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
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
import { useAppDispatch } from '@/store';
import { userUpdated } from '@/store/authSlice';

export default function TrainerProfilePage() {
  const dispatch = useAppDispatch();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode') === 'edit' ? 'edit' : 'view';

  const query = useApi<any>('/trainer/profile');
  const [viewMode, setViewMode] = React.useState<'view' | 'edit'>(initialMode);
  const [activeTab, setActiveTab] = React.useState<'basic' | 'professional' | 'media' | 'education' | 'social' | 'teaching'>('basic');
  const [saving, setSaving] = React.useState(false);

  // Upload states
  const [uploadingPhoto, setUploadingPhoto] = React.useState(false);
  const [uploadingResume, setUploadingResume] = React.useState(false);
  const [uploadingTeachingPhoto, setUploadingTeachingPhoto] = React.useState(false);

  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const resumeInputRef = React.useRef<HTMLInputElement | null>(null);
  const teachingPhotoInputRef = React.useRef<HTMLInputElement | null>(null);

  // Form states
  const [displayName, setDisplayName] = React.useState('');
  const [headline, setHeadline] = React.useState('');
  const [designation, setDesignation] = React.useState('');
  const [joiningYear, setJoiningYear] = React.useState<number | ''>('');
  const [location, setLocation] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [publicSlug, setPublicSlug] = React.useState('');
  const [isPublished, setIsPublished] = React.useState(true);

  // Professional details
  const [bio, setBio] = React.useState('');
  const [yearsExperience, setYearsExperience] = React.useState<number>(5);
  const [currentOrg, setCurrentOrg] = React.useState('');
  const [specialization, setSpecialization] = React.useState('');
  const [expertiseInput, setExpertiseInput] = React.useState('');
  const [expertiseTags, setExpertiseTags] = React.useState<string[]>([]);
  const [methodology, setMethodology] = React.useState('');
  const [languages, setLanguages] = React.useState<string[]>(['English']);

  // Media
  const [resumeUrl, setResumeUrl] = React.useState<string | null>(null);
  const [teachingPhotoUrl, setTeachingPhotoUrl] = React.useState<string | null>(null);
  const [isTestimonialApproved, setIsTestimonialApproved] = React.useState(false);
  const [testimonialQuote, setTestimonialQuote] = React.useState('');

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
      setJoiningYear(d.joiningYear || '');
      setLocation(d.location || 'New Delhi, India');
      setPhone(d.phone || '');
      setPublicSlug(d.publicSlug || '');
      setIsPublished(d.isPublished !== false);
      setBio(d.bio || '');
      setYearsExperience(d.yearsExperience ?? 5);
      setCurrentOrg(d.currentOrg || 'Winners Creek LMS');
      setSpecialization(d.specialization || (Array.isArray(d.specializations) ? d.specializations.join(', ') : ''));
      setExpertiseTags(d.expertiseTags || d.skills || []);
      setMethodology(d.methodology || '');
      setLanguages(d.languages || ['English']);
      setResumeUrl(d.resumeUrl || null);
      setTeachingPhotoUrl(d.teachingPhotoUrl || null);
      setIsTestimonialApproved(Boolean(d.isTestimonialApproved));
      setTestimonialQuote(d.testimonialQuote || '');
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

  // Photo Upload
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
        const photoUrl = res.data.profilePhotoUrl;
        setProfilePhotoUrl(photoUrl);
        dispatch(userUpdated({ avatarUrl: photoUrl }));
        toast.success('Profile photo updated successfully!');
        query.refetch();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Resume Upload
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Only PDF documents are accepted for resumes.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Resume PDF size must not exceed 10 MB.');
      return;
    }

    setUploadingResume(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post<any>('/trainer/profile/resume', formData);
      if (res.success && res.data?.resumeUrl) {
        setResumeUrl(res.data.resumeUrl);
        toast.success('Resume PDF uploaded successfully!');
        query.refetch();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to upload resume');
    } finally {
      setUploadingResume(false);
      if (resumeInputRef.current) resumeInputRef.current.value = '';
    }
  };

  // Teaching Photo Upload
  const handleTeachingPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Teaching photo size must not exceed 5 MB.');
      return;
    }

    setUploadingTeachingPhoto(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post<any>('/trainer/profile/teaching-photo', formData);
      if (res.success && res.data?.teachingPhotoUrl) {
        setTeachingPhotoUrl(res.data.teachingPhotoUrl);
        toast.success('Teaching action photo uploaded successfully!');
        query.refetch();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to upload teaching photo');
    } finally {
      setUploadingTeachingPhoto(false);
      if (teachingPhotoInputRef.current) teachingPhotoInputRef.current.value = '';
    }
  };

  // Save Profile Changes
  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const payload = {
        displayName,
        headline,
        designation,
        joiningYear: joiningYear ? Number(joiningYear) : null,
        location,
        phone,
        publicSlug,
        isPublished,
        bio,
        yearsExperience: Number(yearsExperience),
        currentOrg,
        specialization,
        expertiseTags,
        methodology,
        languages,
        testimonialQuote,
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
        dispatch(userUpdated({ name: displayName }));
        query.refetch();
        setViewMode('view');
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
          {/* Top Header with View / Edit Mode Switch */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">Trainer Profile Management</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Manage your public faculty profile, academic qualifications, resume, and teaching showcase.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'view' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode('view')}
              >
                <Eye className="size-3.5 mr-1" /> View Profile
              </Button>
              <Button
                variant={viewMode === 'edit' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setViewMode('edit')}
              >
                <Briefcase className="size-3.5 mr-1" /> Edit Profile
              </Button>
            </div>
          </div>

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
                    title="Change profile photo"
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

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg sm:text-xl font-bold text-foreground">{displayName || 'Trainer Name'}</h2>
                    {isPublished ? (
                      <Badge tone="success" className="text-[10px]">Public Showcase</Badge>
                    ) : (
                      <Badge tone="neutral" className="text-[10px]">Draft</Badge>
                    )}
                    {isTestimonialApproved && (
                      <Badge tone="mustard" className="text-[10px] flex items-center gap-1">
                        <Sparkles className="size-2.5" /> Official Testimonial
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-primary font-semibold">{designation || 'Corporate Trainer'}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <MapPin className="size-3 text-muted-foreground" /> {location || 'India'}
                    </span>
                    {joiningYear && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3 text-muted-foreground" /> Since {joiningYear}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              {/* Action Buttons & Progress Bar */}
              <div className="flex flex-col gap-2 items-start sm:items-end">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Camera className="size-3.5 mr-1" /> Change Photo
                  </Button>
                  {resumeUrl && (
                    <Button
                      size="sm"
                      variant="secondary"
                      asChild
                    >
                      <a href={resumeUrl} target="_blank" rel="noreferrer">
                        <Download className="size-3.5 mr-1" /> View Resume
                      </a>
                    </Button>
                  )}
                </div>

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

          {/* ================================================================ */}
          {/* VIEW PROFILE MODE                                                */}
          {/* ================================================================ */}
          {viewMode === 'view' ? (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Left Column (2 Cols): Details */}
              <div className="space-y-6 lg:col-span-2">
                {/* Professional Overview Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Professional Profile & Bio</CardTitle>
                    <CardSubtitle>About the instructor and core teaching background</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                      {bio || 'No professional bio provided yet. Click "Edit Profile" above to add your background and teaching track record.'}
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-border text-xs">
                      <div>
                        <span className="text-muted-foreground block">Professional Position</span>
                        <span className="font-semibold text-foreground">{designation || 'Trainer'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Total Experience</span>
                        <span className="font-semibold text-foreground">{yearsExperience} Years</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Joining Year</span>
                        <span className="font-semibold text-foreground">{joiningYear || 'Not specified'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Organization</span>
                        <span className="font-semibold text-foreground">{currentOrg || 'Winners Creek LMS'}</span>
                      </div>
                      <div className="sm:col-span-2">
                        <span className="text-muted-foreground block">Specialization</span>
                        <span className="font-semibold text-foreground">{specialization || 'Not specified'}</span>
                      </div>
                    </div>
                  </CardBody>
                </Card>

                {/* Skills & Specialization Tags */}
                <Card>
                  <CardHeader>
                    <CardTitle>Skills & Technical Expertise</CardTitle>
                    <CardSubtitle>Subject matter disciplines and corporate coaching competencies</CardSubtitle>
                  </CardHeader>
                  <CardBody>
                    {expertiseTags.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No skills added yet.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {expertiseTags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary border border-primary/20"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Academic Qualifications & Certifications */}
                <Card>
                  <CardHeader>
                    <CardTitle>Education & Certifications</CardTitle>
                    <CardSubtitle>Academic degrees and verified industry credentials</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Degrees & Qualifications</h4>
                      {education.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No education records provided.</p>
                      ) : (
                        <div className="space-y-2">
                          {education.map((edu, idx) => (
                            <div key={idx} className="flex items-start justify-between p-3 rounded-lg border border-border bg-muted/20">
                              <div>
                                <span className="font-semibold text-xs text-foreground block">{edu.degree}</span>
                                <span className="text-xs text-muted-foreground">{edu.institution}</span>
                              </div>
                              <Badge tone="neutral" className="text-[10px]">{edu.year}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-border">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Certifications</h4>
                      {certifications.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic">No certifications listed.</p>
                      ) : (
                        <div className="space-y-2">
                          {certifications.map((cert, idx) => (
                            <div key={idx} className="flex items-start justify-between p-3 rounded-lg border border-border bg-muted/20">
                              <div>
                                <span className="font-semibold text-xs text-foreground block">{cert.name}</span>
                                <span className="text-xs text-muted-foreground">{cert.issuer}</span>
                              </div>
                              <Badge tone="neutral" className="text-[10px]">{cert.year}</Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardBody>
                </Card>
              </div>

              {/* Right Column (1 Col): Media, Resume & Testimonials */}
              <div className="space-y-6">
                {/* Resume Card */}
                <Card>
                  <CardHeader>
                    <CardTitle>Professional Resume</CardTitle>
                    <CardSubtitle>Curriculum Vitae in PDF format</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    {resumeUrl ? (
                      <div className="p-4 rounded-xl border border-border bg-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <FileText className="size-6 text-primary shrink-0" />
                          <div className="min-w-0">
                            <span className="font-semibold text-xs text-foreground block truncate">Trainer_Resume.pdf</span>
                            <span className="text-[10px] text-muted-foreground">Verified PDF Document</span>
                          </div>
                        </div>
                        <Button size="sm" variant="secondary" asChild>
                          <a href={resumeUrl} target="_blank" rel="noreferrer">
                            <Download className="size-3.5 mr-1" /> View
                          </a>
                        </Button>
                      </div>
                    ) : (
                      <div className="p-4 text-center border border-dashed border-border rounded-xl">
                        <p className="text-xs text-muted-foreground mb-2">No resume uploaded yet.</p>
                        <Button size="sm" variant="secondary" onClick={() => resumeInputRef.current?.click()}>
                          <Upload className="size-3.5 mr-1" /> Upload PDF Resume
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Teaching Photograph */}
                <Card>
                  <CardHeader>
                    <CardTitle>Teaching Action Photo</CardTitle>
                    <CardSubtitle>Instructor conducting training or workshop</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    {teachingPhotoUrl ? (
                      <div className="relative aspect-video w-full rounded-xl overflow-hidden border border-border">
                        <Image
                          src={teachingPhotoUrl}
                          alt="Trainer teaching in action"
                          fill
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="p-6 text-center border border-dashed border-border rounded-xl">
                        <Camera className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                        <p className="text-xs text-muted-foreground mb-2">Optional photograph of you teaching students</p>
                        <Button size="sm" variant="secondary" onClick={() => teachingPhotoInputRef.current?.click()}>
                          <Upload className="size-3.5 mr-1" /> Upload Photo
                        </Button>
                      </div>
                    )}
                  </CardBody>
                </Card>

                {/* Testimonial Showcase Card */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle>Official Testimonial</CardTitle>
                      {isTestimonialApproved ? (
                        <Badge tone="success" className="text-[10px]">Published</Badge>
                      ) : (
                        <Badge tone="neutral" className="text-[10px]">Under Review</Badge>
                      )}
                    </div>
                    <CardSubtitle>Public showcase review status</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    {testimonialQuote ? (
                      <blockquote className="border-l-2 border-primary pl-3 italic text-xs text-foreground">
                        &quot;{testimonialQuote}&quot;
                      </blockquote>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">No testimonial quote submitted.</p>
                    )}
                    <p className="text-[11px] text-muted-foreground pt-2 border-t border-border leading-relaxed">
                      <Shield className="size-3 inline mr-1 text-primary" />
                      Official testimonial publication on the public showcase is exclusively controlled and approved by Super Admin.
                    </p>
                  </CardBody>
                </Card>
              </div>
            </div>
          ) : (
            /* ================================================================ */
            /* EDIT PROFILE MODE                                                */
            /* ================================================================ */
            <div className="space-y-6">
              {/* Tab Navigation */}
              <div className="flex border-b border-border gap-2 overflow-x-auto pb-px">
                {[
                  { id: 'basic', label: 'Basic Info & Position', icon: User },
                  { id: 'professional', label: 'Bio & Skills', icon: Briefcase },
                  { id: 'media', label: 'Resume & Photos', icon: Paperclip },
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
                    <CardTitle>Basic Information & Professional Designation</CardTitle>
                    <CardSubtitle>Identity, institute joining details, and location</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-foreground">Full Display Name</label>
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="e.g. Monika Sharma"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground">Registered Email</label>
                        <Input
                          value={data.email || ''}
                          disabled
                          className="mt-1 bg-muted/50 cursor-not-allowed opacity-75"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-foreground">Professional Position / Designation</label>
                        <Input
                          value={designation}
                          onChange={(e) => setDesignation(e.target.value)}
                          placeholder="e.g. Senior Technical Trainer, AI Specialist"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground">Joining Year</label>
                        <Input
                          type="number"
                          value={joiningYear}
                          onChange={(e) => setJoiningYear(e.target.value ? parseInt(e.target.value) : '')}
                          placeholder="e.g. 2021"
                          className="mt-1"
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
                        <label className="text-xs font-semibold text-foreground">Location</label>
                        <Input
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Jaipur, Rajasthan, India"
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-foreground">Contact Phone</label>
                        <Input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+91 98765 43210"
                          className="mt-1"
                        />
                      </div>
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
                    </div>

                    <div className="flex items-center gap-3 pt-3 border-t border-border">
                      <input
                        type="checkbox"
                        id="publish-check"
                        checked={isPublished}
                        onChange={(e) => setIsPublished(e.target.checked)}
                        className="size-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <label htmlFor="publish-check" className="text-xs font-medium text-foreground cursor-pointer">
                        Publish profile on the public Winners Creek &quot;Meet Our Expert Trainers&quot; directory
                      </label>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Tab 2: Professional Details & Skills */}
              {activeTab === 'professional' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Professional Bio, Specialization & Skills</CardTitle>
                    <CardSubtitle>Detailed background, years of experience, and competencies</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground">Professional Bio</label>
                      <textarea
                        rows={4}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        placeholder="Provide a short professional introduction, track record, and achievements..."
                        className="mt-1 w-full rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-foreground">Total Professional Experience (Years)</label>
                        <Input
                          type="number"
                          step="0.5"
                          value={yearsExperience}
                          onChange={(e) => setYearsExperience(parseFloat(e.target.value) || 0)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground">Specialization (Subjects / Tech Taught)</label>
                        <Input
                          value={specialization}
                          onChange={(e) => setSpecialization(e.target.value)}
                          placeholder="e.g. Machine Learning, Cloud Architecture, Communication"
                          className="mt-1"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-foreground">Professional Skills</label>
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
                          placeholder="Type a skill and press Enter (e.g. Python, Soft Skills, Prompt Engineering)"
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

              {/* Tab 3: Resume & Teaching Media */}
              {activeTab === 'media' && (
                <div className="space-y-6">
                  {/* Resume Upload Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Resume Upload (PDF Only)</CardTitle>
                      <CardSubtitle>Upload your detailed professional CV (up to 10 MB)</CardSubtitle>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <input
                        ref={resumeInputRef}
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={handleResumeUpload}
                      />
                      {resumeUrl ? (
                        <div className="flex items-center justify-between p-4 rounded-xl border border-border bg-muted/20">
                          <div className="flex items-center gap-3">
                            <FileText className="size-6 text-primary shrink-0" />
                            <div>
                              <span className="font-semibold text-xs text-foreground block">Verified Resume PDF</span>
                              <span className="text-[10px] text-muted-foreground">Available to students and institute administration</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" asChild>
                              <a href={resumeUrl} target="_blank" rel="noreferrer">
                                <Download className="size-3.5 mr-1" /> View PDF
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => resumeInputRef.current?.click()}
                              disabled={uploadingResume}
                            >
                              <Upload className="size-3.5 mr-1" /> {uploadingResume ? 'Uploading...' : 'Replace'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-8 text-center border-2 border-dashed border-border rounded-xl">
                          <FileText className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                          <p className="text-xs text-muted-foreground mb-3">Upload your curriculum vitae in PDF format.</p>
                          <Button
                            variant="secondary"
                            onClick={() => resumeInputRef.current?.click()}
                            disabled={uploadingResume}
                          >
                            <Upload className="size-4 mr-1.5" />
                            {uploadingResume ? 'Uploading...' : 'Choose PDF File'}
                          </Button>
                        </div>
                      )}
                    </CardBody>
                  </Card>

                  {/* Teaching Photo Upload Card */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Teaching Photograph</CardTitle>
                      <CardSubtitle>Optional action photograph of you teaching in class or workshop</CardSubtitle>
                    </CardHeader>
                    <CardBody className="space-y-4">
                      <input
                        ref={teachingPhotoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={handleTeachingPhotoUpload}
                      />
                      {teachingPhotoUrl ? (
                        <div className="space-y-3">
                          <div className="relative aspect-video max-w-md rounded-xl overflow-hidden border border-border">
                            <Image
                              src={teachingPhotoUrl}
                              alt="Teaching action"
                              fill
                              className="object-cover"
                            />
                          </div>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => teachingPhotoInputRef.current?.click()}
                            disabled={uploadingTeachingPhoto}
                          >
                            <Camera className="size-3.5 mr-1" /> {uploadingTeachingPhoto ? 'Uploading...' : 'Replace Teaching Photo'}
                          </Button>
                        </div>
                      ) : (
                        <div className="p-8 text-center border-2 border-dashed border-border rounded-xl">
                          <Camera className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                          <p className="text-xs text-muted-foreground mb-3">
                            Upload a high-quality photograph of you teaching in a workshop or laboratory.
                          </p>
                          <Button
                            variant="secondary"
                            onClick={() => teachingPhotoInputRef.current?.click()}
                            disabled={uploadingTeachingPhoto}
                          >
                            <Upload className="size-4 mr-1.5" />
                            {uploadingTeachingPhoto ? 'Uploading...' : 'Upload Teaching Photograph'}
                          </Button>
                        </div>
                      )}
                    </CardBody>
                  </Card>

                  {/* Testimonial Quote Draft */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Testimonial Quote</CardTitle>
                      <CardSubtitle>Quote for the official public showcase (Super Admin approval required)</CardSubtitle>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <textarea
                        rows={3}
                        value={testimonialQuote}
                        onChange={(e) => setTestimonialQuote(e.target.value)}
                        placeholder="Draft a memorable quote about your teaching journey with Winners Creek..."
                        className="w-full rounded-lg border border-border bg-card p-3 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                        <ShieldCheck className="size-4 text-primary" />
                        <span>
                          Current status:{' '}
                          <strong className={isTestimonialApproved ? 'text-primary' : 'text-foreground'}>
                            {isTestimonialApproved ? 'Approved by Super Admin' : 'Pending Super Admin Review'}
                          </strong>
                        </span>
                      </div>
                    </CardBody>
                  </Card>
                </div>
              )}

              {/* Tab 4: Education & Certifications */}
              {activeTab === 'education' && (
                <div className="space-y-6">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Academic Qualifications & Degrees</CardTitle>
                        <CardSubtitle>University education, degrees, and graduation years</CardSubtitle>
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
                                placeholder="Degree (e.g. M.Tech Computer Science)"
                                value={edu.degree}
                                onChange={(e) => {
                                  const updated = [...education];
                                  updated[idx].degree = e.target.value;
                                  setEducation(updated);
                                }}
                              />
                              <Input
                                placeholder="Institution (e.g. IIT Delhi)"
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
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="size-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => setEducation(education.filter((_, i) => i !== idx))}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))
                      )}
                    </CardBody>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle>Professional Certifications</CardTitle>
                        <CardSubtitle>Industry certifications and specialized licenses</CardSubtitle>
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
                        <p className="text-xs text-muted-foreground italic py-2">No certifications listed yet.</p>
                      ) : (
                        certifications.map((cert, idx) => (
                          <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                            <div className="grid gap-2 sm:grid-cols-4 flex-1">
                              <Input
                                placeholder="Certification (e.g. AWS Certified Solutions Architect)"
                                value={cert.name}
                                onChange={(e) => {
                                  const updated = [...certifications];
                                  updated[idx].name = e.target.value;
                                  setCertifications(updated);
                                }}
                              />
                              <Input
                                placeholder="Issuing Body (e.g. Amazon Web Services)"
                                value={cert.issuer}
                                onChange={(e) => {
                                  const updated = [...certifications];
                                  updated[idx].issuer = e.target.value;
                                  setCertifications(updated);
                                }}
                              />
                              <Input
                                placeholder="Year (e.g. 2022)"
                                value={cert.year}
                                onChange={(e) => {
                                  const updated = [...certifications];
                                  updated[idx].year = e.target.value;
                                  setCertifications(updated);
                                }}
                              />
                              <Input
                                placeholder="Credential URL (Optional)"
                                value={cert.url || ''}
                                onChange={(e) => {
                                  const updated = [...certifications];
                                  updated[idx].url = e.target.value;
                                  setCertifications(updated);
                                }}
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="size-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => setCertifications(certifications.filter((_, i) => i !== idx))}
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

              {/* Tab 5: Social & Web Links */}
              {activeTab === 'social' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Professional Links</CardTitle>
                    <CardSubtitle>LinkedIn, website, and portfolio links</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold text-foreground">LinkedIn Profile</label>
                        <Input
                          value={linkedin}
                          onChange={(e) => setLinkedin(e.target.value)}
                          placeholder="https://linkedin.com/in/username"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-foreground">Personal / Faculty Website</label>
                        <Input
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          placeholder="https://yourdomain.com"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Tab 6: Teaching & Courses */}
              {activeTab === 'teaching' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Teaching & Courses</CardTitle>
                    <CardSubtitle>Subjects taught and target audience</CardSubtitle>
                  </CardHeader>
                  <CardBody className="space-y-4">
                    <div>
                      <label className="text-xs font-semibold text-foreground">Courses / Workshops Taught</label>
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
                          placeholder="Type course name and press Enter"
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
                        placeholder="e.g. 3rd and 7th Semester Engineering Students"
                        className="mt-1"
                      />
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Bottom Save Action */}
              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setViewMode('view')}
                >
                  Cancel
                </Button>
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
        </div>
      )}
    </AsyncSection>
  );
}
