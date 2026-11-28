'use client';

import {ArrowLeft, MapPin, Play, Image as ImageIcon, User} from 'lucide-react';
import React from 'react';
import {str, type Business, type Editorial, type Media, type Settings} from '../lib/model';
import {categoryIcon} from './Icons';

function renderInline(text: string): (string | React.ReactElement)[] {
  const parts: (string | React.ReactElement)[] = [];
  const regex = /(\*\*[^*]+\*\*|!\[([^\]]*)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[0].startsWith('![')) {
      parts.push(<img key={m.index} src={m[3]} alt={m[2] || ''} loading="lazy" className="md-inline-image" />);
    } else {
      parts.push(<strong key={m.index}>{m[0].slice(2, -2)}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderMarkdown(body: string) {
  const lines = body.split('\n');
  const blocks: React.ReactElement[] = [];
  let i = 0;
  let listItems: string[] = [];
  const flushList = () => {
    if (listItems.length) {
      blocks.push(<ul key={`ul-${blocks.length}`}>{listItems.map((li, j) => <li key={j}>{renderInline(li)}</li>)}</ul>);
      listItems = [];
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { flushList(); i++; continue; }
    const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (h) { flushList(); const level = h[1].length; const Tag = (`h${level + 2}`) as any; blocks.push(<Tag key={`h-${i}`}>{renderInline(h[2])}</Tag>); i++; continue; }
    if (/^[-*]\s+/.test(trimmed)) { listItems.push(trimmed.replace(/^[-*]\s+/, '')); i++; continue; }
    const img = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) { flushList(); blocks.push(<figure key={`img-${i}`} className="md-figure"><img src={img[2]} alt={img[1] || ''} loading="lazy" /></figure>); i++; continue; }
    flushList();
    blocks.push(<p key={`p-${i}`}>{renderInline(trimmed)}</p>);
    i++;
  }
  flushList();
  return blocks;
}

function mediaSynthetic(url: string, name: string, alt?: string, business_id = 'site-assets'): Media {
  const isVideo = /\.(mp4|webm)(\?|$)/i.test(url);
  return { business_id, filename: '', url, source_url: '', license: '', attribution: '', permission_status: 'approved', cover: true, alt: alt || name, kind: isVideo ? 'video' : 'image', thumbnail: isVideo ? url + (url.includes('?') ? '&' : '?') + 'thumb=1' : undefined };
}

function galleryUrls(guide: Editorial): string[] {
  return (guide.gallery || '').split(/[\s,]+/).filter(Boolean);
}

function authorLabel(guide: Editorial) {
  if (!guide.author) return '';
  const type = guide.authorType === 'agent' ? 'IslaVista agent' : guide.authorType === 'community' ? 'Community contributor' : 'Local editor';
  return `${guide.author} · ${type}`;
}

export default function GuideDetail({ destination, guide, data }: { destination: string; guide: Editorial; data: any }) {
  const rows: Business[] = data.businesses || [];
  const settings: Settings = data.settings;
  const places = (guide.businesses || '').split(/[\s,]+/).filter(Boolean)
    .map(id => rows.find((b: Business) => b.business_id === id)).filter(Boolean) as Business[];
  const gallery = galleryUrls(guide).map(u => mediaSynthetic(u, guide.title, guide.imageAlt));
  const cover = guide.cover ? mediaSynthetic(guide.cover, guide.title, guide.imageAlt) : undefined;
  const coverSrc = cover ? (cover.kind === 'video' ? (cover.thumbnail || cover.url) : cover.url) : '';

  return (
    <article className="guide-detail">
      <div className="guide-detail-topbar">
        <a className="textlink" href={`/${destination}/guides`}><ArrowLeft size={15} /> Back to stories</a>
        {!!guide.category && <span className="ed-tag">{guide.category}</span>}
      </div>

      <header className="guide-detail-hero">
        <figure className="guide-detail-art">
          {coverSrc ? (
            cover?.kind === 'video' ? (
              <video src={cover.url} poster={cover.thumbnail} controls playsInline preload="metadata" />
            ) : (
              <img src={coverSrc} alt={guide.imageAlt || guide.title} />
            )
          ) : (
            <div className="photo-placeholder" role="img" aria-label="No image available"><span /></div>
          )}
          {!!guide.coverCaption && <figcaption>{guide.coverCaption}</figcaption>}
        </figure>
        <div className="guide-detail-copy">
          <p className="eyebrow">{guide.category || 'Story'}{guide.featured ? ' · Featured' : ''}</p>
          <h1>{guide.title}</h1>
          {!!guide.excerpt && <p className="guide-detail-lede">{guide.excerpt}</p>}
          {!!authorLabel(guide) && (
            <p className="guide-detail-byline"><User size={14} /> {authorLabel(guide)}</p>
          )}
        </div>
      </header>

      {!!guide.body && (
        <section className="guide-detail-body">
          {renderMarkdown(guide.body)}
        </section>
      )}

      {gallery.length > 0 && (
        <section className="guide-detail-gallery">
          <div className="section-head"><div><h2>Photos and video</h2><p>Moments from this story.</p></div></div>
          <div className="guide-gallery-grid">
            {gallery.map((m, i) => (
              <figure key={i} className="guide-gallery-item">
                {m.kind === 'video' ? (
                  <video src={m.url} poster={m.thumbnail} controls playsInline preload="metadata" />
                ) : (
                  <img src={m.url} alt={m.alt || guide.title} loading="lazy" />
                )}
                <span className="guide-gallery-badge">{m.kind === 'video' ? 'Video' : 'Photo'}</span>
              </figure>
            ))}
          </div>
        </section>
      )}

      {places.length > 0 && (
        <section className="guide-detail-places">
          <div className="section-head"><div><h2>Places in this story</h2><p>Tap a place to see details or open it on the map.</p></div></div>
          <div className="guide-places-list">
            {places.map(place => {
              const Icon = categoryIcon(str(place.category));
              return (
                <div key={place.business_id} className="guide-place-card">
                  <div className="guide-place-icon"><Icon size={18} /></div>
                  <div className="guide-place-copy">
                    <strong>{place.name}</strong>
                    <span>{str(place.barangay) || str(place.municipality) || str(place.category)}</span>
                  </div>
                  <div className="guide-place-actions">
                    <a className="textlink" href={`/${destination}/place/${place.business_id}`}><MapPin size={14} /> Details</a>
                    <a className="textlink" href={`/${destination}/explore`}><MapPin size={14} /> Map</a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="guide-detail-footer">
        <a className="primary" href={`/${destination}/guides`}><ArrowLeft size={15} /> Back to all stories</a>
      </footer>
    </article>
  );
}
