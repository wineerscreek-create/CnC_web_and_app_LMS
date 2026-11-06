'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Linkedin,
  Youtube,
  Twitter,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Building2,
  Mail,
  Send,
} from 'lucide-react';
import { CNCLogo } from '@/components/ui/CNCLogo';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/api';
import { toast } from 'sonner';

// Social links configuration
const SOCIAL_LINKS = [
  {
    name: 'LinkedIn',
    href: 'https://linkedin.com/company/winners-creek-lms',
    icon: Linkedin,
    hoverClass: 'hover:text-[#0a66c2]',
    primary: true,
  },
  {
    name: 'YouTube',
    href: 'https://youtube.com/@winnerscreeklms',
    icon: Youtube,
    hoverClass: 'hover:text-[#ff0000]',
    primary: false,
  },
  {
    name: 'X (Twitter)',
    href: 'https://twitter.com/winnerscreek',
    icon: Twitter,
    hoverClass: 'hover:text-[#1da1f2]',
    primary: false,
  },
];

export function SiteFooter() {
  const [email, setEmail] = React.useState('');
  const [subscribing, setSubscribing] = React.useState(false);
  const [subscribed, setSubscribed] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error('Please enter your email address.');
      return;
    }

    setSubscribing(true);
    setMessage(null);
    try {
      const res: any = await api.post('/public/newsletter/subscribe', { email: cleanEmail });
      setSubscribed(true);
      setMessage(res.message || 'Thank you for subscribing!');
      toast.success(res.message || 'Thank you for subscribing!');
      setEmail('');
    } catch (err) {
      const msg = (err as ApiError).message || 'Failed to subscribe.';
      setMessage(msg);
      toast.error(msg);
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <footer className="relative mt-24 border-t border-slate-800 bg-[#0a0f1d] text-slate-300 overflow-hidden">
      {/* Top Specular Brand Accent Line */}
      <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

      {/* Main 4-Column Layout */}
      <div className="mx-auto max-w-[1240px] px-6 py-14 sm:py-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Brand & Social Presence */}
          <div className="space-y-4">
            <CNCLogo variant="footer" />
            <p className="text-xs leading-relaxed text-slate-400 max-w-[280px]">
              Building communication, critical thinking and workplace-ready skills through structured learning and practical simulations.
            </p>

            {/* Social Icons */}
            <div className="pt-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                Connect With Us
              </span>
              <div className="flex items-center gap-3">
                {SOCIAL_LINKS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <a
                      key={item.name}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex size-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 transition-all ${item.hoverClass} hover:border-slate-600 hover:scale-105`}
                      aria-label={item.name}
                    >
                      <Icon className="size-4" />
                    </a>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-400">
              <ShieldCheck className="size-4 text-emerald-400 shrink-0" />
              <span>Accredited Academic Ecosystem</span>
            </div>
          </div>

          {/* Column 2: Explore */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Explore
            </h2>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-400">
              <li>
                <Link href="/courses" className="hover:text-amber-400 transition-colors">
                  All Courses
                </Link>
              </li>
              <li>
                <Link href="/contact?type=trainer" className="hover:text-amber-400 transition-colors">
                  Become a Trainer
                </Link>
              </li>
              <li>
                <Link href="/about#success-stories" className="hover:text-amber-400 transition-colors">
                  Success Stories
                </Link>
              </li>
              <li>
                <Link href="/testimonials" className="hover:text-amber-400 transition-colors">
                  Testimonials
                </Link>
              </li>
              <li>
                <Link href="/faq" className="hover:text-amber-400 transition-colors">
                  FAQs
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Support & Legal */}
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-white">
              Support &amp; Legal
            </h2>
            <ul className="mt-4 space-y-2.5 text-xs text-slate-400">
              <li>
                <Link href="/contact" className="hover:text-amber-400 transition-colors">
                  Help &amp; Support
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-amber-400 transition-colors">
                  Contact Us
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-amber-400 transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-amber-400 transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/refund-policy" className="hover:text-amber-400 transition-colors">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Corporate Connect & Newsletter */}
          <div className="space-y-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-white">
                Corporate Training Solutions
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">
                Build a workplace-ready workforce with structured soft skills and professional development programs.
              </p>
            </div>

            {/* Corporate Action Links */}
            <div className="flex flex-col gap-2 pt-1">
              <Button asChild size="sm" variant="primary" className="rounded-xl text-xs font-bold w-fit">
                <Link href="/contact?type=corporate">
                  Request Corporate Training
                  <ArrowRight className="size-3.5 ml-1" />
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary" className="rounded-xl text-xs font-semibold w-fit border-slate-700 bg-slate-900 text-slate-300 hover:text-white hover:border-slate-600">
                <Link href="/contact">
                  Contact Our Team
                </Link>
              </Button>
            </div>

            {/* Newsletter Subscription */}
            <div className="pt-2 border-t border-slate-800">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Stay Updated
              </p>
              <form onSubmit={handleSubscribe} className="mt-2 flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="size-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    className="w-full rounded-xl border border-slate-700 bg-slate-900/90 py-1.5 pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <Button
                  type="submit"
                  size="sm"
                  variant="primary"
                  loading={subscribing}
                  className="rounded-xl text-xs px-3 font-bold"
                >
                  <Send className="size-3" />
                </Button>
              </form>
              {message && (
                <p className={`mt-1.5 text-[11px] ${subscribed ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {message}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Copyright Bar */}
      <div className="border-t border-slate-800/80 bg-[#070b16] px-6 py-5">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-400">
          <p>© 2026 Winners Creek. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy Policy
            </Link>
            <span className="text-slate-700">·</span>
            <Link href="/terms" className="hover:text-white transition-colors">
              Terms of Service
            </Link>
            <span className="text-slate-700">·</span>
            <span className="text-slate-500">Enterprise academic employability platform powered by SkillSharp.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

