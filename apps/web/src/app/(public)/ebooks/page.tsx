'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { BookOpen, Clock, Download, FileText, Filter, Search, Sparkles, Star } from 'lucide-react';

import { SearchInput } from '@/components/shared/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';

export default function PublicEbooksPage() {
  const [search, setSearch] = React.useState('');
  const [category, setCategory] = React.useState('all');

  const { data, initialLoading } = useApi<{
    items: any[];
    categories: any[];
    total: number;
  }>(
    '/ebooks',
    { search, category: category !== 'all' ? category : undefined, limit: 30 },
    {
      select: (raw) => ({
        items: raw.data,
        categories: raw.meta?.categories ?? [],
        total: raw.meta?.total ?? 0,
      }),
    }
  );

  const categories = data?.categories ?? [];
  const books = data?.items ?? [];

  return (
    <div className="animate-enter pb-20">
      {/* ------------------------------------------------------------------ Hero Header */}
      <section className="relative py-12 sm:py-16">
        <div className="relative mx-auto max-w-[1180px] px-5">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-muted text-primary border border-border">
              <BookOpen className="size-4" />
            </span>
            <Badge tone="mustard">
              Community Publishing & Digital Library
            </Badge>
          </div>
          <h1 className="mt-4 font-serif heading-hero text-heading max-w-[700px]">
            Explore SkillSharp eBooks
          </h1>
          <p className="mt-4 max-w-[640px] text-base sm:text-lg leading-relaxed text-muted-foreground">
            Read verified handbooks, technical interview roadmaps, and college syllabus guides published
            by our educators and learners. Preview the first 5 pages free anytime.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ Catalog Grid */}
      <div className="mx-auto max-w-[1180px] px-5 pt-8">
        {/* Search & Category Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-border">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Search by title, author, or keywords…"
            className="w-full sm:w-[360px]"
          />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setCategory('all')}
              className={cn(
                'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
                category === 'all'
                  ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              All eBooks
            </button>
            {categories.map((cat: any) => (
              <button
                key={cat.slug}
                type="button"
                onClick={() => setCategory(cat.name)}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95',
                  category === cat.name
                    ? 'border-accent bg-accent text-accent-foreground shadow-xs'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Books Grid */}
        <div className="mt-8 grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {books.map((book: any) => (
            <Link key={book.id} href={`/ebooks/${book.id}`} className="group">
              <Card className="h-full card-interactive flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-accent hover:shadow-card-hover">
                {/* Book Cover Image Container */}
                <div className="relative aspect-[3/4] w-full overflow-hidden bg-muted flex items-center justify-center">
                  {book.coverUrl ? (
                    <Image
                      src={book.coverUrl}
                      alt={book.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-6 text-center text-foreground">
                      <BookOpen className="size-12 text-primary mb-2" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-gold-text">
                        {book.category}
                      </span>
                      <p className="mt-2 text-sm font-bold line-clamp-3 text-heading">{book.title}</p>
                    </div>
                  )}
                  <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 items-end">
                    {book.isPinned && (
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground shadow-xs">
                        Pinned
                      </span>
                    )}
                    {book.isFeatured && (
                      <span className="rounded-md bg-primary px-2 py-0.5 text-[10px] font-bold uppercase text-primary-foreground shadow-xs">
                        Featured
                      </span>
                    )}
                  </div>
                  <div className="absolute bottom-2.5 left-2.5">
                    <span className="rounded-md bg-card/90 backdrop-blur-sm px-2 py-0.5 text-[10px] font-medium text-foreground border border-border">
                      5 Pages Free Preview
                    </span>
                  </div>
                </div>

                <CardBody className="flex flex-1 flex-col p-4">
                  <div className="flex items-center justify-between text-2xs">
                    <span className="font-bold uppercase tracking-wider text-gold-text">
                      {book.category}
                    </span>
                    <span className="text-muted-foreground">{book.pageCount} Pages</span>
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-heading line-clamp-2 group-hover:text-primary transition-colors">
                    {book.title}
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground truncate">by {book.author}</p>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {book.shortDescription}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-4 border-t border-border text-2xs text-muted-foreground">
                    <div className="flex items-center gap-1 text-gold-text font-semibold">
                      <Star className="size-3 fill-accent text-accent" />
                      <span>{book.averageRating || '5.0'}</span>
                    </div>
                    <span className="text-primary font-medium group-hover:underline">Read eBook →</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}

          {initialLoading &&
            Array.from({ length: 8 }).map((_, index) => (
              <Card key={index} className="h-[340px] animate-pulse bg-muted" />
            ))}
        </div>

        {/* Empty State */}
        {!initialLoading && books.length === 0 && (
          <div className="py-16 text-center">
            <BookOpen className="mx-auto size-12 text-muted-foreground" />
            <h3 className="mt-4 text-base font-bold text-heading">No eBooks found</h3>
            <p className="mt-1 text-sm text-muted-foreground">Try adjusting your search terms or category filter.</p>
          </div>
        )}
      </div>
    </div>
  );
}

